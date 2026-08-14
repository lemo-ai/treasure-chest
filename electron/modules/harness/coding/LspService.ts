import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(join(process.cwd(), 'package.json'))
import type { SandboxDiagnostic } from '@shared'
import { logger } from '../../../utils/logger'
import { ensureSandboxRoot, resolveSandboxPath, sandboxRelative } from './Sandbox'
import {
  buildRemoteShellCommand,
  getActiveSshSandboxConfig,
  remoteSandboxAbs,
  spawnSshStdio,
  sshReadFile,
  sshRunShell,
  type SshSandboxConfig,
} from './RemoteSandbox'

export interface LspLocation {
  path: string
  line: number
  column: number
}

export interface LspCompletionItem {
  label: string
  detail?: string
  kind?: number
}

type JsonRpcMessage = {
  jsonrpc: '2.0'
  id?: number
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string }
}

let proc: ChildProcessWithoutNullStreams | null = null
let nextId = 1
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
let buffer = ''
let initialized = false
let initPromise: Promise<void> | null = null
let lspMode: 'local' | 'ssh' = 'local'
let lspSshConfig: SshSandboxConfig | null = null
let lspRootUri = ''
let backendKey = ''

function pathToUri(absPath: string): string {
  return pathToFileURL(absPath).href
}

function resolveBackend(): { mode: 'local' | 'ssh'; ssh: SshSandboxConfig | null; key: string } {
  const ssh = getActiveSshSandboxConfig()
  if (ssh) {
    return {
      mode: 'ssh',
      ssh,
      key: `ssh:${ssh.user}@${ssh.host}:${ssh.port ?? 22}:${ssh.remotePath}`,
    }
  }
  return { mode: 'local', ssh: null, key: 'local' }
}

function languageIdForPath(filePath: string): string {
  if (filePath.endsWith('.tsx')) return 'typescriptreact'
  if (filePath.endsWith('.ts')) return 'typescript'
  if (filePath.endsWith('.json')) return 'json'
  return 'javascript'
}

function uriToSandboxRelative(uri: string): string {
  const pathname = decodeURIComponent(new URL(uri).pathname)
  if (lspMode === 'ssh' && lspSshConfig) {
    const base = lspSshConfig.remotePath.replace(/\/+$/, '')
    return pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\/+/, '') : pathname.replace(/^\/+/, '')
  }
  return sandboxRelative(pathname)
}

function send(msg: JsonRpcMessage): void {
  if (!proc?.stdin.writable) throw new Error('LSP process not running')
  const body = JSON.stringify(msg)
  proc.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`)
}

function request(method: string, params: unknown): Promise<unknown> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    send({ jsonrpc: '2.0', id, method, params })
  })
}

function notify(method: string, params: unknown): void {
  send({ jsonrpc: '2.0', method, params })
}

function handleChunk(chunk: string): void {
  buffer += chunk
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd < 0) return
    const header = buffer.slice(0, headerEnd)
    const match = /Content-Length:\s*(\d+)/i.exec(header)
    if (!match) {
      buffer = buffer.slice(headerEnd + 4)
      continue
    }
    const length = Number(match[1])
    const start = headerEnd + 4
    if (buffer.length < start + length) return
    const body = buffer.slice(start, start + length)
    buffer = buffer.slice(start + length)
    try {
      const msg = JSON.parse(body) as JsonRpcMessage
      if (msg.id != null && pending.has(msg.id)) {
        const p = pending.get(msg.id)!
        pending.delete(msg.id)
        if (msg.error) p.reject(new Error(msg.error.message))
        else p.resolve(msg.result)
      }
    } catch (err) {
      logger.warn('lsp parse failed', err)
    }
  }
}

async function startLspProcess(mode: 'local' | 'ssh', ssh: SshSandboxConfig | null): Promise<void> {
  lspMode = mode
  lspSshConfig = ssh

  if (mode === 'ssh' && ssh) {
    const remoteRoot = ssh.remotePath.replace(/\/+$/, '') || '.'
    const inner =
      '(command -v typescript-language-server >/dev/null 2>&1 && exec typescript-language-server --stdio) || exec npx -y typescript-language-server --stdio'
    const remoteCmd = buildRemoteShellCommand(ssh, inner, '.')
    proc = spawnSshStdio(ssh, remoteCmd)
    lspRootUri = pathToUri(remoteRoot)
  } else {
    const root = ensureSandboxRoot()
    const tlsPath = require.resolve('typescript-language-server/lib/cli.mjs') as string
    proc = spawn(process.execPath, [tlsPath, '--stdio'], {
      cwd: root,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    lspRootUri = pathToUri(root)
  }

  proc.stdout.on('data', (c: Buffer) => handleChunk(c.toString('utf8')))
  proc.stderr.on('data', (c: Buffer) => logger.warn(`lsp stderr: ${c.toString('utf8').trim()}`))
  proc.on('exit', () => {
    initialized = false
    initPromise = null
    proc = null
  })

  await request('initialize', {
    processId: process.pid,
    rootUri: lspRootUri,
    capabilities: {
      textDocument: {
        completion: { completionItem: { snippetSupport: false } },
        definition: {},
      },
    },
  })
  notify('initialized', {})
  initialized = true
}

async function ensureLspStarted(): Promise<void> {
  const { mode, ssh, key } = resolveBackend()
  if (initialized && backendKey === key) return
  if (proc) shutdownLsp()

  backendKey = key
  if (initPromise) return initPromise

  initPromise = startLspProcess(mode, ssh).catch((err) => {
    initPromise = null
    initialized = false
    backendKey = ''
    throw err
  })

  return initPromise
}

async function openDocument(userPath: string): Promise<string> {
  await ensureLspStarted()
  const rel = userPath.replace(/^\.[/\\]/, '').replace(/\\/g, '/')

  if (lspMode === 'ssh' && lspSshConfig) {
    const text = await sshReadFile(lspSshConfig, rel)
    const uri = pathToUri(remoteSandboxAbs(lspSshConfig, rel))
    notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: languageIdForPath(rel),
        version: 1,
        text,
      },
    })
    return uri
  }

  const abs = resolveSandboxPath(rel)
  const text = readFileSync(abs, 'utf8')
  const uri = pathToUri(abs)
  notify('textDocument/didOpen', {
    textDocument: {
      uri,
      languageId: languageIdForPath(abs),
      version: 1,
      text,
    },
  })
  return uri
}

function mapSeverity(sev?: number): SandboxDiagnostic['severity'] {
  if (sev === 1) return 'error'
  if (sev === 2) return 'warning'
  return 'info'
}

function collectLocalTargets(root: string, userPath?: string): string[] {
  if (userPath?.trim()) return [userPath.replace(/^\.[/\\]/, '').replace(/\\/g, '/')]
  const targets: string[] = []
  const walk = (dir: string): void => {
    if (targets.length >= 40) return
    for (const name of readdirSync(dir)) {
      if (targets.length >= 40) break
      if (name === 'node_modules' || name.startsWith('.')) continue
      const abs = join(dir, name)
      const st = statSync(abs)
      if (st.isDirectory()) walk(abs)
      else if (/\.(tsx?|jsx?|json)$/i.test(name)) targets.push(sandboxRelative(abs))
    }
  }
  walk(root)
  return targets
}

async function collectRemoteTargets(config: SshSandboxConfig, userPath?: string): Promise<string[]> {
  if (userPath?.trim()) return [userPath.replace(/^\.[/\\]/, '').replace(/\\/g, '/')]
  const res = await sshRunShell(
    config,
    `find . -maxdepth 4 -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.json' \\) ! -path '*/node_modules/*' 2>/dev/null | head -n 40`,
    '.',
  )
  return res.stdout
    .split('\n')
    .map((line) => line.trim().replace(/^\.\//, ''))
    .filter(Boolean)
}

export async function lspGetDiagnostics(userPath?: string): Promise<SandboxDiagnostic[]> {
  try {
    await ensureLspStarted()
    const ssh = lspSshConfig
    const targets =
      lspMode === 'ssh' && ssh
        ? await collectRemoteTargets(ssh, userPath)
        : collectLocalTargets(ensureSandboxRoot(), userPath)
    const out: SandboxDiagnostic[] = []

    for (const rel of targets) {
      if (lspMode === 'local') {
        const abs = resolveSandboxPath(rel)
        if (!existsSync(abs)) continue
      }
      const uri = await openDocument(rel)
      const published = (await request('textDocument/diagnostic', {
        textDocument: { uri },
      }).catch(() => null)) as {
        items?: Array<{
          message: string
          range: { start: { line: number; character: number }; end: { line: number; character: number } }
          severity?: number
        }>
      } | null

      for (const item of published?.items ?? []) {
        out.push({
          path: rel,
          line: item.range.start.line + 1,
          column: item.range.start.character + 1,
          endLine: item.range.end.line + 1,
          endColumn: item.range.end.character + 1,
          message: item.message,
          severity: mapSeverity(item.severity),
          source: 'typescript',
        })
      }
    }
    return out
  } catch (err) {
    logger.warn('lsp diagnostics failed', err)
    return []
  }
}

export async function lspGetDefinition(userPath: string, line: number, column: number): Promise<LspLocation | null> {
  await ensureLspStarted()
  const uri = await openDocument(userPath)
  const result = (await request('textDocument/definition', {
    textDocument: { uri },
    position: { line: Math.max(line - 1, 0), character: Math.max(column - 1, 0) },
  })) as
    | { uri?: string; range?: { start: { line: number; character: number } } }
    | Array<{ uri?: string; range?: { start: { line: number; character: number } } }>
    | null

  const hit = Array.isArray(result) ? result[0] : result
  if (!hit?.uri || !hit.range) return null
  return {
    path: uriToSandboxRelative(hit.uri),
    line: hit.range.start.line + 1,
    column: hit.range.start.character + 1,
  }
}

export async function lspGetCompletion(
  userPath: string,
  line: number,
  column: number,
): Promise<LspCompletionItem[]> {
  await ensureLspStarted()
  const uri = await openDocument(userPath)
  const result = (await request('textDocument/completion', {
    textDocument: { uri },
    position: { line: Math.max(line - 1, 0), character: Math.max(column - 1, 0) },
  })) as
    | { items?: Array<{ label: string; detail?: string; kind?: number }> }
    | Array<{ label: string; detail?: string; kind?: number }>
    | null

  const items = Array.isArray(result) ? result : result?.items ?? []
  return items.slice(0, 50).map((item) => ({ label: item.label, detail: item.detail, kind: item.kind }))
}

export function shutdownLsp(): void {
  if (proc) {
    try {
      notify('exit', {})
      proc.kill()
    } catch {
      /* ignore */
    }
  }
  proc = null
  initialized = false
  initPromise = null
  backendKey = ''
  lspMode = 'local'
  lspSshConfig = null
  lspRootUri = ''
}
