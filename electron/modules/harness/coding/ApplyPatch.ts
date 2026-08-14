/**
 * Minimal unified-diff applier for harness sandbox patches.
 * Supports standard `---` / `+++` / `@@` hunks (single- or multi-file).
 */

export interface AppliedPatchFile {
  path: string
  content: string
  hunks: number
}

export interface ApplyPatchResult {
  files: AppliedPatchFile[]
}

interface FilePatch {
  path: string
  hunks: Hunk[]
}

interface Hunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: Array<{ type: 'ctx' | 'add' | 'del'; text: string }>
}

function normalizePath(raw: string): string {
  return raw.replace(/^a\//, '').replace(/^b\//, '').trim()
}

function parsePatch(patch: string): FilePatch[] {
  const lines = patch.replace(/\r\n/g, '\n').split('\n')
  const files: FilePatch[] = []
  let current: FilePatch | null = null
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('--- ')) {
      const oldPath = normalizePath(line.slice(4).split('\t')[0].trim())
      const next = lines[i + 1]
      if (!next?.startsWith('+++ ')) {
        i++
        continue
      }
      const newPath = normalizePath(next.slice(4).split('\t')[0].trim())
      const path = newPath !== '/dev/null' ? newPath : oldPath
      current = { path, hunks: [] }
      files.push(current)
      i += 2
      continue
    }
    if (line.startsWith('@@')) {
      if (!current) throw new Error('Hunk without file header')
      const match = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(line)
      if (!match) throw new Error(`Invalid hunk header: ${line}`)
      const hunk: Hunk = {
        oldStart: Number(match[1]),
        oldLines: match[2] ? Number(match[2]) : 1,
        newStart: Number(match[3]),
        newLines: match[4] ? Number(match[4]) : 1,
        lines: [],
      }
      i++
      while (i < lines.length) {
        const hl = lines[i]
        if (hl.startsWith('@@') || hl.startsWith('--- ')) break
        if (hl.startsWith('+')) hunk.lines.push({ type: 'add', text: hl.slice(1) })
        else if (hl.startsWith('-')) hunk.lines.push({ type: 'del', text: hl.slice(1) })
        else if (hl.startsWith(' ') || hl === '') hunk.lines.push({ type: 'ctx', text: hl.startsWith(' ') ? hl.slice(1) : '' })
        else if (hl.startsWith('\\ No newline')) {
          /* ignore */
        } else break
        i++
      }
      current.hunks.push(hunk)
      continue
    }
    i++
  }

  if (!files.length) {
    throw new Error('No valid unified diff headers found (expected --- / +++ / @@)')
  }
  return files
}

function applyHunks(original: string, hunks: Hunk[]): string {
  const srcLines = original.split('\n')
  let lineNo = 0
  const out: string[] = []

  for (const hunk of hunks) {
    const target = hunk.oldStart - 1
    while (lineNo < target) {
      out.push(srcLines[lineNo] ?? '')
      lineNo++
    }
    for (const op of hunk.lines) {
      if (op.type === 'ctx') {
        out.push(op.text)
        lineNo++
      } else if (op.type === 'del') {
        const cur = srcLines[lineNo] ?? ''
        if (cur !== op.text) {
          throw new Error(`Delete mismatch at line ${lineNo + 1}: expected "${op.text}", got "${cur}"`)
        }
        lineNo++
      } else if (op.type === 'add') {
        out.push(op.text)
      }
    }
  }
  while (lineNo < srcLines.length) {
    out.push(srcLines[lineNo] ?? '')
    lineNo++
  }
  return out.join('\n')
}

export function applyUnifiedPatch(patch: string, readFile: (path: string) => string): ApplyPatchResult {
  const parsed = parsePatch(patch)
  const files: AppliedPatchFile[] = []
  for (const fp of parsed) {
    const original = readFile(fp.path)
    const content = applyHunks(original, fp.hunks)
    files.push({ path: fp.path, content, hunks: fp.hunks.length })
  }
  return { files }
}

/** Create an empty file when patch adds a new file (--- /dev/null). */
export function applyUnifiedPatchWithCreate(
  patch: string,
  readFile: (path: string) => string | null,
): ApplyPatchResult {
  const parsed = parsePatch(patch)
  const files: AppliedPatchFile[] = []
  for (const fp of parsed) {
    const original = readFile(fp.path)
    const content = applyHunks(original ?? '', fp.hunks)
    files.push({ path: fp.path, content, hunks: fp.hunks.length })
  }
  return { files }
}

export async function applyPatchAsync(
  patch: string,
  io: {
    read: (path: string) => Promise<string | null>
    write: (path: string, content: string) => Promise<void>
  },
): Promise<ApplyPatchResult> {
  const parsed = parsePatch(patch)
  const files: AppliedPatchFile[] = []
  for (const fp of parsed) {
    const original = await io.read(fp.path)
    const content = applyHunks(original ?? '', fp.hunks)
    await io.write(fp.path, content)
    files.push({ path: fp.path, content, hunks: fp.hunks.length })
  }
  return { files }
}
