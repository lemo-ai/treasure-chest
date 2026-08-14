import { spawn, type ChildProcess } from 'node:child_process'
import { resolveSandboxPath, sandboxRelative } from './Sandbox'
import { getActiveSshSandboxConfig, sshRunShell, type SshSandboxConfig } from './RemoteSandbox'

export type ShellJobStatus = 'running' | 'complete' | 'failed' | 'killed'

export interface ShellJob {
  id: string
  sessionId?: string
  command: string
  cwd: string
  status: ShellJobStatus
  exitCode: number | null
  stdout: string
  stderr: string
  startedAt: string
  endedAt?: string
  pid?: number
  remote?: boolean
}

interface RemoteJobMeta {
  config: SshSandboxConfig
  logRel: string
  pidRel: string
}

const MAX_JOB_OUTPUT = 256_000
const jobs = new Map<string, ShellJob>()
const processes = new Map<string, ChildProcess>()
const remoteMeta = new Map<string, RemoteJobMeta>()

function uid(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function trimOutput(text: string): string {
  if (text.length <= MAX_JOB_OUTPUT) return text
  return text.slice(0, MAX_JOB_OUTPUT) + '\n…[truncated]'
}

function remoteAbs(config: SshSandboxConfig, rel: string): string {
  const base = config.remotePath.replace(/\/+$/, '') || '.'
  const clean = rel.replace(/^\.[/\\]/, '').replace(/\\/g, '/')
  return `${base}/${clean}`.replace(/\/+/g, '/')
}

function shellQuote(raw: string): string {
  return `'${raw.replace(/'/g, `'\\''`)}'`
}

export interface ShellJobCallbacks {
  onOutput?: (stream: 'stdout' | 'stderr', delta: string) => void
}

export function startBackgroundShellJob(
  command: string,
  cwdRel: string,
  sessionId?: string,
  callbacks: ShellJobCallbacks = {},
): ShellJob {
  const id = uid()
  const cwd = resolveSandboxPath(cwdRel || '.')
  const job: ShellJob = {
    id,
    sessionId,
    command,
    cwd: sandboxRelative(cwd),
    status: 'running',
    exitCode: null,
    stdout: '',
    stderr: '',
    startedAt: new Date().toISOString(),
    remote: false,
  }
  jobs.set(id, job)

  const proc = spawn(command, {
    shell: true,
    cwd,
    env: { ...process.env, TERM: 'dumb' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })
  processes.set(id, proc)
  job.pid = proc.pid

  proc.stdout.on('data', (chunk: Buffer) => {
    const delta = chunk.toString('utf8')
    job.stdout = trimOutput(job.stdout + delta)
    callbacks.onOutput?.('stdout', delta)
  })
  proc.stderr.on('data', (chunk: Buffer) => {
    const delta = chunk.toString('utf8')
    job.stderr = trimOutput(job.stderr + delta)
    callbacks.onOutput?.('stderr', delta)
  })
  proc.on('error', (err) => {
    job.status = 'failed'
    job.exitCode = 1
    job.endedAt = new Date().toISOString()
    job.stderr = trimOutput(`${job.stderr}\n${err.message}`.trim())
    processes.delete(id)
  })
  proc.on('close', (code) => {
    job.status = job.status === 'killed' ? 'killed' : code === 0 ? 'complete' : 'failed'
    job.exitCode = code
    job.endedAt = new Date().toISOString()
    processes.delete(id)
  })

  return job
}

export async function startBackgroundShellJobAsync(
  command: string,
  cwdRel: string,
  sessionId?: string,
  callbacks: ShellJobCallbacks = {},
): Promise<ShellJob> {
  const ssh = getActiveSshSandboxConfig()
  if (!ssh) {
    return startBackgroundShellJob(command, cwdRel, sessionId, callbacks)
  }

  const id = uid()
  const logRel = `.harness-jobs/${id}.log`
  const pidRel = `.harness-jobs/${id}.pid`
  const logRemote = remoteAbs(ssh, logRel)
  const pidRemote = remoteAbs(ssh, pidRel)
  const jobsDirRemote = remoteAbs(ssh, '.harness-jobs')

  const startCmd =
    `mkdir -p ${shellQuote(jobsDirRemote)} && ` +
    `cd ${shellQuote(remoteAbs(ssh, cwdRel || '.'))} && ` +
    `nohup sh -c ${shellQuote(command)} > ${shellQuote(logRemote)} 2>&1 & ` +
    `echo $! > ${shellQuote(pidRemote)} && cat ${shellQuote(pidRemote)}`

  const res = await sshRunShell(ssh, startCmd, cwdRel || '.')
  if (res.exitCode !== 0) {
    throw new Error(res.stderr.trim() || `remote job start failed (${res.exitCode})`)
  }

  const pid = Number(res.stdout.trim().split('\n').pop()?.trim())
  const job: ShellJob = {
    id,
    sessionId,
    command,
    cwd: cwdRel || '.',
    status: 'running',
    exitCode: null,
    stdout: '',
    stderr: '',
    startedAt: new Date().toISOString(),
    pid: Number.isFinite(pid) ? pid : undefined,
    remote: true,
  }
  jobs.set(id, job)
  remoteMeta.set(id, { config: ssh, logRel, pidRel })
  return job
}

async function refreshRemoteJob(job: ShellJob): Promise<void> {
  const meta = remoteMeta.get(job.id)
  if (!meta || job.status !== 'running') return

  const pidRemote = remoteAbs(meta.config, meta.pidRel)
  const logRemote = remoteAbs(meta.config, meta.logRel)

  const aliveRes = await sshRunShell(
    meta.config,
    `[ -f ${shellQuote(pidRemote)} ] && kill -0 $(cat ${shellQuote(pidRemote)}) 2>/dev/null && echo running || echo done`,
    '.',
  )
  const logRes = await sshRunShell(
    meta.config,
    `[ -f ${shellQuote(logRemote)} ] && tail -c 32000 ${shellQuote(logRemote)} || true`,
    '.',
  )
  if (logRes.stdout) {
    job.stdout = trimOutput(logRes.stdout)
  }

  if (aliveRes.stdout.trim() === 'done') {
    job.status = 'complete'
    job.exitCode = 0
    job.endedAt = new Date().toISOString()
  }
}

export async function getShellJobFresh(jobId: string): Promise<ShellJob | null> {
  const job = jobs.get(jobId.trim()) ?? null
  if (!job) return null
  if (job.remote) await refreshRemoteJob(job)
  return job
}

export function getShellJob(jobId: string): ShellJob | null {
  return jobs.get(jobId.trim()) ?? null
}

export function listShellJobs(sessionId?: string): ShellJob[] {
  const sid = sessionId?.trim()
  const all = [...jobs.values()]
  if (!sid) return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return all.filter((j) => j.sessionId === sid).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function killShellJob(jobId: string): boolean {
  const id = jobId.trim()
  const proc = processes.get(id)
  const job = jobs.get(id)
  if (!proc || !job) return false
  job.status = 'killed'
  job.endedAt = new Date().toISOString()
  proc.kill('SIGTERM')
  processes.delete(id)
  return true
}

export async function killShellJobAsync(jobId: string): Promise<boolean> {
  const id = jobId.trim()
  const meta = remoteMeta.get(id)
  const job = jobs.get(id)
  if (!meta || !job) return killShellJob(id)

  const pidRemote = remoteAbs(meta.config, meta.pidRel)
  await sshRunShell(
    meta.config,
    `[ -f ${shellQuote(pidRemote)} ] && kill $(cat ${shellQuote(pidRemote)}) 2>/dev/null; rm -f ${shellQuote(pidRemote)}`,
    '.',
  )
  job.status = 'killed'
  job.endedAt = new Date().toISOString()
  remoteMeta.delete(id)
  return true
}
