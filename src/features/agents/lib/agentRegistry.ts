import { DIRECT_CHAT_AGENT_ID, isDirectChatAgentId, BUILTIN_LOTTERY_DATA_SOURCE_ID } from '@shared'

export type AgentTone = 'brand' | 'accent' | 'highlight'

export type BuiltinAgentId = 'fortune' | 'stocks' | 'lottery'

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
  /** Persona text. Locked builtins leave empty (Electron BUILTIN_SYSTEM); presets/custom store editable prompt. */
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
  /** Bound Settings → Data sources; empty = no query_data_source access */
  dataSourceIds?: string[]
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

/**
 * Preinstalled lottery persona (editable on-device).
 * Bound by default to Settings data source `builtin:lottery-sqlite` (seeded under userData).
 */
export const DEFAULT_LOTTERY_SYSTEM_PROMPT = [
  '你是「袖里乾坤」工作台中的体彩分析助手（预装配置，用户可在设置里改人设）。',
  '数据源 id=builtin:lottery-sqlite。表 matches 列名只能用：date, product, home, away, score, odds_json, source_url, synced_at（禁止 match_date/home_team/lottery_matches 等旧名）。',
  '查库前先 list_data_sources，再用 query_data_source，例如：SELECT date, product, home, away, score FROM matches WHERE date>=\'2024-01-01\' ORDER BY date DESC LIMIT 50；统计：SELECT product, COUNT(*) n FROM matches GROUP BY product。',
  '网页：search_web 找链接后必须 crawl_url/fetch_url 打开正文再分析；结果少时换关键词并多 crawl 几篇。澳客赛程可用 crawl_url https://www.okooo.com/livecenter/?date=YYYY-MM-DD。',
  '必须声明：仅供研究分析，不构成购彩建议；禁止保证中奖。数字以工具为准。',
].join('\n')

const STORAGE_KEY = 'qiankun.agents.v1'
const LOGO_OVERRIDES_KEY = 'qiankun.agentLogos.v1'
/** Per-builtin overrides (lottery also stores editable persona + tool pack). */
const BUILTIN_PREFS_KEY = 'qiankun.builtinAgentPrefs.v1'
/** One-time: bind lottery preset to builtin SQLite data source if unset. */
const LOTTERY_DS_SEED_KEY = 'qiankun.lotteryDsSeed.v1'
/** Refresh lottery system prompt once after schema/tooling changes. */
const LOTTERY_PROMPT_SEED_KEY = 'qiankun.lotteryPrompt.v2'
/** Bump when shipping new builtin default logos so old local uploads don't hide them. */
const LOGO_DEFAULTS_VERSION_KEY = 'qiankun.agentLogos.defaultsVersion'
const LOGO_DEFAULTS_VERSION = 2
const BUILTIN_LOGO_IDS = ['fortune', 'stocks', 'lottery'] as const

interface BuiltinAgentPrefs {
  preferredModel?: string
  quickPrompts?: string[]
  systemPrompt?: string
  enableCodingTools?: boolean
  enablePluginTools?: boolean
  enableSpawnSubagent?: boolean
  dataSourceIds?: string[]
}

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
  {
    id: 'lottery',
    name: 'workbench.agent.lottery.name',
    description: 'workbench.agent.lottery.desc',
    tone: 'highlight',
    systemPrompt: DEFAULT_LOTTERY_SYSTEM_PROMPT,
    builtin: true,
    enableCodingTools: false,
    enablePluginTools: false,
    enableSpawnSubagent: false,
    dataSourceIds: [BUILTIN_LOTTERY_DATA_SOURCE_ID],
    quickPrompts: [
      '一键拉取竞彩+北单近三年全量',
      '同步今天竞彩和北单盘口',
      '本地库进度怎么样了',
      '分析：让球-1，赔率2.10/3.30/3.20',
    ],
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
  dataSourceIds?: string[]
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
  if (input.dataSourceIds !== undefined) {
    agent.dataSourceIds = normalizeIds(input.dataSourceIds)
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
  ensureLotteryDataSourceBinding()
  const override = readLogoOverrides()[String(agent.id)]
  let next = override ? { ...agent, logoUrl: override } : agent
  if (agent.builtin && isBuiltinAgentId(String(agent.id))) {
    next = applyBuiltinPrefs(next)
  }
  return next
}

/** One-time bind lottery preset → builtin SQLite if prefs never set a DS list. */
function ensureLotteryDataSourceBinding(): void {
  try {
    if (localStorage.getItem(LOTTERY_DS_SEED_KEY) !== '1') {
      const map = readBuiltinPrefs()
      const prev = map.lottery ?? {}
      if (!prev.dataSourceIds?.length) {
        map.lottery = { ...prev, dataSourceIds: [BUILTIN_LOTTERY_DATA_SOURCE_ID] }
        writeBuiltinPrefs(map)
      }
      localStorage.setItem(LOTTERY_DS_SEED_KEY, '1')
    }
    // Refresh persona so schema column names stay accurate after product changes
    if (localStorage.getItem(LOTTERY_PROMPT_SEED_KEY) !== '1') {
      const map = readBuiltinPrefs()
      if (map.lottery?.systemPrompt) {
        const { systemPrompt: _drop, ...rest } = map.lottery
        map.lottery = rest
        writeBuiltinPrefs(map)
      }
      localStorage.setItem(LOTTERY_PROMPT_SEED_KEY, '1')
    }
  } catch {
    /* ignore */
  }
}

function readBuiltinPrefs(): Record<string, BuiltinAgentPrefs> {
  try {
    const raw = localStorage.getItem(BUILTIN_PREFS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, BuiltinAgentPrefs>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeBuiltinPrefs(map: Record<string, BuiltinAgentPrefs>): void {
  localStorage.setItem(BUILTIN_PREFS_KEY, JSON.stringify(map))
}

function applyBuiltinPrefs(agent: AgentDef): AgentDef {
  const prefs = readBuiltinPrefs()[String(agent.id)]
  const base =
    agent.id === 'lottery'
      ? {
          ...agent,
          systemPrompt: agent.systemPrompt || DEFAULT_LOTTERY_SYSTEM_PROMPT,
          dataSourceIds: agent.dataSourceIds?.length
            ? agent.dataSourceIds
            : [BUILTIN_LOTTERY_DATA_SOURCE_ID],
        }
      : agent
  if (!prefs) return base
  return {
    ...base,
    preferredModel: prefs.preferredModel?.trim() || base.preferredModel,
    quickPrompts: prefs.quickPrompts?.length ? prefs.quickPrompts : base.quickPrompts,
    systemPrompt:
      typeof prefs.systemPrompt === 'string' && prefs.systemPrompt.trim()
        ? prefs.systemPrompt.trim()
        : base.systemPrompt,
    enableCodingTools:
      prefs.enableCodingTools !== undefined ? prefs.enableCodingTools : base.enableCodingTools,
    enablePluginTools:
      prefs.enablePluginTools !== undefined ? prefs.enablePluginTools : base.enablePluginTools,
    enableSpawnSubagent:
      prefs.enableSpawnSubagent !== undefined
        ? prefs.enableSpawnSubagent
        : base.enableSpawnSubagent,
    dataSourceIds: prefs.dataSourceIds?.length
      ? prefs.dataSourceIds
      : base.dataSourceIds?.length
        ? base.dataSourceIds
        : agent.id === 'lottery'
          ? [BUILTIN_LOTTERY_DATA_SOURCE_ID]
          : base.dataSourceIds,
  }
}

function setBuiltinPrefs(
  agentId: string,
  patch: {
    preferredModel?: string
    quickPrompts?: string[] | null
    systemPrompt?: string | null
    enableCodingTools?: boolean
    enablePluginTools?: boolean
    enableSpawnSubagent?: boolean
    dataSourceIds?: string[] | null
  },
): void {
  const map = readBuiltinPrefs()
  const prev = map[agentId] ?? {}
  const next: BuiltinAgentPrefs = { ...prev }
  if (patch.preferredModel !== undefined) {
    const model = patch.preferredModel.trim()
    if (model) next.preferredModel = model
    else delete next.preferredModel
  }
  if (patch.quickPrompts !== undefined) {
    if (patch.quickPrompts === null) delete next.quickPrompts
    else {
      const prompts = normalizeQuickPrompts(patch.quickPrompts)
      if (prompts) next.quickPrompts = prompts
      else delete next.quickPrompts
    }
  }
  if (patch.systemPrompt !== undefined) {
    if (patch.systemPrompt === null) delete next.systemPrompt
    else {
      const prompt = patch.systemPrompt.trim()
      if (prompt) next.systemPrompt = prompt
      else delete next.systemPrompt
    }
  }
  if (patch.enableCodingTools !== undefined) {
    next.enableCodingTools = patch.enableCodingTools
  }
  if (patch.enablePluginTools !== undefined) {
    next.enablePluginTools = patch.enablePluginTools
  }
  if (patch.enableSpawnSubagent !== undefined) {
    next.enableSpawnSubagent = patch.enableSpawnSubagent
  }
  if (patch.dataSourceIds !== undefined) {
    if (patch.dataSourceIds === null) delete next.dataSourceIds
    else {
      const ids = normalizeIds(patch.dataSourceIds)
      if (ids?.length) next.dataSourceIds = ids
      else delete next.dataSourceIds
    }
  }
  if (Object.keys(next).length) map[agentId] = next
  else delete map[agentId]
  writeBuiltinPrefs(map)
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
    const hasLogo = patch.logoUrl !== undefined
    const hasModel = patch.preferredModel !== undefined
    const hasPrompts = patch.quickPrompts !== undefined
    const isLotteryPreset = id === 'lottery'
    const hasPersona =
      isLotteryPreset &&
      (patch.systemPrompt !== undefined ||
        patch.enableCodingTools !== undefined ||
        patch.enablePluginTools !== undefined ||
        patch.enableSpawnSubagent !== undefined ||
        patch.dataSourceIds !== undefined)
    if (!hasLogo && !hasModel && !hasPrompts && !hasPersona) return null
    if (hasLogo) setAgentLogoUrl(id, patch.logoUrl!.trim() || null)
    if (hasModel || hasPrompts || hasPersona) {
      setBuiltinPrefs(id, {
        preferredModel: hasModel ? patch.preferredModel : undefined,
        quickPrompts: hasPrompts ? patch.quickPrompts ?? null : undefined,
        systemPrompt: isLotteryPreset && patch.systemPrompt !== undefined ? patch.systemPrompt : undefined,
        enableCodingTools:
          isLotteryPreset && patch.enableCodingTools !== undefined
            ? patch.enableCodingTools
            : undefined,
        enablePluginTools:
          isLotteryPreset && patch.enablePluginTools !== undefined
            ? patch.enablePluginTools
            : undefined,
        enableSpawnSubagent:
          isLotteryPreset && patch.enableSpawnSubagent !== undefined
            ? patch.enableSpawnSubagent
            : undefined,
        dataSourceIds:
          isLotteryPreset && patch.dataSourceIds !== undefined
            ? patch.dataSourceIds ?? null
            : undefined,
      })
    }
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
  return id === 'fortune' || id === 'stocks' || id === 'lottery'
}

/** Preinstalled agents whose persona/tools are editable on-device (not locked in source). */
export function isConfigPresetAgent(agent: Pick<AgentDef, 'id' | 'builtin'>): boolean {
  return Boolean(agent.builtin && agent.id === 'lottery')
}

/** Whether chat should send this agent's systemPrompt (custom or editable preset). */
export function agentUsesLocalPersona(agent: Pick<AgentDef, 'builtin' | 'systemPrompt' | 'id'>): boolean {
  if (!agent.builtin) return true
  return isConfigPresetAgent(agent) || Boolean(agent.systemPrompt?.trim())
}

/** Resolve display name (pass through i18n outside for builtin keys). */
export function agentDisplayName(agent: AgentDef, t: (key: string) => string): string {
  return agent.builtin || isDirectChatId(String(agent.id)) ? t(agent.name) : agent.name
}

export function agentDisplayDesc(agent: AgentDef, t: (key: string) => string): string {
  return agent.builtin || isDirectChatId(String(agent.id)) ? t(agent.description) : agent.description
}
