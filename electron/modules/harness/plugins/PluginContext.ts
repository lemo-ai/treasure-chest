import type { FortuneSettings } from '@shared'
import { getCordisStack } from '../cordis/CordisLoader'
import { describeSandboxBackend } from '../coding/RemoteSandbox'
import { listGoals, setGoal } from '../GoalsStore'
import { listEvents } from '../SessionRepo'
import { sshReadFile, sshWriteFile, sshRunShell, getActiveSshSandboxConfig } from '../coding/RemoteSandbox'
import {
  containerReadFile,
  containerWriteFile,
  containerRunShell,
  getActiveContainerSandboxConfig,
} from '../coding/ContainerSandbox'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { resolveSandboxPath } from '../coding/Sandbox'
import { logger } from '../../../utils/logger'

export interface PluginRuntimeContext {
  session: {
    id: string
    agentId: string
    turnIndex: number
    stepIndex: number
  }
  sandbox: {
    mode: 'local' | 'ssh' | 'container'
    label: string
    root?: string | null
  }
  harness: ReturnType<typeof getCordisStack>['harness']
  log: {
    info: (message: string, extra?: unknown) => void
    warn: (message: string, extra?: unknown) => void
  }
  fs: {
    read: (relPath: string) => Promise<string>
    write: (relPath: string, content: string) => Promise<void>
  }
  shell: {
    run: (command: string, cwdRel?: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  }
  goals: {
    list: (includeDone?: boolean) => ReturnType<typeof listGoals>
    set: (title: string, detail?: string) => ReturnType<typeof setGoal>
  }
  events: {
    recent: (limit?: number) => ReturnType<typeof listEvents>
  }
}

export interface BuildPluginContextInput {
  sessionId: string
  agentId: string
  turnIndex: number
  stepIndex: number
  settings?: FortuneSettings
}

async function readSandboxFile(relPath: string): Promise<string> {
  const rel = relPath.replace(/^\.[/\\]/, '').replace(/\\/g, '/')
  const ssh = getActiveSshSandboxConfig()
  if (ssh) return sshReadFile(ssh, rel)
  const container = getActiveContainerSandboxConfig()
  if (container) return containerReadFile(container, rel)
  const abs = resolveSandboxPath(rel)
  if (!existsSync(abs)) throw new Error(`file not found: ${rel}`)
  return readFileSync(abs, 'utf8')
}

async function writeSandboxFile(relPath: string, content: string): Promise<void> {
  const rel = relPath.replace(/^\.[/\\]/, '').replace(/\\/g, '/')
  const ssh = getActiveSshSandboxConfig()
  if (ssh) {
    await sshWriteFile(ssh, rel, content)
    return
  }
  const container = getActiveContainerSandboxConfig()
  if (container) {
    await containerWriteFile(container, rel, content)
    return
  }
  const abs = resolveSandboxPath(rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content, 'utf8')
}

async function runSandboxShell(command: string, cwdRel = '.'): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const ssh = getActiveSshSandboxConfig()
  if (ssh) {
    const res = await sshRunShell(ssh, command, cwdRel)
    return { exitCode: res.exitCode, stdout: res.stdout, stderr: res.stderr }
  }
  const container = getActiveContainerSandboxConfig()
  if (container) {
    const res = await containerRunShell(container, command, cwdRel)
    return { exitCode: res.exitCode, stdout: res.stdout, stderr: res.stderr }
  }
  const { spawn } = await import('node:child_process')
  const cwd = resolveSandboxPath(cwdRel || '.')
  return new Promise((resolve, reject) => {
    const proc = spawn('/bin/sh', ['-lc', command], { cwd, env: process.env })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (c: Buffer) => {
      stdout += c.toString('utf8')
    })
    proc.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf8')
    })
    proc.on('error', reject)
    proc.on('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }))
  })
}

export function buildPluginContext(input: BuildPluginContextInput): PluginRuntimeContext {
  const stack = getCordisStack()
  const backend = describeSandboxBackend()
  const sessionId = input.sessionId

  return {
    session: {
      id: sessionId,
      agentId: input.agentId,
      turnIndex: input.turnIndex,
      stepIndex: input.stepIndex,
    },
    sandbox: {
      mode: backend.mode,
      label: backend.label,
      root: stack.sandboxRoot,
    },
    harness: stack.harness,
    log: {
      info: (message, extra) => logger.info(`[plugin ctx] ${message}`, extra),
      warn: (message, extra) => logger.warn(`[plugin ctx] ${message}`, extra),
    },
    fs: {
      read: readSandboxFile,
      write: writeSandboxFile,
    },
    shell: {
      run: (command, cwdRel) => runSandboxShell(command, cwdRel),
    },
    goals: {
      list: (includeDone = true) => listGoals(sessionId, includeDone),
      set: (title, detail) => setGoal(sessionId, title, detail),
    },
    events: {
      recent: (limit = 40) => listEvents(sessionId).slice(-limit),
    },
  }
}

/** Alias matching Cordis-style plugin docs. */
export type HarnessPluginCtx = PluginRuntimeContext
