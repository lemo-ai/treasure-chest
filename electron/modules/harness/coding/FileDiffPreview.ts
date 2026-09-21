import { existsSync, readFileSync } from 'node:fs'
import { resolveSandboxPath, getConfiguredSandboxRoot } from './Sandbox'

const MAX_DIFF_CHARS = 24_000
const MAX_RULES_CHARS = 12_000

export interface FileDiffHunk {
  path: string
  before: string
  after: string
  /** Truncated for UI */
  truncated?: boolean
}

function truncatePair(before: string, after: string): { before: string; after: string; truncated: boolean } {
  if (before.length + after.length <= MAX_DIFF_CHARS) {
    return { before, after, truncated: false }
  }
  const half = Math.floor(MAX_DIFF_CHARS / 2)
  return {
    before: before.slice(0, half) + (before.length > half ? '\n…' : ''),
    after: after.slice(0, half) + (after.length > half ? '\n…' : ''),
    truncated: true,
  }
}

function readLocalOrEmpty(rel: string): string {
  try {
    const abs = resolveSandboxPath(rel)
    if (!existsSync(abs)) return ''
    return readFileSync(abs, 'utf8')
  } catch {
    return ''
  }
}

/** Build before/after previews for file-mutating coding tools (no disk write). */
export function previewFileEdits(
  toolName: string,
  args: Record<string, unknown>,
): FileDiffHunk[] {
  const name = toolName.trim()
  if (name === 'write_file') {
    const path = String(args.path || '').trim()
    if (!path) return []
    const after = String(args.content ?? '')
    const before = readLocalOrEmpty(path)
    const pair = truncatePair(before, after)
    return [{ path, ...pair }]
  }
  if (name === 'str_replace_file') {
    const path = String(args.path || '').trim()
    const oldStr = String(args.old_string ?? args.oldString ?? '')
    const newStr = String(args.new_string ?? args.newString ?? '')
    if (!path || !oldStr) return []
    const before = readLocalOrEmpty(path)
    if (!before.includes(oldStr)) {
      return [
        {
          path,
          before: before.slice(0, 4000),
          after: before.slice(0, 4000),
          truncated: true,
        },
      ]
    }
    const after = before.replace(oldStr, newStr)
    const pair = truncatePair(before, after)
    return [{ path, ...pair }]
  }
  if (name === 'apply_patch') {
    const patch = String(args.patch ?? args.diff ?? '')
    if (!patch.trim()) return []
    // Lightweight: show patch text as "after" with empty before for each *** Update File header
    const hunks: FileDiffHunk[] = []
    const fileRe = /\*\*\*\s+(?:Update|Add|Delete)\s+File:\s+([^\n]+)/g
    const paths = new Set<string>()
    for (const m of patch.matchAll(fileRe)) {
      const p = m[1]?.trim()
      if (p) paths.add(p)
    }
    if (paths.size === 0) {
      return [
        {
          path: '(patch)',
          before: '',
          after: patch.slice(0, MAX_DIFF_CHARS),
          truncated: patch.length > MAX_DIFF_CHARS,
        },
      ]
    }
    for (const path of paths) {
      const before = readLocalOrEmpty(path)
      const pair = truncatePair(before, patch.slice(0, Math.floor(MAX_DIFF_CHARS / Math.max(1, paths.size))))
      hunks.push({ path, before: pair.before, after: pair.after, truncated: pair.truncated })
    }
    return hunks
  }
  return []
}

export function isFileEditTool(name: string): boolean {
  const n = name.trim()
  return n === 'write_file' || n === 'str_replace_file' || n === 'apply_patch'
}

/** Load project / workspace rules text for system prompt injection. */
export function loadCodingRulesText(rulesPath?: string | null): string {
  const candidates: string[] = []
  const explicit = rulesPath?.trim()
  if (explicit) candidates.push(explicit)
  const root = getConfiguredSandboxRoot()?.trim()
  if (root) {
    candidates.push('AGENTS.md', 'agents.md', '.qiankun/rules.md')
  }
  for (const cand of candidates) {
    try {
      // Absolute path or relative to sandbox
      let text = ''
      if (cand.startsWith('/') || /^[A-Za-z]:[\\/]/.test(cand)) {
        if (existsSync(cand)) text = readFileSync(cand, 'utf8')
      } else {
        text = readLocalOrEmpty(cand)
      }
      const trimmed = text.trim()
      if (trimmed) return trimmed.slice(0, MAX_RULES_CHARS)
    } catch {
      /* try next */
    }
  }
  return ''
}
