import { randomBytes } from 'node:crypto'
import type {
  AddArtifactInput,
  ArtifactKind,
  ArtifactSource,
  ListArtifactsInput,
  WorkbenchArtifact,
} from '@shared'
import { getDb } from '../../db/Database'

function nowIso(): string {
  return new Date().toISOString()
}

function uid(): string {
  return `art_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`
}

interface ArtifactRow {
  id: string
  session_id: string | null
  project_id: string | null
  message_id: string | null
  kind: string
  title: string
  content: string
  language: string | null
  source: string
  created_at: string
}

function rowToArtifact(row: ArtifactRow): WorkbenchArtifact {
  return {
    id: row.id,
    sessionId: row.session_id || undefined,
    projectId: row.project_id || undefined,
    messageId: row.message_id || undefined,
    kind: row.kind as ArtifactKind,
    title: row.title,
    content: row.content,
    language: row.language || undefined,
    source: (row.source as ArtifactSource) || 'turn',
    createdAt: row.created_at,
  }
}

export function listArtifacts(input: ListArtifactsInput = {}): WorkbenchArtifact[] {
  const db = getDb()
  const limit = Math.min(400, Math.max(1, input.limit ?? 200))
  let rows: ArtifactRow[]
  if (input.sessionId && input.projectId) {
    rows = db
      .prepare(
        `SELECT * FROM workbench_artifacts
         WHERE session_id = ? OR project_id = ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(input.sessionId, input.projectId, limit) as ArtifactRow[]
  } else if (input.sessionId) {
    rows = db
      .prepare(
        `SELECT * FROM workbench_artifacts WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(input.sessionId, limit) as ArtifactRow[]
  } else if (input.projectId) {
    rows = db
      .prepare(
        `SELECT * FROM workbench_artifacts WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(input.projectId, limit) as ArtifactRow[]
  } else {
    rows = db
      .prepare(`SELECT * FROM workbench_artifacts ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as ArtifactRow[]
  }
  return rows.map(rowToArtifact)
}

export function getArtifact(id: string): WorkbenchArtifact | null {
  const row = getDb()
    .prepare(`SELECT * FROM workbench_artifacts WHERE id = ?`)
    .get(id) as ArtifactRow | undefined
  return row ? rowToArtifact(row) : null
}

export function addArtifact(input: AddArtifactInput): WorkbenchArtifact {
  const kind = input.kind
  const title = String(input.title || kind).trim().slice(0, 80) || kind
  const content = String(input.content || '')
  if (!content) throw new Error('artifact_empty')
  const db = getDb()
  const sessionId = input.sessionId?.trim() || null
  const projectId = input.projectId?.trim() || null

  // Dedupe same session/project + kind + content
  if (sessionId) {
    const exists = db
      .prepare(
        `SELECT id FROM workbench_artifacts WHERE session_id = ? AND kind = ? AND content = ? LIMIT 1`,
      )
      .get(sessionId, kind, content) as { id: string } | undefined
    if (exists) {
      const hit = getArtifact(exists.id)
      if (hit) return hit
    }
  }

  const art: WorkbenchArtifact = {
    id: input.id?.trim() || uid(),
    sessionId: sessionId || undefined,
    projectId: projectId || undefined,
    messageId: input.messageId,
    kind,
    title,
    content,
    language: input.language,
    source: input.source || 'turn',
    createdAt: nowIso(),
  }
  db.prepare(
    `INSERT INTO workbench_artifacts
       (id, session_id, project_id, message_id, kind, title, content, language, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    art.id,
    sessionId,
    projectId,
    art.messageId ?? null,
    art.kind,
    art.title,
    art.content,
    art.language ?? null,
    art.source,
    art.createdAt,
  )

  // Cap total
  const extras = db
    .prepare(`SELECT id FROM workbench_artifacts ORDER BY created_at DESC LIMIT -1 OFFSET 400`)
    .all() as Array<{ id: string }>
  if (extras.length) {
    const del = db.prepare(`DELETE FROM workbench_artifacts WHERE id = ?`)
    for (const row of extras) del.run(row.id)
  }
  return art
}

export function removeArtifact(id: string): boolean {
  const info = getDb().prepare(`DELETE FROM workbench_artifacts WHERE id = ?`).run(id)
  return info.changes > 0
}

export function clearSessionArtifacts(sessionId: string): number {
  const info = getDb()
    .prepare(`DELETE FROM workbench_artifacts WHERE session_id = ?`)
    .run(sessionId)
  return info.changes
}

export function migrateLocalArtifacts(
  items: Array<{
    id?: string
    sessionId: string
    messageId?: string
    kind: ArtifactKind
    title: string
    content: string
    language?: string
    createdAt?: string
  }>,
): { imported: number } {
  const db = getDb()
  let imported = 0
  const insert = db.prepare(
    `INSERT OR IGNORE INTO workbench_artifacts
       (id, session_id, project_id, message_id, kind, title, content, language, source, created_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'migrated', ?)`,
  )
  const tx = db.transaction(() => {
    for (const a of items) {
      const content = String(a.content || '')
      if (!content) continue
      const id = a.id?.trim() || uid()
      const info = insert.run(
        id,
        a.sessionId,
        a.messageId ?? null,
        a.kind,
        String(a.title || a.kind).slice(0, 80),
        content,
        a.language ?? null,
        a.createdAt || nowIso(),
      )
      if (info.changes > 0) imported += 1
    }
  })
  tx()
  return { imported }
}
