import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, posix as pathPosix } from 'node:path'
import { resolveSandboxPath } from './Sandbox'
import { getCordisStack } from '../cordis/CordisLoader'
import { getActiveContainerSandboxConfig } from './ContainerSandbox'

export interface SshSandboxConfig {
  host: string
  user: string
  remotePath: string
  port?: number
}

function sshTarget(config: SshSandboxConfig): string {
  return `${config.user}@${config.host}`
}

function sshArgs(config: SshSandboxConfig, remoteCommand: string): string[] {
  const args = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new']
  if (config.port) args.push('-p', String(config.port))
  args.push(sshTarget(config), remoteCommand)
  return args
}

function shellQuote(raw: string): string {
  return `'${raw.replace(/'/g, `'\\''`)}'`
}

function remoteAbs(config: SshSandboxConfig, rel: string): string {
  const base = config.remotePath.replace(/\/+$/, '') || '.'
  const clean = rel.replace(/^\.[/\\]/, '').replace(/\\/g, '/')
  return pathPosix.join(base, clean)
}

export function getActiveSshSandboxConfig(): SshSandboxConfig | null {
  const stack = getCordisStack()
  if (stack.sandboxMode !== 'ssh' || !stack.ssh) return null
  return stack.ssh
}

export function isRemoteSandboxActive(): boolean {
  return getActiveSshSandboxConfig() != null
}

export function remoteSandboxAbs(config: SshSandboxConfig, rel: string): string {
  return remoteAbs(config, rel)
}

export function spawnSshStdio(config: SshSandboxConfig, remoteCommand: string): ChildProcessWithoutNullStreams {
  return spawn('ssh', sshArgs(config, remoteCommand), { stdio: ['pipe', 'pipe', 'pipe'] })
}

export function buildRemoteShellCommand(config: SshSandboxConfig, innerCommand: string, cwdRel = '.'): string {
  const cwd = remoteAbs(config, cwdRel || '.')
  return `cd ${shellQuote(cwd)} && ${innerCommand}`
}

function runSsh(config: SshSandboxConfig, remoteCommand: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ssh', sshArgs(config, remoteCommand), { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (c: Buffer) => {
      stdout += c.toString('utf8')
    })
    proc.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf8')
    })
    proc.on('error', reject)
    proc.on('close', (code) => resolve({ stdout, stderr, code: code ?? 1 }))
  })
}

export async function sshReadFile(config: SshSandboxConfig, relPath: string): Promise<string> {
  const remote = remoteAbs(config, relPath)
  const res = await runSsh(config, `cat ${shellQuote(remote)}`)
  if (res.code !== 0) throw new Error(res.stderr.trim() || `ssh read failed (${res.code})`)
  return res.stdout
}

export async function sshWriteFile(config: SshSandboxConfig, relPath: string, content: string): Promise<void> {
  const remote = remoteAbs(config, relPath)
  const dir = remote.replace(/\/[^/]+$/, '')
  const b64 = Buffer.from(content, 'utf8').toString('base64')
  const cmd = `mkdir -p ${shellQuote(dir)} && printf '%s' ${shellQuote(b64)} | base64 -d > ${shellQuote(remote)}`
  const res = await runSsh(config, cmd)
  if (res.code !== 0) throw new Error(res.stderr.trim() || `ssh write failed (${res.code})`)
  cacheLocalMirror(relPath, content)
}

export async function sshRunShell(
  config: SshSandboxConfig,
  command: string,
  cwdRel: string,
): Promise<{ exitCode: number; stdout: string; stderr: string; cwd: string }> {
  const cwd = remoteAbs(config, cwdRel || '.')
  const cmd = `cd ${shellQuote(cwd)} && ${command}`
  const res = await runSsh(config, cmd)
  return {
    exitCode: res.code,
    stdout: res.stdout.trim(),
    stderr: res.stderr.trim(),
    cwd: cwdRel || '.',
  }
}

function cacheLocalMirror(relPath: string, content: string): void {
  try {
    const abs = resolveSandboxPath(relPath)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  } catch {
    /* mirror best-effort */
  }
}

export async function syncRemoteFileToLocal(relPath: string): Promise<string> {
  const config = getActiveSshSandboxConfig()
  if (!config) throw new Error('remote sandbox not active')
  const content = await sshReadFile(config, relPath)
  cacheLocalMirror(relPath, content)
  return content
}

export function describeSandboxBackend(): { mode: 'local' | 'ssh' | 'container'; label: string } {
  const container = getActiveContainerSandboxConfig()
  if (container) {
    return {
      mode: 'container',
      label: `docker:${container.containerName}:${container.workspacePath}`,
    }
  }
  const ssh = getActiveSshSandboxConfig()
  if (ssh) {
    return {
      mode: 'ssh',
      label: `${ssh.user}@${ssh.host}:${ssh.remotePath}`,
    }
  }
  const stack = getCordisStack()
  if (stack.sandboxRoot?.trim()) {
    return { mode: 'local', label: stack.sandboxRoot.trim() }
  }
  return { mode: 'local', label: 'local sandbox' }
}

export async function sshListDir(
  config: SshSandboxConfig,
  relPath: string,
): Promise<Array<{ name: string; type: 'dir' | 'file' | 'other' }>> {
  const remote = remoteAbs(config, relPath || '.')
  const res = await runSsh(config, `ls -1 ${shellQuote(remote)} 2>/dev/null || ls -1 ${shellQuote(remote)}`)
  if (res.code !== 0) throw new Error(res.stderr.trim() || `ssh list failed (${res.code})`)
  const names = res.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 500)
  const entries: Array<{ name: string; type: 'dir' | 'file' | 'other' }> = []
  for (const name of names) {
    const child = pathPosix.join(remote, name)
    const probe = await runSsh(config, `[ -d ${shellQuote(child)} ] && echo dir || echo file`)
    const kind = probe.stdout.trim() === 'dir' ? 'dir' : 'file'
    entries.push({ name, type: kind })
  }
  return entries
}

export async function sshSearchFiles(
  config: SshSandboxConfig,
  rootRel: string,
  pattern: string,
  limit: number,
): Promise<Array<{ path: string; type: 'file' | 'dir' }>> {
  const root = remoteAbs(config, rootRel || '.')
  const safePattern = pattern.replace(/'/g, `'\\''`)
  const cmd = `find ${shellQuote(root)} -name '${safePattern}' 2>/dev/null | head -n ${limit}`
  const res = await runSsh(config, cmd)
  if (res.code !== 0 && !res.stdout.trim()) {
    throw new Error(res.stderr.trim() || `ssh search failed (${res.code})`)
  }
  const base = config.remotePath.replace(/\/+$/, '') || '.'
  return res.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((absRemote) => {
      const rel = absRemote.startsWith(base) ? absRemote.slice(base.length).replace(/^\/+/, '') : absRemote
      return { path: rel || '.', type: 'file' as const }
    })
}

export interface GrepHit {
  path: string
  line: number
  column: number
  text: string
}

export async function sshGrepContent(
  config: SshSandboxConfig,
  rootRel: string,
  pattern: string,
  limit: number,
  caseInsensitive: boolean,
): Promise<GrepHit[]> {
  const root = remoteAbs(config, rootRel || '.')
  const pat = pattern.replace(/'/g, `'\\''`)
  const flags = caseInsensitive ? '-i' : ''
  const cmd = `grep -rn ${flags} -- '${pat}' ${shellQuote(root)} 2>/dev/null | head -n ${limit}`
  const res = await runSsh(config, cmd)
  const base = config.remotePath.replace(/\/+$/, '') || '.'
  const hits: GrepHit[] = []
  for (const line of res.stdout.split('\n')) {
    if (hits.length >= limit) break
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = /^(.+?):(\d+):(.*)$/.exec(trimmed)
    if (!match) continue
    const absRemote = match[1]
    const rel = absRemote.startsWith(base) ? absRemote.slice(base.length).replace(/^\/+/, '') : absRemote
    hits.push({
      path: rel,
      line: Number(match[2]) || 1,
      column: 1,
      text: match[3].trim(),
    })
  }
  return hits
}
