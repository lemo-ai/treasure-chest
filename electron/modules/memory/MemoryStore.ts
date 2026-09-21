import { randomBytes } from 'node:crypto'
import type {
  AddMemoryFactInput,
  ListMemoryFactsInput,
  MemoryFact,
  MemoryFactSource,
  MemorySettings,
} from '@shared'
import { getDb } from '../../db/Database'
import { getSetting, setSetting } from '../../db/AppSettingsRepo'

const SETTINGS_KEY = 'memory.settings'
const MAX_FACT_LEN = 280
const MAX_PER_SCOPE = 40

function nowIso(): string {
  return new Date().toISOString()
}

function uid(): string {
  return `mem_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`
}

interface MemoryRow {
  id: string
  scope: string
  content: string
  source: string
  created_at: string
  updated_at: string
}

function rowToFact(row: MemoryRow): MemoryFact {
  return {
    id: row.id,
    scope: row.scope,
    content: row.content,
    source: (row.source as MemoryFactSource) || 'manual',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function agentMemoryScope(agentId: string): string {
  return `agent:${(agentId || 'direct').trim() || 'direct'}`
}

export function projectMemoryScope(projectId: string): string {
  return `project:${projectId.trim()}`
}

export function getMemorySettings(): MemorySettings {
  const raw = getSetting<Partial<MemorySettings>>(SETTINGS_KEY, { injectEnabled: true })
  return { injectEnabled: raw?.injectEnabled !== false }
}

export function setMemorySettings(next: Partial<MemorySettings>): MemorySettings {
  const cur = getMemorySettings()
  const merged: MemorySettings = {
    injectEnabled: next.injectEnabled !== undefined ? Boolean(next.injectEnabled) : cur.injectEnabled,
  }
  setSetting(SETTINGS_KEY, merged)
  return merged
}

export function listMemoryFacts(input: ListMemoryFactsInput = {}): MemoryFact[] {
  const scopes: string[] = []
  if (input.includeGlobal !== false) scopes.push('global')
  if (input.agentId) scopes.push(agentMemoryScope(input.agentId))
  if (input.projectId) scopes.push(projectMemoryScope(input.projectId))
  if (scopes.length === 0) return []

  const placeholders = scopes.map(() => '?').join(',')
  const rows = getDb()
    .prepare(
      `SELECT * FROM memory_facts WHERE scope IN (${placeholders}) ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(...scopes, Math.min(200, Math.max(1, input.limit ?? 80))) as MemoryRow[]
  return rows.map(rowToFact)
}

export function addMemoryFact(input: AddMemoryFactInput): MemoryFact {
  const scope = String(input.scope || '').trim()
  if (!scope) throw new Error('memory_scope_required')
  const content = String(input.content || '').trim().slice(0, MAX_FACT_LEN)
  if (!content) throw new Error('memory_empty')
  const db = getDb()
  const now = nowIso()
  const fact: MemoryFact = {
    id: uid(),
    scope,
    content,
    source: input.source || 'manual',
    createdAt: now,
    updatedAt: now,
  }
  // Deduplicate same content in scope
  db.prepare(`DELETE FROM memory_facts WHERE scope = ? AND content = ?`).run(scope, content)
  db.prepare(
    `INSERT INTO memory_facts (id, scope, content, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(fact.id, fact.scope, fact.content, fact.source, fact.createdAt, fact.updatedAt)

  // Cap per scope
  const extras = db
    .prepare(
      `SELECT id FROM memory_facts WHERE scope = ? ORDER BY updated_at DESC LIMIT -1 OFFSET ?`,
    )
    .all(scope, MAX_PER_SCOPE) as Array<{ id: string }>
  if (extras.length) {
    const del = db.prepare(`DELETE FROM memory_facts WHERE id = ?`)
    for (const row of extras) del.run(row.id)
  }
  return fact
}

export function updateMemoryFact(id: string, content: string): MemoryFact | null {
  const text = String(content || '').trim().slice(0, MAX_FACT_LEN)
  if (!text) return null
  const db = getDb()
  const row = db.prepare(`SELECT * FROM memory_facts WHERE id = ?`).get(id) as MemoryRow | undefined
  if (!row) return null
  const now = nowIso()
  db.prepare(`UPDATE memory_facts SET content = ?, updated_at = ? WHERE id = ?`).run(text, now, id)
  return { ...rowToFact(row), content: text, updatedAt: now }
}

export function removeMemoryFact(id: string): boolean {
  const info = getDb().prepare(`DELETE FROM memory_facts WHERE id = ?`).run(id)
  return info.changes > 0
}

export function clearMemoryScope(scope: string): number {
  const info = getDb().prepare(`DELETE FROM memory_facts WHERE scope = ?`).run(scope)
  return info.changes
}

/** Prompt strings: newest first, inject toggle respected. */
export function memoryFactsForPrompt(input: {
  agentId?: string
  projectId?: string
  limit?: number
}): string[] {
  if (!getMemorySettings().injectEnabled) return []
  return listMemoryFacts({
    includeGlobal: true,
    agentId: input.agentId,
    projectId: input.projectId,
    limit: input.limit ?? 20,
  }).map((f) => f.content)
}

export function migrateLocalMemoryFacts(
  facts: Array<{
    id?: string
    agentId: string
    content: string
    source?: string
    createdAt?: string
    updatedAt?: string
  }>,
): { imported: number } {
  const db = getDb()
  let imported = 0
  const insert = db.prepare(
    `INSERT OR IGNORE INTO memory_facts (id, scope, content, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const tx = db.transaction(() => {
    for (const f of facts) {
      const content = String(f.content || '').trim().slice(0, MAX_FACT_LEN)
      if (!content) continue
      const scope = agentMemoryScope(f.agentId)
      const id = f.id?.trim() || uid()
      const now = nowIso()
      const info = insert.run(
        id,
        scope,
        content,
        f.source || 'migrated',
        f.createdAt || now,
        f.updatedAt || now,
      )
      if (info.changes > 0) imported += 1
    }
  })
  tx()
  return { imported }
}
