export type AgentTone = 'brand' | 'accent' | 'highlight'

export type BuiltinAgentId = 'fortune' | 'stocks'

/** Builtin ids or custom ids like `custom_xxx`. */
export type AgentId = BuiltinAgentId | (string & {})

export interface AgentDef {
  id: AgentId
  /** i18n key when builtin; plain text when custom */
  name: string
  description: string
  tone: AgentTone
  /** Empty for builtin (uses module tools); custom uses this persona. */
  systemPrompt: string
  builtin: boolean
  /** Classic page route when available */
  classicPath?: string
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'qiankun.agents.v1'

const BUILTIN_AGENTS: AgentDef[] = [
  {
    id: 'fortune',
    name: 'workbench.agent.fortune.name',
    description: 'workbench.agent.fortune.desc',
    tone: 'highlight',
    systemPrompt: '',
    builtin: true,
    classicPath: '/fortune',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'stocks',
    name: 'workbench.agent.stocks.name',
    description: 'workbench.agent.stocks.desc',
    tone: 'accent',
    systemPrompt: '',
    builtin: true,
    classicPath: '/stocks',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
]

export interface CreateAgentInput {
  name: string
  description: string
  systemPrompt: string
  tone: AgentTone
}

interface CustomAgentsStore {
  agents: AgentDef[]
}

function uid(): string {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function readCustom(): AgentDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CustomAgentsStore
    if (!parsed || !Array.isArray(parsed.agents)) return []
    return parsed.agents.filter((a) => a && typeof a.id === 'string' && !a.builtin)
  } catch {
    return []
  }
}

function writeCustom(agents: AgentDef[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ agents }))
}

export function listAgents(): AgentDef[] {
  return [...BUILTIN_AGENTS, ...readCustom()]
}

export function getAgent(id: string): AgentDef | undefined {
  return listAgents().find((a) => a.id === id)
}

export function createAgent(input: CreateAgentInput): AgentDef {
  const name = input.name.trim()
  if (!name) throw new Error('name required')
  const now = new Date().toISOString()
  const agent: AgentDef = {
    id: uid(),
    name,
    description: input.description.trim(),
    systemPrompt: input.systemPrompt.trim(),
    tone: input.tone,
    builtin: false,
    createdAt: now,
    updatedAt: now,
  }
  const next = [...readCustom(), agent]
  writeCustom(next)
  return agent
}

export function updateAgent(id: string, patch: Partial<CreateAgentInput>): AgentDef | null {
  const list = readCustom()
  const hit = list.find((a) => a.id === id)
  if (!hit) return null
  if (patch.name !== undefined) hit.name = patch.name.trim() || hit.name
  if (patch.description !== undefined) hit.description = patch.description.trim()
  if (patch.systemPrompt !== undefined) hit.systemPrompt = patch.systemPrompt.trim()
  if (patch.tone !== undefined) hit.tone = patch.tone
  hit.updatedAt = new Date().toISOString()
  writeCustom(list)
  return hit
}

export function deleteAgent(id: string): boolean {
  const list = readCustom()
  const next = list.filter((a) => a.id !== id)
  if (next.length === list.length) return false
  writeCustom(next)
  return true
}

export function isBuiltinAgentId(id: string): id is BuiltinAgentId {
  return id === 'fortune' || id === 'stocks'
}

/** Resolve display name (pass through i18n outside for builtin keys). */
export function agentDisplayName(agent: AgentDef, t: (key: string) => string): string {
  return agent.builtin ? t(agent.name) : agent.name
}

export function agentDisplayDesc(agent: AgentDef, t: (key: string) => string): string {
  return agent.builtin ? t(agent.description) : agent.description
}
