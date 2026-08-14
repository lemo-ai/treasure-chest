import { randomBytes } from 'node:crypto'
import type { AgentGoal, AgentGoalStatus } from '@shared'
import { getDb } from '../../db/Database'
import { appendEvent } from './SessionRepo'

function uid(): string {
  return `goal_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`
}

function nowIso(): string {
  return new Date().toISOString()
}

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
    status: row.status as AgentGoalStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listGoals(sessionId: string, includeDone = true): AgentGoal[] {
  const rows = includeDone
    ? (getDb()
        .prepare(
          `SELECT id, session_id, title, detail, status, created_at, updated_at
           FROM agent_goals WHERE session_id = ? ORDER BY created_at ASC`,
        )
        .all(sessionId) as GoalRow[])
    : (getDb()
        .prepare(
          `SELECT id, session_id, title, detail, status, created_at, updated_at
           FROM agent_goals WHERE session_id = ? AND status = 'active' ORDER BY created_at ASC`,
        )
        .all(sessionId) as GoalRow[])
  return rows.map(rowToGoal)
}

export function setGoal(sessionId: string, title: string, detail?: string): AgentGoal {
  const ts = nowIso()
  const goal: AgentGoal = {
    id: uid(),
    sessionId,
    title: title.trim(),
    detail: detail?.trim() || undefined,
    status: 'active',
    createdAt: ts,
    updatedAt: ts,
  }
  getDb()
    .prepare(
      `INSERT INTO agent_goals (id, session_id, title, detail, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(goal.id, goal.sessionId, goal.title, goal.detail ?? null, goal.status, goal.createdAt, goal.updatedAt)
  appendEvent(sessionId, 'goal/set', { goalId: goal.id, title: goal.title, detail: goal.detail })
  return goal
}

export function updateGoal(
  sessionId: string,
  goalId: string,
  status: AgentGoalStatus,
  detail?: string,
): AgentGoal | null {
  const existing = getDb()
    .prepare(`SELECT id FROM agent_goals WHERE id = ? AND session_id = ?`)
    .get(goalId, sessionId) as { id: string } | undefined
  if (!existing) return null
  const ts = nowIso()
  getDb()
    .prepare(`UPDATE agent_goals SET status = ?, detail = COALESCE(?, detail), updated_at = ? WHERE id = ?`)
    .run(status, detail?.trim() ?? null, ts, goalId)
  appendEvent(sessionId, 'goal/update', { goalId, status, detail: detail?.trim() })
  const row = getDb()
    .prepare(
      `SELECT id, session_id, title, detail, status, created_at, updated_at FROM agent_goals WHERE id = ?`,
    )
    .get(goalId) as GoalRow
  return rowToGoal(row)
}

export function goalsPromptSection(sessionId: string): string {
  const active = listGoals(sessionId, false)
  if (!active.length) return ''
  const lines = active.map((g) => `- [${g.id}] ${g.title}${g.detail ? ` — ${g.detail}` : ''}`)
  return `Active session goals (use update_goal when done):\n${lines.join('\n')}`
}
