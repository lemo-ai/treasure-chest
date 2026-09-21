/** First-class workspace: pins context for sessions (0.6.0). */

export interface Project {
  id: string
  name: string
  /** Coding / sandbox working directory; empty = do not override global sandbox */
  workDir: string
  knowledgeCollectionIds: string[]
  defaultAgentId?: string
  skillIds: string[]
  mcpServerIds: string[]
  dataSourceIds: string[]
  /** Optional path to AGENTS.md / rules file */
  rulesPath?: string
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface UpsertProjectInput {
  id?: string
  name: string
  workDir?: string
  knowledgeCollectionIds?: string[]
  defaultAgentId?: string | null
  skillIds?: string[]
  mcpServerIds?: string[]
  dataSourceIds?: string[]
  rulesPath?: string | null
  archived?: boolean
}

export interface ProjectsSnapshot {
  projects: Project[]
  activeProjectId: string | null
}
