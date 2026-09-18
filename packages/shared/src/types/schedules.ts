/** Daily schedule tasks for workbench (fortune / stocks / custom agent turns). */

export type ScheduleTaskKind = 'builtin' | 'custom'

export type ScheduleActionType = 'fortune_notify' | 'stocks_report' | 'agent_turn'

/** Visual cover for schedule cards */
export type ScheduleCoverPreset = 'fortune' | 'stocks' | 'lottery' | 'agent' | 'custom'

/** Output format for schedule inbox reports (builtins use this; agent_turn defaults to markdown). */
export type ScheduleReportFormat = 'markdown' | 'html'

/** Per-task notification channel overrides (undefined = follow global settings). */
export interface ScheduleNotifyOverride {
  workbench?: boolean
  desktop?: boolean
  dingtalk?: boolean
  email?: boolean
}

/** Runtime capabilities for custom agent_turn schedules. */
export interface ScheduleRunContext {
  /** `providerId::modelId` or bare model id */
  model?: string
  skillIds?: string[]
  enableMcpTools?: boolean
  enabledMcpServerIds?: string[]
  useKnowledge?: boolean
  knowledgeCollectionIds?: string[]
  enableWebSearch?: boolean
  dataSourceIds?: string[]
  notify?: ScheduleNotifyOverride
}

export type ScheduleRecurrence =
  | { type: 'once'; atIso: string }
  | { type: 'daily'; hour: number; minute: number }
  | { type: 'interval'; everyMinutes: number; anchorIso?: string }
  | {
      type: 'window'
      startHour: number
      startMinute: number
      endHour: number
      endMinute: number
      everyMinutes: number
    }

export interface ScheduleAgentTurnAction {
  type: 'agent_turn'
  /** Selected agents; empty = direct chat */
  agentIds: string[]
  /** Display names cached at save time (same order as agentIds) */
  agentNames?: string[]
  /** Custom persona snapshots keyed by agent id */
  agentSystemPrompts?: Record<string, string>
  /** User message sent each run */
  message: string
  /** @deprecated use runContext.notify / global channels */
  notifyOnComplete?: boolean
  runContext?: ScheduleRunContext
}

export interface ScheduleBuiltinAction {
  type: 'fortune_notify' | 'stocks_report'
}

export type ScheduleAction = ScheduleBuiltinAction | ScheduleAgentTurnAction

export interface ScheduleTask {
  id: string
  kind: ScheduleTaskKind
  enabled: boolean
  title: string
  /** Local hour 0–23 (derived from recurrence for sorting / daily) */
  hour: number
  /** Local minute 0–59 */
  minute: number
  recurrence: ScheduleRecurrence
  action: ScheduleAction
  /** Built-in atmospheric cover; `custom` uses coverImage */
  coverPreset?: ScheduleCoverPreset
  /** Custom cover as compressed data URL */
  coverImage?: string
  /**
   * Inbox detail format for this task’s run results.
   * Builtins default to `html`; custom agent tasks default to `markdown`.
   * Not taken from the prompt/description — configured explicitly on the task.
   */
  reportFormat?: ScheduleReportFormat
  createdAt: string
  updatedAt: string
}

export interface ScheduleRunState {
  lastRunYmd?: string
  lastRunAtIso?: string
  nextRunAtIso?: string
  runCount?: number
  lastStatus?: 'ok' | 'error' | 'skipped'
  lastError?: string
  lastSessionId?: string
  lastPreview?: string
}

export interface SchedulesSnapshot {
  tasks: ScheduleTask[]
  runState: Record<string, ScheduleRunState>
}

export interface UpsertScheduleTaskInput {
  id?: string
  enabled?: boolean
  title: string
  hour?: number
  minute?: number
  recurrence?: ScheduleRecurrence
  action: ScheduleAction
  coverPreset?: ScheduleCoverPreset
  /** Pass null to clear custom image */
  coverImage?: string | null
  reportFormat?: ScheduleReportFormat
}

export const BUILTIN_FORTUNE_TASK_ID = 'builtin:fortune'
export const BUILTIN_STOCKS_TASK_ID = 'builtin:stocks'
/** Preset sports-lottery agent_turn (crawl + builtin SQLite), not a dedicated sync action. */
export const BUILTIN_LOTTERY_TASK_ID = 'builtin:lottery'

export function normalizeScheduleRecurrence(
  recurrence: ScheduleRecurrence | 'daily' | undefined,
  hour: number,
  minute: number,
): ScheduleRecurrence {
  if (!recurrence || recurrence === 'daily') {
    return { type: 'daily', hour, minute }
  }
  if (recurrence.type === 'daily') {
    return {
      type: 'daily',
      hour: Number.isFinite(recurrence.hour) ? recurrence.hour : hour,
      minute: Number.isFinite(recurrence.minute) ? recurrence.minute : minute,
    }
  }
  return recurrence
}

export function hourMinuteFromRecurrence(recurrence: ScheduleRecurrence): {
  hour: number
  minute: number
} {
  if (recurrence.type === 'daily') {
    return { hour: recurrence.hour, minute: recurrence.minute }
  }
  if (recurrence.type === 'once') {
    const d = new Date(recurrence.atIso)
    if (!Number.isNaN(d.getTime())) {
      return { hour: d.getHours(), minute: d.getMinutes() }
    }
  }
  if (recurrence.type === 'window') {
    return { hour: recurrence.startHour, minute: recurrence.startMinute }
  }
  return { hour: 8, minute: 0 }
}

/** Resolve selected agent ids from action (supports legacy single agentId). */
export function resolveScheduleAgentIds(action: ScheduleAgentTurnAction): string[] {
  const raw = action as ScheduleAgentTurnAction & {
    agentId?: string
    systemPrompt?: string
    agentName?: string
  }
  const fromMulti = Array.isArray(raw.agentIds)
    ? raw.agentIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []
  if (fromMulti.length) return [...new Set(fromMulti)].slice(0, 20)
  const legacy = String(raw.agentId || '').trim()
  return legacy ? [legacy] : []
}

export function resolveScheduleAgentLabel(action: ScheduleAgentTurnAction): string {
  const ids = resolveScheduleAgentIds(action)
  const names = Array.isArray(action.agentNames)
    ? action.agentNames.map((n) => String(n || '').trim()).filter(Boolean)
    : []
  if (names.length) return names.join(' · ')
  const legacy = (action as ScheduleAgentTurnAction & { agentName?: string }).agentName
  if (legacy?.trim()) return legacy.trim()
  if (ids.length) return ids.join(' · ')
  return ''
}
