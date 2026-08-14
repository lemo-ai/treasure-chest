import { logger } from '../../../utils/logger'
import { getSandboxRoot } from './Sandbox'
import { getActiveSshSandboxConfig } from './RemoteSandbox'
import { getActiveContainerSandboxConfig } from './ContainerSandbox'

export interface PtySessionInfo {
  id: string
  cwd: string
  pid?: number
  remote?: boolean
  backend?: 'local' | 'ssh' | 'container'
}

type PtyOutputHandler = (ptyId: string, data: string) => void
type PtyExitHandler = (ptyId: string, exitCode: number) => void

interface ActivePty {
  id: string
  cwd: string
  kill: () => void
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
}

const sessions = new Map<string, ActivePty>()

function shellCommand(): string {
  if (process.platform === 'win32') return process.env.COMSPEC || 'cmd.exe'
  return process.env.SHELL || '/bin/zsh'
}

function shellQuote(raw: string): string {
  return `'${raw.replace(/'/g, `'\\''`)}'`
}

function uid(): string {
  return `pty_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function spawnPty(
  file: string,
  args: string[],
  opts: { cols: number; rows: number; cwd?: string; env?: NodeJS.ProcessEnv },
): { pid?: number; onData: (cb: (data: string) => void) => void; onExit: (cb: (ev: { exitCode: number }) => void) => void; write: (data: string) => void; resize: (cols: number, rows: number) => void; kill: () => void } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pty = require('node-pty') as typeof import('node-pty')
  const proc = pty.spawn(file, args, {
    name: 'xterm-256color',
    cols: Math.max(opts.cols, 10),
    rows: Math.max(opts.rows, 3),
    cwd: opts.cwd,
    env: {
      ...process.env,
      ...opts.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
  })
  return proc
}

export function createPtySession(
  cols: number,
  rows: number,
  onData: PtyOutputHandler,
  onExit: PtyExitHandler,
  cwd?: string,
): PtySessionInfo {
  const id = uid()
  const container = getActiveContainerSandboxConfig()
  const ssh = getActiveSshSandboxConfig()

  if (container) {
    const remoteShell = '/bin/bash'
    const workspace = container.workspacePath.replace(/\/+$/, '') || '/workspace'
    const proc = spawnPty(
      'docker',
      ['exec', '-it', '-w', workspace, container.containerName, remoteShell],
      { cols, rows },
    )
    proc.onData((data) => onData(id, data))
    proc.onExit(({ exitCode }) => {
      sessions.delete(id)
      onExit(id, exitCode ?? 0)
    })
    sessions.set(id, {
      id,
      cwd: workspace,
      kill: () => {
        try {
          proc.kill()
        } catch (err) {
          logger.warn('container pty kill failed', err)
        }
      },
      write: (data) => proc.write(data),
      resize: (c, r) => {
        try {
          proc.resize(Math.max(c, 10), Math.max(r, 3))
        } catch {
          /* ignore */
        }
      },
    })
    return { id, cwd: workspace, pid: proc.pid, remote: true, backend: 'container' }
  }

  if (ssh) {
    const remoteShell = '/bin/bash'
    const remotePath = ssh.remotePath.replace(/\/+$/, '') || '.'
    const args = ['-t', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new']
    if (ssh.port) args.push('-p', String(ssh.port))
    const remoteCmd = `cd ${shellQuote(remotePath)} && exec ${remoteShell}`
    args.push(`${ssh.user}@${ssh.host}`, remoteCmd)
    const proc = spawnPty('ssh', args, { cols, rows })
    proc.onData((data) => onData(id, data))
    proc.onExit(({ exitCode }) => {
      sessions.delete(id)
      onExit(id, exitCode ?? 0)
    })
    sessions.set(id, {
      id,
      cwd: remotePath,
      kill: () => {
        try {
          proc.kill()
        } catch (err) {
          logger.warn('ssh pty kill failed', err)
        }
      },
      write: (data) => proc.write(data),
      resize: (c, r) => {
        try {
          proc.resize(Math.max(c, 10), Math.max(r, 3))
        } catch {
          /* ignore */
        }
      },
    })
    return { id, cwd: remotePath, pid: proc.pid, remote: true, backend: 'ssh' }
  }

  const workdir = cwd?.trim() || getSandboxRoot()
  const shell = shellCommand()
  const proc = spawnPty(shell, [], { cols, rows, cwd: workdir })
  proc.onData((data) => onData(id, data))
  proc.onExit(({ exitCode }) => {
    sessions.delete(id)
    onExit(id, exitCode ?? 0)
  })

  sessions.set(id, {
    id,
    cwd: workdir,
    kill: () => {
      try {
        proc.kill()
      } catch (err) {
        logger.warn('pty kill failed', err)
      }
    },
    write: (data) => proc.write(data),
    resize: (c, r) => {
      try {
        proc.resize(Math.max(c, 10), Math.max(r, 3))
      } catch {
        /* ignore */
      }
    },
  })

  return { id, cwd: workdir, pid: proc.pid, backend: 'local' }
}

export function writePtySession(ptyId: string, data: string): boolean {
  const hit = sessions.get(ptyId.trim())
  if (!hit) return false
  hit.write(data)
  return true
}

export function resizePtySession(ptyId: string, cols: number, rows: number): boolean {
  const hit = sessions.get(ptyId.trim())
  if (!hit) return false
  hit.resize(cols, rows)
  return true
}

export function killPtySession(ptyId: string): boolean {
  const id = ptyId.trim()
  const hit = sessions.get(id)
  if (!hit) return false
  hit.kill()
  sessions.delete(id)
  return true
}

export function listPtySessions(): PtySessionInfo[] {
  return [...sessions.values()].map((s) => ({ id: s.id, cwd: s.cwd }))
}
