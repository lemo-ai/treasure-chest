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
  /** Optional agent logo: data URL or http(s) URL */
  logoUrl?: string
  /** Empty-state quick question chips (plain text; custom agents). Max 6. */
  quickPrompts?: string[]
}

const STORAGE_KEY = 'qiankun.agents.v1'
const LOGO_OVERRIDES_KEY = 'qiankun.agentLogos.v1'
/** Bump when shipping new builtin default logos so old local uploads don't hide them. */
const LOGO_DEFAULTS_VERSION_KEY = 'qiankun.agentLogos.defaultsVersion'
const LOGO_DEFAULTS_VERSION = 1
const BUILTIN_LOGO_IDS = ['fortune', 'stocks'] as const

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
  logoUrl?: string
  quickPrompts?: string[]
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

function normalizeQuickPrompts(prompts: string[] | undefined): string[] | undefined {
  if (!prompts) return undefined
  const next = prompts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.slice(0, 40))
    .slice(0, 6)
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
  if (input.logoUrl !== undefined) {
    const logo = input.logoUrl.trim()
    agent.logoUrl = logo || undefined
  }
  if (input.quickPrompts !== undefined) {
    agent.quickPrompts = normalizeQuickPrompts(input.quickPrompts)
  }
}

function readLogoOverrides(): Record<string, string> {
  migrateBuiltinLogoDefaults()
  try {
    const raw = localStorage.getItem(LOGO_OVERRIDES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim()) out[id] = value.trim()
    }
    return out
  } catch {
    return {}
  }
}

/**
 * One-time: drop fortune/stocks logo overrides so bundled default logos show.
 * Custom agents are untouched. Users can re-upload after this.
 */
function migrateBuiltinLogoDefaults(): void {
  try {
    const cur = Number(localStorage.getItem(LOGO_DEFAULTS_VERSION_KEY) || '0')
    if (cur >= LOGO_DEFAULTS_VERSION) return
    const raw = localStorage.getItem(LOGO_OVERRIDES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      if (parsed && typeof parsed === 'object') {
        let changed = false
        for (const id of BUILTIN_LOGO_IDS) {
          if (id in parsed) {
            delete parsed[id]
            changed = true
          }
        }
        if (changed) {
          const next: Record<string, string> = {}
          for (const [id, value] of Object.entries(parsed)) {
            if (typeof value === 'string' && value.trim()) next[id] = value.trim()
          }
          writeLogoOverrides(next)
        }
      }
    }
    localStorage.setItem(LOGO_DEFAULTS_VERSION_KEY, String(LOGO_DEFAULTS_VERSION))
  } catch {
    try {
      localStorage.setItem(LOGO_DEFAULTS_VERSION_KEY, String(LOGO_DEFAULTS_VERSION))
    } catch {
      /* ignore */
    }
  }
}

function writeLogoOverrides(map: Record<string, string>): void {
  localStorage.setItem(LOGO_OVERRIDES_KEY, JSON.stringify(map))
}

/** Set or clear a logo override (works for builtin + custom agents). */
export function setAgentLogoUrl(agentId: string, logoUrl: string | null): void {
  const map = readLogoOverrides()
  const next = (logoUrl ?? '').trim()
  if (next) map[agentId] = next
  else delete map[agentId]
  writeLogoOverrides(map)
}

function withLogo(agent: AgentDef): AgentDef {
  const override = readLogoOverrides()[String(agent.id)]
  if (override) return { ...agent, logoUrl: override }
  return agent
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
  return [...BUILTIN_AGENTS, ...readCustom()].map(withLogo)
}

/** Direct chat + domain agents — for workbench session panels. */
export function listChatTargets(): AgentDef[] {
  return [withLogo(DIRECT_CHAT_DEF), ...listAgents()]
}

export function getAgent(id: string): AgentDef | undefined {
  if (isDirectChatId(id)) return withLogo(DIRECT_CHAT_DEF)
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
  if (agent.logoUrl) setAgentLogoUrl(String(agent.id), agent.logoUrl)
  const next = [...readCustom(), agent]
  writeCustom(next)
  return withLogo(agent)
}

export function updateAgent(id: string, patch: Partial<CreateAgentInput>): AgentDef | null {
  if (isDirectChatId(id)) return null
  if (isBuiltinAgentId(id)) {
    if (patch.logoUrl === undefined) return null
    setAgentLogoUrl(id, patch.logoUrl.trim() || null)
    return getAgent(id) ?? null
  }
  const list = readCustom()
  const hit = list.find((a) => a.id === id)
  if (!hit) return null
  if (patch.name !== undefined) hit.name = patch.name.trim() || hit.name
  if (patch.description !== undefined) hit.description = patch.description.trim()
  if (patch.systemPrompt !== undefined) hit.systemPrompt = patch.systemPrompt.trim()
  if (patch.tone !== undefined) hit.tone = patch.tone
  applyBindings(hit, patch)
  if (patch.logoUrl !== undefined) {
    setAgentLogoUrl(id, hit.logoUrl ?? null)
  }
  hit.updatedAt = new Date().toISOString()
  writeCustom(list)
  return withLogo(hit)
}

export function deleteAgent(id: string): boolean {
  if (isDirectChatId(id) || isBuiltinAgentId(id)) return false
  const list = readCustom()
  const next = list.filter((a) => a.id !== id)
  if (next.length === list.length) return false
  writeCustom(next)
  setAgentLogoUrl(id, null)
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
