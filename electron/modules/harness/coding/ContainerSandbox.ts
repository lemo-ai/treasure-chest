import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getCordisStack } from '../cordis/CordisLoader'
import { ensureSandboxRoot } from './Sandbox'

export interface ContainerSandboxConfig {
  containerName: string
  workspacePath: string
}

function shellQuote(raw: string): string {
  return `'${raw.replace(/'/g, `'\\''`)}'`
}

function containerAbs(config: ContainerSandboxConfig, rel: string): string {
  const base = config.workspacePath.replace(/\/+$/, '') || '/'
  const clean = rel.replace(/^\.[/\\]/, '').replace(/\\/g, '/')
  return `${base}/${clean}`.replace(/\/+/g, '/')
}

export function getActiveContainerSandboxConfig(): ContainerSandboxConfig | null {
  const stack = getCordisStack()
  if (stack.sandboxMode !== 'container' || !stack.container?.containerName) return null
  return stack.container
}

export function isContainerSandboxActive(): boolean {
  return getActiveContainerSandboxConfig() != null
}

function runDocker(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] })
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

function spawnDockerStdio(args: string[]): ChildProcessWithoutNullStreams {
  return spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
}

export function buildContainerShellCommand(config: ContainerSandboxConfig, innerCommand: string): string[] {
  const cwd = config.workspacePath.replace(/\/+$/, '') || '/'
  return [
    'exec',
    '-i',
    config.containerName,
    'bash',
    '-lc',
    `cd ${shellQuote(cwd)} && ${innerCommand}`,
  ]
}

export async function containerReadFile(config: ContainerSandboxConfig, relPath: string): Promise<string> {
  const remote = containerAbs(config, relPath)
  const res = await runDocker(['exec', config.containerName, 'cat', remote])
  if (res.code !== 0) throw new Error(res.stderr.trim() || `docker read failed (${res.code})`)
  return res.stdout
}

export async function containerWriteFile(
  config: ContainerSandboxConfig,
  relPath: string,
  content: string,
): Promise<void> {
  const remote = containerAbs(config, relPath)
  const dir = remote.replace(/\/[^/]+$/, '')
  const b64 = Buffer.from(content, 'utf8').toString('base64')
  const cmd = `mkdir -p ${shellQuote(dir)} && printf '%s' ${shellQuote(b64)} | base64 -d > ${shellQuote(remote)}`
  const res = await runDocker(buildContainerShellCommand(config, cmd))
  if (res.code !== 0) throw new Error(res.stderr.trim() || `docker write failed (${res.code})`)
}

export async function containerRunShell(
  config: ContainerSandboxConfig,
  command: string,
  cwdRel: string,
): Promise<{ exitCode: number; stdout: string; stderr: string; cwd: string }> {
  const cwd = containerAbs(config, cwdRel || '.')
  const cmd = `cd ${shellQuote(cwd)} && ${command}`
  const res = await runDocker(buildContainerShellCommand(config, cmd))
  return {
    exitCode: res.code,
    stdout: res.stdout.trim(),
    stderr: res.stderr.trim(),
    cwd: cwdRel || '.',
  }
}

export async function containerListDir(
  config: ContainerSandboxConfig,
  relPath: string,
): Promise<Array<{ name: string; type: 'dir' | 'file' | 'other' }>> {
  const remote = containerAbs(config, relPath || '.')
  const res = await runDocker(['exec', config.containerName, 'ls', '-1', remote])
  if (res.code !== 0) throw new Error(res.stderr.trim() || `docker list failed (${res.code})`)
  const names = res.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 500)
  const entries: Array<{ name: string; type: 'dir' | 'file' | 'other' }> = []
  for (const name of names) {
    const child = `${remote}/${name}`.replace(/\/+/g, '/')
    const probe = await runDocker(['exec', config.containerName, 'test', '-d', child])
    entries.push({ name, type: probe.code === 0 ? 'dir' : 'file' })
  }
  return entries
}

export interface GrepHit {
  path: string
  line: number
  column: number
  text: string
}

export async function containerGrepContent(
  config: ContainerSandboxConfig,
  rootRel: string,
  pattern: string,
  limit: number,
  caseInsensitive: boolean,
): Promise<GrepHit[]> {
  const root = containerAbs(config, rootRel || '.')
  const pat = pattern.replace(/'/g, `'\\''`)
  const flags = caseInsensitive ? '-i' : ''
  const cmd = `grep -rn ${flags} -- '${pat}' ${shellQuote(root)} 2>/dev/null | head -n ${limit}`
  const res = await runDocker(buildContainerShellCommand(config, cmd))
  const base = config.workspacePath.replace(/\/+$/, '')
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

export function tryResolveDevcontainer(rootPath?: string): Partial<ContainerSandboxConfig> | null {
  const root = rootPath?.trim() || ensureSandboxRoot()
  const cfgPath = join(root, '.devcontainer', 'devcontainer.json')
  if (!existsSync(cfgPath)) return null
  try {
    const raw = JSON.parse(readFileSync(cfgPath, 'utf8')) as {
      workspaceFolder?: string
      workspaceMount?: string
      runArgs?: string[]
      containerName?: string
    }
    const workspacePath = raw.workspaceFolder?.trim() || '/workspaces/project'
    let containerName = raw.containerName?.trim()
    if (!containerName && Array.isArray(raw.runArgs)) {
      const idx = raw.runArgs.findIndex((a) => a === '--name')
      if (idx >= 0) containerName = raw.runArgs[idx + 1]?.trim()
    }
    return { workspacePath, containerName }
  } catch {
    return null
  }
}

export async function containerSearchFiles(
  config: ContainerSandboxConfig,
  rootRel: string,
  pattern: string,
  limit: number,
): Promise<Array<{ path: string; type: 'file' | 'dir' }>> {
  const root = containerAbs(config, rootRel || '.')
  const safePattern = pattern.replace(/'/g, `'\\''`)
  const cmd = `find ${shellQuote(root)} -name '${safePattern}' 2>/dev/null | head -n ${limit}`
  const res = await runDocker(buildContainerShellCommand(config, cmd))
  const base = config.workspacePath.replace(/\/+$/, '')
  return res.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((absRemote) => {
      const rel = absRemote.startsWith(base) ? absRemote.slice(base.length).replace(/^\/+/, '') : absRemote
      return { path: rel || '.', type: 'file' as const }
    })
}

export { spawnDockerStdio }
