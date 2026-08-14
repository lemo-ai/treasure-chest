import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolveSandboxPath, ensureSandboxRoot } from './Sandbox'
import { getActiveSshSandboxConfig, sshRunShell } from './RemoteSandbox'
import { getActiveContainerSandboxConfig, containerRunShell } from './ContainerSandbox'

function jsonError(message: string): string {
  return JSON.stringify({ error: message })
}

function runGitLocal(args: string[], cwdRel: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const cwd = resolveSandboxPath(cwdRel || '.')
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
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

async function runGit(args: string[], cwdRel: string): Promise<{ exitCode: number; stdout: string; stderr: string; remote?: boolean }> {
  const cmd = `git ${args.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ')}`
  const cwd = cwdRel || '.'
  const ssh = getActiveSshSandboxConfig()
  if (ssh) {
    const res = await sshRunShell(ssh, cmd, cwd)
    return { exitCode: res.exitCode, stdout: res.stdout, stderr: res.stderr, remote: true }
  }
  const container = getActiveContainerSandboxConfig()
  if (container) {
    const res = await containerRunShell(container, cmd, cwd)
    return { exitCode: res.exitCode, stdout: res.stdout, stderr: res.stderr, remote: true }
  }
  const res = await runGitLocal(args, cwdRel)
  return res
}

function ensureGitRepo(cwdRel: string): string | null {
  const root = resolveSandboxPath(cwdRel || '.')
  const check = existsSync(root) ? root : ensureSandboxRoot()
  return check
}

export async function gitStatusTool(args: Record<string, unknown>): Promise<string> {
  const cwdRel = String(args.cwd || '.').trim() || '.'
  try {
    ensureGitRepo(cwdRel)
    const res = await runGit(['status', '--porcelain', '-b'], cwdRel)
    if (res.exitCode !== 0) {
      return jsonError(res.stderr.trim() || `git status failed (${res.exitCode})`)
    }
    return JSON.stringify({
      cwd: cwdRel,
      output: res.stdout.trim(),
      remote: res.remote ?? false,
    })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err))
  }
}

export async function gitDiffTool(args: Record<string, unknown>): Promise<string> {
  const cwdRel = String(args.cwd || '.').trim() || '.'
  const path = String(args.path || '').trim()
  const staged = Boolean(args.staged)
  try {
    ensureGitRepo(cwdRel)
    const gitArgs = ['diff']
    if (staged) gitArgs.push('--cached')
    if (path) gitArgs.push('--', path)
    const res = await runGit(gitArgs, cwdRel)
    if (res.exitCode !== 0) {
      return jsonError(res.stderr.trim() || `git diff failed (${res.exitCode})`)
    }
    return JSON.stringify({
      cwd: cwdRel,
      path: path || null,
      staged,
      diff: res.stdout,
      remote: res.remote ?? false,
    })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err))
  }
}

export async function gitCommitTool(args: Record<string, unknown>): Promise<string> {
  const cwdRel = String(args.cwd || '.').trim() || '.'
  const message = String(args.message || '').trim()
  if (!message) return jsonError('message required')
  try {
    ensureGitRepo(cwdRel)
    const addPaths = String(args.paths || '').trim()
    if (addPaths) {
      const addRes = await runGit(['add', ...addPaths.split(/\s+/).filter(Boolean)], cwdRel)
      if (addRes.exitCode !== 0) {
        return jsonError(addRes.stderr.trim() || `git add failed (${addRes.exitCode})`)
      }
    }
    const res = await runGit(['commit', '-m', message], cwdRel)
    if (res.exitCode !== 0) {
      return jsonError(res.stderr.trim() || res.stdout.trim() || `git commit failed (${res.exitCode})`)
    }
    return JSON.stringify({
      ok: true,
      cwd: cwdRel,
      output: res.stdout.trim(),
      remote: res.remote ?? false,
    })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err))
  }
}

export const GIT_TOOL_NAMES = ['git_status', 'git_diff', 'git_commit'] as const

export async function executeGitTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'git_status':
      return gitStatusTool(args)
    case 'git_diff':
      return gitDiffTool(args)
    case 'git_commit':
      return gitCommitTool(args)
    default:
      return jsonError(`unknown git tool: ${name}`)
  }
}
