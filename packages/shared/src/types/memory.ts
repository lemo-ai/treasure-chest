/** Durable cross-session memory facts (0.6.0). */

export type MemoryScopeKind = 'global' | 'agent' | 'project'

export type MemoryFactSource = 'manual' | 'user' | 'assistant' | 'migrated'

export interface MemoryFact {
  id: string
  /** `global` | `agent:{id}` | `project:{id}` */
  scope: string
  content: string
  source: MemoryFactSource
  createdAt: string
  updatedAt: string
}

export interface ListMemoryFactsInput {
  /** Include global facts (default true) */
  includeGlobal?: boolean
  agentId?: string
  projectId?: string
  limit?: number
}

export interface AddMemoryFactInput {
  scope: string
  content: string
  source?: MemoryFactSource
}

export interface MemorySettings {
  /** When false, facts are stored but not injected into prompts */
  injectEnabled: boolean
}
