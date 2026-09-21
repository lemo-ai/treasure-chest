import { randomBytes } from 'node:crypto'
import { dialog } from 'electron'
import type { Project, ProjectsSnapshot, UpsertProjectInput } from '@shared'
import { getDb } from '../../db/Database'
import { getSetting, setSetting } from '../../db/AppSettingsRepo'

const ACTIVE_KEY = 'projects.activeId'

function nowIso(): string {
  return new Date().toISOString()
}

function uid(): string {
  return `proj_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((x) => String(x).trim()).filter(Boolean).slice(0, 40)
  } catch {
    return []
  }
}

interface ProjectRow {
  id: string
  name: string
  work_dir: string
  knowledge_json: string
  default_agent_id: string | null
  skill_ids_json: string
  mcp_ids_json: string
  data_source_ids_json: string
  rules_path: string | null
  archived: number
  created_at: string
  updated_at: string
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    workDir: row.work_dir || '',
    knowledgeCollectionIds: parseJsonArray(row.knowledge_json),
    defaultAgentId: row.default_agent_id || undefined,
    skillIds: parseJsonArray(row.skill_ids_json),
    mcpServerIds: parseJsonArray(row.mcp_ids_json),
    dataSourceIds: parseJsonArray(row.data_source_ids_json),
    rulesPath: row.rules_path || undefined,
    archived: Boolean(row.archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listProjects(includeArchived = false): Project[] {
  const db = getDb()
  const rows = (
    includeArchived
      ? db
          .prepare(
            `SELECT * FROM projects ORDER BY archived ASC, updated_at DESC`,
          )
          .all()
      : db
          .prepare(
            `SELECT * FROM projects WHERE archived = 0 ORDER BY updated_at DESC`,
          )
          .all()
  ) as ProjectRow[]
  return rows.map(rowToProject)
}

export function getProject(id: string): Project | null {
  const row = getDb().prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as ProjectRow | undefined
  return row ? rowToProject(row) : null
}

export function getActiveProjectId(): string | null {
  const raw = getSetting<string | null>(ACTIVE_KEY, null)
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

export function setActiveProjectId(id: string | null): string | null {
  const next = id && id.trim() ? id.trim() : null
  if (next && !getProject(next)) throw new Error('project_not_found')
  setSetting(ACTIVE_KEY, next)
  return next
}

export function getProjectsSnapshot(): ProjectsSnapshot {
  return {
    projects: listProjects(true),
    activeProjectId: getActiveProjectId(),
  }
}

export function upsertProject(input: UpsertProjectInput): Project {
  const name = String(input.name || '').trim().slice(0, 80)
  if (!name) throw new Error('project_name_required')
  const db = getDb()
  const now = nowIso()
  const existing = input.id ? getProject(input.id) : null
  const id = existing?.id ?? input.id ?? uid()
  const project: Project = {
    id,
    name,
    workDir: String(input.workDir ?? existing?.workDir ?? '').trim(),
    knowledgeCollectionIds: (input.knowledgeCollectionIds ?? existing?.knowledgeCollectionIds ?? [])
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 40),
    defaultAgentId:
      input.defaultAgentId === null
        ? undefined
        : input.defaultAgentId !== undefined
          ? String(input.defaultAgentId).trim() || undefined
          : existing?.defaultAgentId,
    skillIds: (input.skillIds ?? existing?.skillIds ?? [])
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 20),
    mcpServerIds: (input.mcpServerIds ?? existing?.mcpServerIds ?? [])
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 40),
    dataSourceIds: (input.dataSourceIds ?? existing?.dataSourceIds ?? [])
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 40),
    rulesPath:
      input.rulesPath === null
        ? undefined
        : input.rulesPath !== undefined
          ? String(input.rulesPath).trim() || undefined
          : existing?.rulesPath,
    archived: input.archived ?? existing?.archived ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  db.prepare(
    `INSERT INTO projects (
       id, name, work_dir, knowledge_json, default_agent_id, skill_ids_json,
       mcp_ids_json, data_source_ids_json, rules_path, archived, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       work_dir = excluded.work_dir,
       knowledge_json = excluded.knowledge_json,
       default_agent_id = excluded.default_agent_id,
       skill_ids_json = excluded.skill_ids_json,
       mcp_ids_json = excluded.mcp_ids_json,
       data_source_ids_json = excluded.data_source_ids_json,
       rules_path = excluded.rules_path,
       archived = excluded.archived,
       updated_at = excluded.updated_at`,
  ).run(
    project.id,
    project.name,
    project.workDir,
    JSON.stringify(project.knowledgeCollectionIds),
    project.defaultAgentId ?? null,
    JSON.stringify(project.skillIds),
    JSON.stringify(project.mcpServerIds),
    JSON.stringify(project.dataSourceIds),
    project.rulesPath ?? null,
    project.archived ? 1 : 0,
    project.createdAt,
    project.updatedAt,
  )
  return project
}

export function archiveProject(id: string, archived = true): boolean {
  const ts = nowIso()
  const info = getDb()
    .prepare(`UPDATE projects SET archived = ?, updated_at = ? WHERE id = ?`)
    .run(archived ? 1 : 0, ts, id)
  if (info.changes > 0 && archived && getActiveProjectId() === id) {
    setActiveProjectId(null)
  }
  return info.changes > 0
}

export function removeProject(id: string): boolean {
  const db = getDb()
  const info = db.prepare(`DELETE FROM projects WHERE id = ?`).run(id)
  if (info.changes > 0 && getActiveProjectId() === id) {
    setActiveProjectId(null)
  }
  // Detach sessions from deleted project (keep chats)
  db.prepare(`UPDATE agent_sessions SET project_id = NULL WHERE project_id = ?`).run(id)
  return info.changes > 0
}

export async function pickProjectWorkDir(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
}
