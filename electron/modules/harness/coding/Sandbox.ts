import { app } from 'electron'
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { isAbsolute, join, normalize, relative } from 'node:path'
import { getDb } from '../../../db/Database'

const SANDBOX_KEY = 'harness.sandboxRoot'

function nowIso(): string {
  return new Date().toISOString()
}

export function defaultSandboxRoot(): string {
  return join(app.getPath('userData'), 'harness-workspace')
}

export function getSandboxRoot(): string {
  const row = getDb()
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(SANDBOX_KEY) as { value: string } | undefined
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value) as string
      if (typeof parsed === 'string' && parsed.trim()) return parsed.trim()
    } catch {
      /* fall through */
    }
  }
  const root = defaultSandboxRoot()
  ensureSandboxRoot(root)
  return root
}

export function setSandboxRoot(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) throw new Error('sandbox path empty')
  ensureSandboxRoot(trimmed)
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(SANDBOX_KEY, JSON.stringify(trimmed), nowIso())
  return trimmed
}

export function ensureSandboxRoot(root?: string): string {
  const dir = root ?? getSandboxRoot()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Resolve user path inside sandbox; rejects escapes. */
export function resolveSandboxPath(userPath: string): string {
  const root = realpathSync(ensureSandboxRoot())
  const raw = (userPath || '').trim() || '.'
  const candidate = isAbsolute(raw) ? raw : join(root, raw)
  const normalized = normalize(candidate)
  let resolved: string
  try {
    resolved = existsSync(normalized) ? realpathSync(normalized) : normalized
  } catch {
    resolved = normalized
  }
  const rel = relative(root, resolved)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path escapes sandbox: ${userPath}`)
  }
  return resolved
}

export function sandboxRelative(absPath: string): string {
  const root = realpathSync(ensureSandboxRoot())
  return relative(root, absPath) || '.'
}
