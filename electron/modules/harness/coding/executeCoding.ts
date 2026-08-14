import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { resolveSandboxPath, sandboxRelative } from './Sandbox'
import { getShellJob, listShellJobs, startBackgroundShellJobAsync, getShellJobFresh, killShellJobAsync } from './JobRegistry'
import {
  getActiveSshSandboxConfig,
  sshReadFile,
  sshWriteFile,
  sshRunShell,
  sshListDir,
  sshSearchFiles,
  sshGrepContent,
} from './RemoteSandbox'
import {
  getActiveContainerSandboxConfig,
  containerReadFile,
  containerWriteFile,
  containerRunShell,
  containerListDir,
  containerGrepContent,
  containerSearchFiles,
} from './ContainerSandbox'
import { applyPatchAsync } from './ApplyPatch'
import { executeGitTool, GIT_TOOL_NAMES } from './GitTools'

const MAX_READ_BYTES = 96_000
const MAX_OUTPUT_BYTES = 32_000
const SHELL_TIMEOUT_MS = 60_000

export interface CodingToolContext {
  sessionId?: string
  toolCallId?: string
  onShellChunk?: (payload: { toolCallId: string; stream: 'stdout' | 'stderr'; delta: string }) => void
}

function jsonError(message: string): string {
  return JSON.stringify({ error: message })
}

async function readRemoteFile(rel: string): Promise<string | null> {
  const ssh = getActiveSshSandboxConfig()
  if (ssh) return sshReadFile(ssh, rel)
  const container = getActiveContainerSandboxConfig()
  if (container) return containerReadFile(container, rel)
  return null
}

async function writeRemoteFile(rel: string, content: string): Promise<boolean> {
  const ssh = getActiveSshSandboxConfig()
  if (ssh) {
    await sshWriteFile(ssh, rel, content)
    return true
  }
  const container = getActiveContainerSandboxConfig()
  if (container) {
    await containerWriteFile(container, rel, content)
    return true
  }
  return false
}

async function runRemoteShell(
  command: string,
  cwdRel: string,
): Promise<{ exitCode: number; stdout: string; stderr: string; cwd: string } | null> {
  const ssh = getActiveSshSandboxConfig()
  if (ssh) return sshRunShell(ssh, command, cwdRel)
  const container = getActiveContainerSandboxConfig()
  if (container) return containerRunShell(container, command, cwdRel)
  return null
}

export async function readFileTool(args: Record<string, unknown>): Promise<string> {
  const rel = String(args.path || '').trim()
  if (!rel) return jsonError('path required')
  try {
    const remoteText = await readRemoteFile(rel)
    if (remoteText != null) {
      const buf = Buffer.from(remoteText, 'utf8')
      const truncated = buf.byteLength > MAX_READ_BYTES
      const slice = truncated ? buf.subarray(0, MAX_READ_BYTES) : buf
      return JSON.stringify({
        path: rel,
        content: slice.toString('utf8'),
        truncated,
        bytes: buf.byteLength,
        remote: true,
      })
    }
    const abs = resolveSandboxPath(rel)
    if (!existsSync(abs)) return jsonError(`file not found: ${rel}`)
    const buf = readFileSync(abs)
    const slice = buf.byteLength > MAX_READ_BYTES ? buf.subarray(0, MAX_READ_BYTES) : buf
    const truncated = buf.byteLength > MAX_READ_BYTES
    return JSON.stringify({
      path: sandboxRelative(abs),
      content: slice.toString('utf8'),
      truncated,
      bytes: buf.byteLength,
    })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err))
  }
}

export async function writeFileTool(args: Record<string, unknown>): Promise<string> {
  const rel = String(args.path || '').trim()
  const content = String(args.content ?? '')
  if (!rel) return jsonError('path required')
  try {
    if (await writeRemoteFile(rel, content)) {
      return JSON.stringify({ ok: true, path: rel, bytes: Buffer.byteLength(content, 'utf8'), remote: true })
    }
    const abs = resolveSandboxPath(rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
    return JSON.stringify({ ok: true, path: sandboxRelative(abs), bytes: Buffer.byteLength(content, 'utf8') })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err))
  }
}

export async function strReplaceFileTool(args: Record<string, unknown>): Promise<string> {
  const rel = String(args.path || '').trim()
  const oldStr = String(args.old_string ?? '')
  const newStr = String(args.new_string ?? '')
  if (!rel) return jsonError('path required')
  if (!oldStr) return jsonError('old_string required')
  try {
    const remoteText = await readRemoteFile(rel)
    let text: string
    let outPath = rel
    if (remoteText != null) {
      text = remoteText
    } else {
      const abs = resolveSandboxPath(rel)
      if (!existsSync(abs)) return jsonError(`file not found: ${rel}`)
      outPath = sandboxRelative(abs)
      text = readFileSync(abs, 'utf8')
    }
    const count = text.split(oldStr).length - 1
    if (count === 0) return jsonError('old_string not found in file')
    if (count > 1) return jsonError(`old_string matched ${count} times; must be unique`)
    const next = text.replace(oldStr, newStr)
    if (!(await writeRemoteFile(rel, next))) {
      writeFileSync(resolveSandboxPath(rel), next, 'utf8')
    }
    return JSON.stringify({ ok: true, path: outPath, replacements: 1, remote: remoteText != null })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err))
  }
}

export async function runShellTool(
  args: Record<string, unknown>,
  ctx: CodingToolContext = {},
): Promise<string> {
  const command = String(args.command || '').trim()
  if (!command) return Promise.resolve(jsonError('command required'))
  const cwdRel = String(args.cwd || '.').trim() || '.'
  const remote = await runRemoteShell(command, cwdRel)
  if (remote) {
    return JSON.stringify({
      exitCode: remote.exitCode,
      stdout: remote.stdout,
      stderr: remote.stderr,
      cwd: remote.cwd,
      remote: true,
    })
  }
  const cwd = resolveSandboxPath(cwdRel)
  const toolCallId = ctx.toolCallId?.trim() || 'shell'
  return new Promise((resolve) => {
    const proc = spawn(command, {
      shell: true,
      cwd,
      env: { ...process.env, TERM: 'dumb' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const emit = (stream: 'stdout' | 'stderr', delta: string): void => {
      if (!delta) return
      ctx.onShellChunk?.({ toolCallId, stream, delta })
    }
    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
    }, SHELL_TIMEOUT_MS)
    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      stdout += text
      emit('stdout', text)
      if (stdout.length > MAX_OUTPUT_BYTES) stdout = stdout.slice(0, MAX_OUTPUT_BYTES) + '\n…[truncated]'
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      stderr += text
      emit('stderr', text)
      if (stderr.length > MAX_OUTPUT_BYTES) stderr = stderr.slice(0, MAX_OUTPUT_BYTES) + '\n…[truncated]'
    })
    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve(jsonError(err.message))
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve(
        JSON.stringify({
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          cwd: sandboxRelative(cwd),
        }),
      )
    })
  })
}

export async function runShellBackgroundTool(
  args: Record<string, unknown>,
  ctx: CodingToolContext = {},
): Promise<string> {
  const command = String(args.command || '').trim()
  if (!command) return jsonError('command required')
  const cwdRel = String(args.cwd || '.').trim() || '.'
  const toolCallId = ctx.toolCallId?.trim() || 'shell-bg'
  try {
    const job = await startBackgroundShellJobAsync(command, cwdRel, ctx.sessionId, {
      onOutput: (stream, delta) => {
        ctx.onShellChunk?.({ toolCallId, stream, delta })
      },
    })
    return JSON.stringify({
      ok: true,
      jobId: job.id,
      pid: job.pid,
      cwd: job.cwd,
      status: job.status,
      remote: job.remote ?? false,
    })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err))
  }
}

export async function getJobStatusTool(args: Record<string, unknown>): Promise<string> {
  const jobId = String(args.jobId || '').trim()
  if (!jobId) return jsonError('jobId required')
  const job = await getShellJobFresh(jobId)
  if (!job) return jsonError('job not found')
  return JSON.stringify({ job })
}

export async function killJobTool(args: Record<string, unknown>): Promise<string> {
  const jobId = String(args.jobId || '').trim()
  if (!jobId) return jsonError('jobId required')
  const killed = await killShellJobAsync(jobId)
  if (!killed) return jsonError('job not found or not running')
  const job = getShellJob(jobId)
  return JSON.stringify({ ok: true, job })
}

export function listJobsTool(args: Record<string, unknown>, ctx: CodingToolContext = {}): string {
  const sessionId = String(args.sessionId || ctx.sessionId || '').trim() || undefined
  return JSON.stringify({ jobs: listShellJobs(sessionId) })
}

function matchName(name: string, pattern: string): boolean {
  const p = pattern.trim()
  if (!p) return true
  if (p.includes('*') || p.includes('?')) {
    const re = new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i')
    return re.test(name)
  }
  return name.toLowerCase().includes(p.toLowerCase())
}

export async function listDirTool(args: Record<string, unknown>): Promise<string> {
  const rel = String(args.path || '.').trim() || '.'
  try {
    const ssh = getActiveSshSandboxConfig()
    if (ssh) {
      const entries = await sshListDir(ssh, rel)
      return JSON.stringify({ path: rel, entries, remote: true })
    }
    const container = getActiveContainerSandboxConfig()
    if (container) {
      const entries = await containerListDir(container, rel)
      return JSON.stringify({ path: rel, entries, remote: true })
    }
    const abs = resolveSandboxPath(rel)
    if (!existsSync(abs)) return jsonError(`path not found: ${rel}`)
    if (!statSync(abs).isDirectory()) return jsonError(`not a directory: ${rel}`)
    const entries = readdirSync(abs, { withFileTypes: true })
      .slice(0, 500)
      .map((d) => ({
        name: d.name,
        type: d.isDirectory() ? 'dir' : d.isFile() ? 'file' : 'other',
      }))
    return JSON.stringify({ path: sandboxRelative(abs), entries })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err))
  }
}

export async function searchFilesTool(args: Record<string, unknown>): Promise<string> {
  const rootRel = String(args.path || '.').trim() || '.'
  const pattern = String(args.pattern || '').trim()
  const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200)
  if (!pattern) return jsonError('pattern required')
  try {
    const ssh = getActiveSshSandboxConfig()
    if (ssh) {
      const hits = await sshSearchFiles(ssh, rootRel, pattern, limit)
      return JSON.stringify({ pattern, root: rootRel, hits, truncated: hits.length >= limit, remote: true })
    }
    const container = getActiveContainerSandboxConfig()
    if (container) {
      const hits = await containerSearchFiles(container, rootRel, pattern, limit)
      return JSON.stringify({ pattern, root: rootRel, hits, truncated: hits.length >= limit, remote: true })
    }
    const root = resolveSandboxPath(rootRel)
    if (!existsSync(root)) return jsonError(`path not found: ${rootRel}`)
    const hits: Array<{ path: string; type: 'file' | 'dir' }> = []
    const walk = (dir: string): void => {
      if (hits.length >= limit) return
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (hits.length >= limit) break
        const abs = join(dir, entry.name)
        const type = entry.isDirectory() ? 'dir' : 'file'
        if (matchName(entry.name, pattern)) hits.push({ path: sandboxRelative(abs), type })
        if (entry.isDirectory()) walk(abs)
      }
    }
    if (!statSync(root).isDirectory()) return jsonError(`not a directory: ${rootRel}`)
    walk(root)
    return JSON.stringify({ pattern, root: sandboxRelative(root), hits, truncated: hits.length >= limit })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err))
  }
}

const TEXT_EXT = /\.(tsx?|jsx?|jsonc?|md|css|html?|ya?ml|toml|txt|sh|py|go|rs|sql|vue|svelte)$/i
const MAX_GREP_FILES = 200

function fileMatchesGlob(name: string, glob?: string): boolean {
  if (!glob?.trim()) return true
  return matchName(name, glob.trim())
}

export async function grepContentTool(args: Record<string, unknown>): Promise<string> {
  const rootRel = String(args.path || '.').trim() || '.'
  const pattern = String(args.pattern || '').trim()
  const glob = String(args.glob || '').trim() || undefined
  const caseInsensitive = Boolean(args.case_insensitive)
  const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200)
  if (!pattern) return jsonError('pattern required')

  try {
    const ssh = getActiveSshSandboxConfig()
    if (ssh) {
      const hits = await sshGrepContent(ssh, rootRel, pattern, limit, caseInsensitive)
      return JSON.stringify({ pattern, root: rootRel, hits, truncated: hits.length >= limit, remote: true })
    }
    const container = getActiveContainerSandboxConfig()
    if (container) {
      const hits = await containerGrepContent(container, rootRel, pattern, limit, caseInsensitive)
      return JSON.stringify({ pattern, root: rootRel, hits, truncated: hits.length >= limit, remote: true })
    }

    const root = resolveSandboxPath(rootRel)
    if (!existsSync(root)) return jsonError(`path not found: ${rootRel}`)
    const flags = caseInsensitive ? 'i' : ''
    let re: RegExp
    try {
      re = new RegExp(pattern, flags)
    } catch {
      re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags)
    }

    const hits: Array<{ path: string; line: number; column: number; text: string }> = []
    const files: string[] = []

    const collect = (dir: string): void => {
      if (files.length >= MAX_GREP_FILES) return
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (files.length >= MAX_GREP_FILES) break
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const abs = join(dir, entry.name)
        if (entry.isDirectory()) collect(abs)
        else if (TEXT_EXT.test(entry.name) && fileMatchesGlob(entry.name, glob)) files.push(abs)
      }
    }

    if (statSync(root).isDirectory()) collect(root)
    else if (fileMatchesGlob(root.split(/[/\\]/).pop() ?? '', glob)) files.push(root)
    else return jsonError(`not a searchable path: ${rootRel}`)

    for (const abs of files) {
      if (hits.length >= limit) break
      let text: string
      try {
        text = readFileSync(abs, 'utf8')
      } catch {
        continue
      }
      const lines = text.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (hits.length >= limit) break
        const lineText = lines[i]
        const match = re.exec(lineText)
        re.lastIndex = 0
        if (!match) continue
        hits.push({
          path: sandboxRelative(abs),
          line: i + 1,
          column: (match.index ?? 0) + 1,
          text: lineText.trim(),
        })
      }
    }

    return JSON.stringify({
      pattern,
      root: statSync(root).isDirectory() ? sandboxRelative(root) : sandboxRelative(files[0] ?? root),
      hits,
      truncated: hits.length >= limit,
    })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err))
  }
}

export async function applyPatchTool(args: Record<string, unknown>): Promise<string> {
  const patch = String(args.patch || '').trim()
  if (!patch) return jsonError('patch required')
  try {
    const isRemote = Boolean(getActiveSshSandboxConfig() || getActiveContainerSandboxConfig())
    const result = await applyPatchAsync(patch, {
      read: async (rel) => {
        try {
          const remote = await readRemoteFile(rel)
          if (remote != null) return remote
          const abs = resolveSandboxPath(rel)
          if (!existsSync(abs)) return null
          return readFileSync(abs, 'utf8')
        } catch {
          return null
        }
      },
      write: async (rel, content) => {
        if (!(await writeRemoteFile(rel, content))) {
          const abs = resolveSandboxPath(rel)
          mkdirSync(dirname(abs), { recursive: true })
          writeFileSync(abs, content, 'utf8')
        }
      },
    })
    return JSON.stringify({
      ok: true,
      files: result.files.map((f) => ({ path: f.path, hunks: f.hunks })),
      remote: isRemote,
    })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err))
  }
}

export const CODING_TOOL_NAMES = [
  'read_file',
  'write_file',
  'str_replace_file',
  'run_shell',
  'run_shell_background',
  'get_job_status',
  'kill_job',
  'list_jobs',
  'get_diagnostics',
  'list_dir',
  'search_files',
  'grep_content',
  'apply_patch',
  ...GIT_TOOL_NAMES,
] as const

export async function executeCodingTool(
  name: string,
  argsJson: string,
  ctx: CodingToolContext = {},
): Promise<string> {
  let args: Record<string, unknown> = {}
  try {
    args = argsJson.trim() ? (JSON.parse(argsJson) as Record<string, unknown>) : {}
  } catch {
    return jsonError('invalid arguments JSON')
  }
  switch (name) {
    case 'read_file':
      return readFileTool(args)
    case 'write_file':
      return writeFileTool(args)
    case 'str_replace_file':
      return strReplaceFileTool(args)
    case 'run_shell':
      return runShellTool(args, ctx)
    case 'run_shell_background':
      return runShellBackgroundTool(args, ctx)
    case 'get_job_status':
      return getJobStatusTool(args)
    case 'kill_job':
      return killJobTool(args)
    case 'list_jobs':
      return listJobsTool(args, ctx)
    case 'get_diagnostics': {
      const { getDiagnosticsForPath } = await import('./DiagnosticsService')
      const path = String(args.path || '').trim() || undefined
      const diagnostics = await getDiagnosticsForPath(path)
      return JSON.stringify({ diagnostics })
    }
    case 'list_dir':
      return listDirTool(args)
    case 'search_files':
      return searchFilesTool(args)
    case 'grep_content':
      return grepContentTool(args)
    case 'apply_patch':
      return applyPatchTool(args)
    default:
      if ((GIT_TOOL_NAMES as readonly string[]).includes(name)) {
        return executeGitTool(name, args)
      }
      return jsonError(`unknown coding tool: ${name}`)
  }
}
