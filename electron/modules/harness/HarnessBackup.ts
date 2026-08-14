import type { AgentGoal, HarnessBackupSection, SessionEvent } from '@shared'
import { getDb } from '../../db/Database'
import * as SessionRepo from './SessionRepo'

interface GoalRow {
  id: string
  session_id: string
  title: string
  detail: string | null
  status: string
  created_at: string
  updated_at: string
}

function rowToGoal(row: GoalRow): AgentGoal {
  return {
    id: row.id,
    sessionId: row.session_id,
    title: row.title,
    detail: row.detail ?? undefined,
    status: row.status as AgentGoal['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function listAllGoals(): AgentGoal[] {
  const rows = getDb()
    .prepare(
      `SELECT id, session_id, title, detail, status, created_at, updated_at
       FROM agent_goals ORDER BY created_at ASC`,
    )
    .all() as GoalRow[]
  return rows.map(rowToGoal)
}

export function exportHarnessBackup(): HarnessBackupSection {
  const sessions = SessionRepo.listSessions()
  const events: SessionEvent[] = []
  for (const session of sessions) {
    events.push(...SessionRepo.listEvents(session.id))
  }
  return {
    sessions,
    events,
    goals: listAllGoals(),
    activeSessionId: SessionRepo.getActiveSessionId(),
  }
}

export function importHarnessBackup(section: HarnessBackupSection): void {
  const db = getDb()
  const insertSession = db.prepare(
    `INSERT INTO agent_sessions (id, agent_id, title, forked_from, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const insertEvent = db.prepare(
    `INSERT INTO agent_session_events (id, session_id, seq, type, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const insertGoal = db.prepare(
    `INSERT INTO agent_goals (id, session_id, title, detail, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )

  db.transaction(() => {
    db.prepare(`DELETE FROM agent_goals`).run()
    db.prepare(`DELETE FROM agent_session_events`).run()
    db.prepare(`DELETE FROM agent_sessions`).run()

    for (const session of section.sessions) {
      insertSession.run(
        session.id,
        session.agentId,
        session.title,
        session.forkedFrom ?? null,
        session.createdAt,
        session.updatedAt,
      )
    }
    for (const event of section.events) {
      insertEvent.run(
        event.id,
        event.sessionId,
        event.seq,
        event.type,
        JSON.stringify(event.payload),
        event.createdAt,
      )
    }
    for (const goal of section.goals) {
      insertGoal.run(
        goal.id,
        goal.sessionId,
        goal.title,
        goal.detail ?? null,
        goal.status,
        goal.createdAt,
        goal.updatedAt,
      )
    }
    SessionRepo.setActiveSessionId(section.activeSessionId)
  })()
}
