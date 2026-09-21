import { randomBytes } from 'node:crypto'
import type {
  AgentSession,
  HarnessMessage,
  MigrateLocalHarnessInput,
  SessionEvent,
  SessionEventPayload,
  SessionEventType,
} from '@shared'
import { getDb } from '../../db/Database'
import { deriveMessagesFromEvents } from './MessageDeriver'

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`
}

function nowIso(): string {
  return new Date().toISOString()
}

export function listSessions(agentId?: string, projectId?: string | null): AgentSession[] {
  const db = getDb()
  let rows: SessionRow[]
  if (agentId && projectId) {
    rows = db
      .prepare(
        `SELECT id, agent_id, title, forked_from, project_id, created_at, updated_at
         FROM agent_sessions WHERE agent_id = ? AND project_id = ? ORDER BY updated_at DESC`,
      )
      .all(agentId, projectId) as SessionRow[]
  } else if (agentId) {
    rows = db
      .prepare(
        `SELECT id, agent_id, title, forked_from, project_id, created_at, updated_at
         FROM agent_sessions WHERE agent_id = ? ORDER BY updated_at DESC`,
      )
      .all(agentId) as SessionRow[]
  } else if (projectId) {
    rows = db
      .prepare(
        `SELECT id, agent_id, title, forked_from, project_id, created_at, updated_at
         FROM agent_sessions WHERE project_id = ? ORDER BY updated_at DESC`,
      )
      .all(projectId) as SessionRow[]
  } else {
    rows = db
      .prepare(
        `SELECT id, agent_id, title, forked_from, project_id, created_at, updated_at
         FROM agent_sessions ORDER BY updated_at DESC`,
      )
      .all() as SessionRow[]
  }
  return rows.map(rowToSession)
}

interface SessionRow {
  id: string
  agent_id: string
  title: string
  forked_from: string | null
  project_id: string | null
  created_at: string
  updated_at: string
}

function rowToSession(row: SessionRow): AgentSession {
  return {
    id: row.id,
    agentId: row.agent_id,
    title: row.title,
    forkedFrom: row.forked_from ?? undefined,
    projectId: row.project_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getSession(id: string): AgentSession | null {
  const row = getDb()
    .prepare(
      `SELECT id, agent_id, title, forked_from, project_id, created_at, updated_at
       FROM agent_sessions WHERE id = ?`,
    )
    .get(id) as SessionRow | undefined
  return row ? rowToSession(row) : null
}

export function createSession(
  agentId: string,
  title: string,
  id?: string,
  projectId?: string | null,
): AgentSession {
  const db = getDb()
  const session: AgentSession = {
    id: id ?? uid('ses'),
    agentId,
    title,
    projectId: projectId?.trim() || undefined,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  db.prepare(
    `INSERT INTO agent_sessions (id, agent_id, title, forked_from, project_id, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?)`,
  ).run(
    session.id,
    session.agentId,
    session.title,
    session.projectId ?? null,
    session.createdAt,
    session.updatedAt,
  )
  return session
}

export function renameSession(id: string, title: string): boolean {
  const ts = nowIso()
  const info = getDb()
    .prepare(`UPDATE agent_sessions SET title = ?, updated_at = ? WHERE id = ?`)
    .run(title, ts, id)
  return info.changes > 0
}

export function touchSession(id: string): void {
  getDb()
    .prepare(`UPDATE agent_sessions SET updated_at = ? WHERE id = ?`)
    .run(nowIso(), id)
}

export function deleteSession(id: string): boolean {
  const db = getDb()
  const tx = db.transaction((sessionId: string) => {
    db.prepare(`DELETE FROM agent_goals WHERE session_id = ?`).run(sessionId)
    db.prepare(`DELETE FROM agent_session_events WHERE session_id = ?`).run(sessionId)
    return db.prepare(`DELETE FROM agent_sessions WHERE id = ?`).run(sessionId)
  })
  const info = tx(id)
  return info.changes > 0
}

export function getActiveSessionId(): string | null {
  const row = getDb()
    .prepare(`SELECT value FROM app_settings WHERE key = 'harness.activeSessionId'`)
    .get() as { value: string } | undefined
  if (!row?.value) return null
  try {
    const parsed = JSON.parse(row.value) as string | null
    return typeof parsed === 'string' ? parsed : null
  } catch {
    return null
  }
}

function readActiveSessionIdByAgentRaw(): Record<string, string | null> {
  const row = getDb()
    .prepare(`SELECT value FROM app_settings WHERE key = 'harness.activeSessionIdByAgent'`)
    .get() as { value: string } | undefined
  if (!row?.value) return {}
  try {
    const parsed = JSON.parse(row.value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' || v === null) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function writeActiveSessionIdByAgent(map: Record<string, string | null>): void {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run('harness.activeSessionIdByAgent', JSON.stringify(map), nowIso())
}

/** Per-agent active session map; seeds from legacy global pointer when empty. */
export function getActiveSessionIdByAgent(): Record<string, string | null> {
  const map = readActiveSessionIdByAgentRaw()
  if (Object.keys(map).length > 0) return map
  const legacy = getActiveSessionId()
  if (!legacy) return {}
  const session = getSession(legacy)
  if (!session) return {}
  const seeded = { [session.agentId]: legacy }
  writeActiveSessionIdByAgent(seeded)
  return seeded
}

export function getActiveSessionIdForAgent(agentId: string): string | null {
  const map = getActiveSessionIdByAgent()
  const id = map[agentId]
  return typeof id === 'string' ? id : null
}

export function setActiveSessionId(id: string | null, agentId?: string): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run('harness.activeSessionId', JSON.stringify(id), nowIso())

  const map = { ...getActiveSessionIdByAgent() }
  let resolvedAgent = agentId
  if (!resolvedAgent && id) {
    resolvedAgent = getSession(id)?.agentId
  }
  if (resolvedAgent) {
    map[resolvedAgent] = id
    writeActiveSessionIdByAgent(map)
  }
}

export function setActiveSessionIdByAgentMap(map: Record<string, string | null>): void {
  writeActiveSessionIdByAgent(map)
}

interface EventRow {
  id: string
  session_id: string
  seq: number
  type: string
  payload: string
  created_at: string
}

export function listEvents(sessionId: string): SessionEvent[] {
  const rows = getDb()
    .prepare(
      `SELECT id, session_id, seq, type, payload, created_at
       FROM agent_session_events WHERE session_id = ? ORDER BY seq ASC`,
    )
    .all(sessionId) as EventRow[]
  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    seq: row.seq,
    type: row.type as SessionEventType,
    payload: JSON.parse(row.payload) as SessionEventPayload,
    createdAt: row.created_at,
  }))
}

export function appendEvent(
  sessionId: string,
  type: SessionEventType,
  payload: SessionEventPayload,
): SessionEvent {
  const db = getDb()
  const seqRow = db
    .prepare(`SELECT COALESCE(MAX(seq), 0) AS max_seq FROM agent_session_events WHERE session_id = ?`)
    .get(sessionId) as { max_seq: number }
  const seq = (seqRow?.max_seq ?? 0) + 1
  const event: SessionEvent = {
    id: uid('evt'),
    sessionId,
    seq,
    type,
    payload,
    createdAt: nowIso(),
  }
  db.prepare(
    `INSERT INTO agent_session_events (id, session_id, seq, type, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(event.id, event.sessionId, event.seq, event.type, JSON.stringify(event.payload), event.createdAt)
  touchSession(sessionId)
  return event
}

export function deriveMessages(sessionId: string): HarnessMessage[] {
  return deriveMessagesFromEvents(listEvents(sessionId))
}

export function appendUserMessage(sessionId: string, content: string): HarnessMessage {
  appendEvent(sessionId, 'user/message', { content })
  const messages = deriveMessages(sessionId)
  const last = messages.at(-1)!
  const session = getSession(sessionId)
  if (session && (session.title === '新会话' || session.title === 'New chat')) {
    renameSession(sessionId, content.trim().slice(0, 24) || session.title)
  }
  return last
}

export function appendSystemMessage(sessionId: string, content: string): HarnessMessage {
  appendEvent(sessionId, 'user/message', { content: `[system] ${content}` })
  return deriveMessages(sessionId).at(-1)!
}

export function forkSession(
  sourceSessionId: string,
  boundarySeq?: number,
  title?: string,
): AgentSession | null {
  const source = getSession(sourceSessionId)
  if (!source) return null
  const events = listEvents(sourceSessionId)
  const filtered =
    boundarySeq != null ? events.filter((e) => e.seq <= boundarySeq) : events
  const child = createSession(
    source.agentId,
    title?.trim() || `${source.title} (fork)`,
    undefined,
    source.projectId,
  )
  getDb()
    .prepare(`UPDATE agent_sessions SET forked_from = ? WHERE id = ?`)
    .run(sourceSessionId, child.id)
  child.forkedFrom = sourceSessionId

  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO agent_session_events (id, session_id, seq, type, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const tx = db.transaction((rows: SessionEvent[]) => {
    for (const e of rows) {
      insert.run(e.id, child.id, e.seq, e.type, JSON.stringify(e.payload), e.createdAt)
    }
  })
  tx(
    filtered.map((e) => ({
      ...e,
      id: uid('evt'),
      sessionId: child.id,
    })),
  )
  return getSession(child.id)
}

export function buildStoreSnapshot(): {
  sessions: AgentSession[]
  activeSessionId: string | null
  activeSessionIdByAgent: Record<string, string | null>
  messagesBySession: Record<string, HarnessMessage[]>
} {
  const sessions = listSessions()
  const activeSessionIdByAgent = getActiveSessionIdByAgent()
  const activeSessionId = getActiveSessionId()
  const messagesBySession: Record<string, HarnessMessage[]> = {}
  for (const s of sessions) {
    messagesBySession[s.id] = deriveMessages(s.id)
  }
  return { sessions, activeSessionId, activeSessionIdByAgent, messagesBySession }
}

export function migrateFromLocal(input: MigrateLocalHarnessInput): { imported: number } {
  const db = getDb()
  const existing = db.prepare(`SELECT COUNT(*) AS c FROM agent_sessions`).get() as { c: number }
  if (existing.c > 0) return { imported: 0 }

  let imported = 0
  const tx = db.transaction(() => {
    for (const session of input.sessions) {
      db.prepare(
        `INSERT INTO agent_sessions (id, agent_id, title, forked_from, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?)`,
      ).run(session.id, session.agentId, session.title, session.createdAt, session.updatedAt)
      imported++

      const msgs = input.messagesBySession[session.id] ?? []
      let seq = 0
      for (const msg of msgs) {
        seq++
        if (msg.role === 'user' || msg.role === 'system') {
          appendEventWithSeq(
            session.id,
            seq,
            'user/message',
            {
              content: msg.role === 'system' ? `[system] ${msg.content}` : msg.content,
            },
            msg.createdAt,
          )
        } else if (msg.role === 'assistant') {
          appendEventWithSeq(
            session.id,
            seq,
            'assistant/message',
            {
              content: msg.content,
              citations: msg.citations,
              toolSteps: msg.toolSteps,
            },
            msg.createdAt,
          )
        }
      }
    }
    if (input.activeSessionId) setActiveSessionId(input.activeSessionId)
  })
  tx()
  return { imported }
}

function appendEventWithSeq(
  sessionId: string,
  seq: number,
  type: SessionEventType,
  payload: SessionEventPayload,
  createdAt: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO agent_session_events (id, session_id, seq, type, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(uid('evt'), sessionId, seq, type, JSON.stringify(payload), createdAt)
}

/**
 * After crash/quit mid-turn: close orphan turns that have turn/start without turn/end.
 * Returns number of sessions recovered.
 */
export function recoverInterruptedTurns(): { sessions: number; turns: number } {
  const sessions = listSessions()
  let turnCount = 0
  let sessionCount = 0
  for (const session of sessions) {
    const events = listEvents(session.id)
    let openTurn: number | null = null
    for (const ev of events) {
      if (ev.type === 'turn/start') {
        const idx = (ev.payload as { turnIndex?: number }).turnIndex
        openTurn = typeof idx === 'number' ? idx : openTurn
      } else if (ev.type === 'turn/end') {
        openTurn = null
      }
    }
    if (openTurn != null) {
      appendEvent(session.id, 'turn/end', { turnIndex: openTurn, reason: 'interrupted' })
      turnCount += 1
      sessionCount += 1
    }
  }
  return { sessions: sessionCount, turns: turnCount }
}

