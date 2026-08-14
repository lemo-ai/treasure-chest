import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import type { SandboxDiagnostic } from '@shared'
import { ensureSandboxRoot, resolveSandboxPath, sandboxRelative } from './Sandbox'
import { lspGetDiagnostics } from './LspService'
import { getActiveSshSandboxConfig, sshReadFile } from './RemoteSandbox'

const TS_EXT = /\.(tsx?|jsx?)$/i
const JSON_EXT = /\.jsonc?$/i
const MAX_FILES = 120

function walkFiles(root: string, limit: number): string[] {
  const out: string[] = []
  const visit = (dir: string): void => {
    if (out.length >= limit) return
    for (const name of readdirSync(dir)) {
      if (out.length >= limit) break
      if (name === 'node_modules' || name.startsWith('.')) continue
      const abs = join(dir, name)
      const st = statSync(abs)
      if (st.isDirectory()) visit(abs)
      else if (TS_EXT.test(name) || JSON_EXT.test(name)) out.push(abs)
    }
  }
  visit(root)
  return out
}

async function readSandboxText(absPath: string): Promise<string> {
  const rel = sandboxRelative(absPath)
  const ssh = getActiveSshSandboxConfig()
  if (ssh) {
    try {
      return await sshReadFile(ssh, rel)
    } catch {
      return readFileSync(absPath, 'utf8')
    }
  }
  return readFileSync(absPath, 'utf8')
}

function jsonDiagnostics(absPath: string, text: string): SandboxDiagnostic[] {
  try {
    JSON.parse(text)
    return []
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const match = /position (\d+)/i.exec(msg)
    let line = 1
    let column = 1
    if (match) {
      const pos = Number(match[1])
      const before = text.slice(0, pos)
      line = before.split('\n').length
      column = (before.split('\n').pop()?.length ?? 0) + 1
    }
    return [
      {
        path: sandboxRelative(absPath),
        line,
        column,
        message: msg,
        severity: 'error',
        source: 'json',
      },
    ]
  }
}

function tsDiagnostics(absPath: string, text: string): SandboxDiagnostic[] {
  const rel = sandboxRelative(absPath)
  const source = ts.createSourceFile(
    absPath,
    text,
    ts.ScriptTarget.ES2022,
    true,
    absPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: true,
    checkJs: true,
    noEmit: true,
    strict: false,
    skipLibCheck: true,
    esModuleInterop: true,
  }

  const host: ts.CompilerHost = {
    getSourceFile: (name, _languageVersion) => (name === absPath ? source : undefined),
    writeFile: () => undefined,
    getCurrentDirectory: () => ensureSandboxRoot(),
    getCanonicalFileName: (f) => f,
    getNewLine: () => '\n',
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (name) => name === absPath,
    readFile: (name) => (name === absPath ? text : undefined),
    directoryExists: () => true,
    useCaseSensitiveFileNames: () => true,
  }

  const program = ts.createProgram([absPath], compilerOptions, host)
  const diags = [...program.getSemanticDiagnostics(source), ...program.getSyntacticDiagnostics(source)]

  return diags.map((d) => {
    const start = d.start ?? 0
    const end = d.start != null && d.length != null ? d.start + d.length : start
    const s = source.getLineAndCharacterOfPosition(start)
    const e = source.getLineAndCharacterOfPosition(end)
    const category =
      d.category === ts.DiagnosticCategory.Error
        ? 'error'
        : d.category === ts.DiagnosticCategory.Warning
          ? 'warning'
          : 'info'
    return {
      path: rel,
      line: s.line + 1,
      column: s.character + 1,
      endLine: e.line + 1,
      endColumn: e.character + 1,
      message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      severity: category as SandboxDiagnostic['severity'],
      source: 'typescript' as const,
    }
  })
}

async function compilerDiagnostics(userPath?: string): Promise<SandboxDiagnostic[]> {
  if (userPath?.trim()) {
    const abs = resolveSandboxPath(userPath)
    const text = await readSandboxText(abs)
    if (JSON_EXT.test(abs)) return jsonDiagnostics(abs, text)
    if (TS_EXT.test(abs)) return tsDiagnostics(abs, text)
    return []
  }

  const root = ensureSandboxRoot()
  const files = walkFiles(root, MAX_FILES)
  const all: SandboxDiagnostic[] = []
  for (const abs of files) {
    try {
      const text = await readSandboxText(abs)
      if (JSON_EXT.test(abs)) all.push(...jsonDiagnostics(abs, text))
      else if (TS_EXT.test(abs)) all.push(...tsDiagnostics(abs, text))
    } catch {
      /* skip unreadable */
    }
  }
  return all.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
}

export async function getDiagnosticsForPath(userPath?: string): Promise<SandboxDiagnostic[]> {
  const lsp = await lspGetDiagnostics(userPath)
  if (lsp.length > 0) return lsp
  return compilerDiagnostics(userPath)
}
