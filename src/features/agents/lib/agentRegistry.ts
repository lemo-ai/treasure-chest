import { DIRECT_CHAT_AGENT_ID, isDirectChatAgentId } from '@shared'

export type AgentTone = 'brand' | 'accent' | 'highlight'

export type BuiltinAgentId = 'fortune' | 'stocks'

/** Direct model chat without a domain agent persona. */
export const DIRECT_CHAT_ID = DIRECT_CHAT_AGENT_ID as typeof DIRECT_CHAT_AGENT_ID

/** Builtin ids, direct mode, or custom ids like `custom_xxx`. */
export type AgentId = BuiltinAgentId | typeof DIRECT_CHAT_ID | (string & {})

export interface AgentDef {
  id: AgentId
  /** i18n key when builtin/direct; plain text when custom */
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
  /** Prefer this model when chatting as this agent; empty = global default */
  preferredModel?: string
  /** Restrict MCP tools to these server ids; empty/undefined = all connected */
  enabledMcpServerIds?: string[]
  /** Bound knowledge collections; empty = any / default scope */
  knowledgeCollectionIds?: string[]
  /** Always enable knowledge search for this agent */
  alwaysUseKnowledge?: boolean
  /** Allow coding sandbox tools (read/write/shell). Default true for custom agents. */
  enableCodingTools?: boolean
  /** Allow harness plugin tools. Default true for custom agents. */
  enablePluginTools?: boolean
  /** Allow spawn_subagent. Default true for custom agents. */
  enableSpawnSubagent?: boolean
}

const STORAGE_KEY = 'qiankun.agents.v1'

export const DIRECT_CHAT_DEF: AgentDef = {
  id: DIRECT_CHAT_ID,
  name: 'workbench.agent.direct.name',
  description: 'workbench.agent.direct.desc',
  tone: 'brand',
  systemPrompt: '',
  builtin: true,
  createdAt: '1970-01-01T00:00:00.000Z',
  updatedAt: '1970-01-01T00:00:00.000Z',
}

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
  preferredModel?: string
  enabledMcpServerIds?: string[]
  knowledgeCollectionIds?: string[]
  alwaysUseKnowledge?: boolean
  enableCodingTools?: boolean
  enablePluginTools?: boolean
  enableSpawnSubagent?: boolean
}

interface CustomAgentsStore {
  agents: AgentDef[]
}

function uid(): string {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeIds(ids: string[] | undefined): string[] | undefined {
  if (!ids) return undefined
  const next = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  return next.length ? next : undefined
}

function applyBindings(agent: AgentDef, input: Partial<CreateAgentInput>): void {
  if (input.preferredModel !== undefined) {
    agent.preferredModel = input.preferredModel.trim() || undefined
  }
  if (input.enabledMcpServerIds !== undefined) {
    agent.enabledMcpServerIds = normalizeIds(input.enabledMcpServerIds)
  }
  if (input.knowledgeCollectionIds !== undefined) {
    agent.knowledgeCollectionIds = normalizeIds(input.knowledgeCollectionIds)
  }
  if (input.alwaysUseKnowledge !== undefined) {
    agent.alwaysUseKnowledge = input.alwaysUseKnowledge || undefined
  }
  if (input.enableCodingTools !== undefined) agent.enableCodingTools = input.enableCodingTools
  if (input.enablePluginTools !== undefined) agent.enablePluginTools = input.enablePluginTools
  if (input.enableSpawnSubagent !== undefined) agent.enableSpawnSubagent = input.enableSpawnSubagent
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

export function isDirectChatId(id: string): boolean {
  return isDirectChatAgentId(id)
}

/** Domain agents only (excludes direct chat). */
export function listAgents(): AgentDef[] {
  return [...BUILTIN_AGENTS, ...readCustom()]
}

/** Direct chat + domain agents — for workbench session panels. */
export function listChatTargets(): AgentDef[] {
  return [DIRECT_CHAT_DEF, ...listAgents()]
}

export function getAgent(id: string): AgentDef | undefined {
  if (isDirectChatId(id)) return DIRECT_CHAT_DEF
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
  applyBindings(agent, input)
  const next = [...readCustom(), agent]
  writeCustom(next)
  return agent
}

export function updateAgent(id: string, patch: Partial<CreateAgentInput>): AgentDef | null {
  if (isDirectChatId(id) || isBuiltinAgentId(id)) return null
  const list = readCustom()
  const hit = list.find((a) => a.id === id)
  if (!hit) return null
  if (patch.name !== undefined) hit.name = patch.name.trim() || hit.name
  if (patch.description !== undefined) hit.description = patch.description.trim()
  if (patch.systemPrompt !== undefined) hit.systemPrompt = patch.systemPrompt.trim()
  if (patch.tone !== undefined) hit.tone = patch.tone
  applyBindings(hit, patch)
  hit.updatedAt = new Date().toISOString()
  writeCustom(list)
  return hit
}

export function deleteAgent(id: string): boolean {
  if (isDirectChatId(id) || isBuiltinAgentId(id)) return false
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
  return agent.builtin || isDirectChatId(String(agent.id)) ? t(agent.name) : agent.name
}

export function agentDisplayDesc(agent: AgentDef, t: (key: string) => string): string {
  return agent.builtin || isDirectChatId(String(agent.id)) ? t(agent.description) : agent.description
}
