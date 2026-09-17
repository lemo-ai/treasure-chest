import {
  BUILTIN_FORTUNE_TASK_ID,
  BUILTIN_STOCKS_TASK_ID,
  hourMinuteFromRecurrence,
  normalizeScheduleRecurrence,
  type ScheduleRecurrence,
  type ScheduleRunContext,
  type ScheduleRunState,
  type ScheduleTask,
  type SchedulesSnapshot,
  type UpsertScheduleTaskInput,
} from '@shared'
import { getSetting, setSetting } from '../../db/AppSettingsRepo'
import { settingsStore } from '../settings/SettingsStore'
import { logger } from '../../utils/logger'

const TASKS_KEY = 'schedules.tasks'
const RUN_STATE_KEY = 'schedules.runState'
const REMOVED_BUILTINS_KEY = 'schedules.removedBuiltins'
const MIGRATED_KEY = 'schedules.migrated.v1'
const RECURRENCE_MIGRATED_KEY = 'schedules.migrated.recurrence.v2'

function nowIso(): string {
  return new Date().toISOString()
}

function uid(): string {
  return `sched_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function clampHour(hour: number): number {
  if (!Number.isFinite(hour)) return 8
  return Math.min(23, Math.max(0, Math.floor(hour)))
}

function clampMinute(minute: number): number {
  if (!Number.isFinite(minute)) return 0
  return Math.min(59, Math.max(0, Math.floor(minute)))
}

function clampEveryMinutes(n: number): number {
  if (!Number.isFinite(n)) return 60
  return Math.min(24 * 60, Math.max(1, Math.floor(n)))
}

function normalizeRecurrence(raw: ScheduleRecurrence): ScheduleRecurrence {
  if (raw.type === 'once') {
    const at = String(raw.atIso || '').trim()
    if (!at) throw new Error('once_requires_atIso')
    return { type: 'once', atIso: at }
  }
  if (raw.type === 'daily') {
    return { type: 'daily', hour: clampHour(raw.hour), minute: clampMinute(raw.minute) }
  }
  if (raw.type === 'interval') {
    return {
      type: 'interval',
      everyMinutes: clampEveryMinutes(raw.everyMinutes),
      anchorIso: raw.anchorIso || undefined,
    }
  }
  if (raw.type === 'window') {
    return {
      type: 'window',
      startHour: clampHour(raw.startHour),
      startMinute: clampMinute(raw.startMinute),
      endHour: clampHour(raw.endHour),
      endMinute: clampMinute(raw.endMinute),
      everyMinutes: clampEveryMinutes(raw.everyMinutes),
    }
  }
  throw new Error('invalid_recurrence')
}

function normalizeRunContext(ctx?: ScheduleRunContext): ScheduleRunContext | undefined {
  if (!ctx || typeof ctx !== 'object') return undefined
  const next: ScheduleRunContext = {}
  if (typeof ctx.model === 'string' && ctx.model.trim()) next.model = ctx.model.trim()
  if (Array.isArray(ctx.skillIds)) {
    next.skillIds = ctx.skillIds.map((id) => String(id).trim()).filter(Boolean).slice(0, 20)
  }
  if (typeof ctx.enableMcpTools === 'boolean') next.enableMcpTools = ctx.enableMcpTools
  if (Array.isArray(ctx.enabledMcpServerIds)) {
    next.enabledMcpServerIds = ctx.enabledMcpServerIds
      .map((id) => String(id).trim())
      .filter(Boolean)
      .slice(0, 40)
  }
  if (typeof ctx.useKnowledge === 'boolean') next.useKnowledge = ctx.useKnowledge
  if (Array.isArray(ctx.knowledgeCollectionIds)) {
    next.knowledgeCollectionIds = ctx.knowledgeCollectionIds
      .map((id) => String(id).trim())
      .filter(Boolean)
      .slice(0, 40)
  }
  if (typeof ctx.enableWebSearch === 'boolean') next.enableWebSearch = ctx.enableWebSearch
  if (Array.isArray(ctx.dataSourceIds)) {
    next.dataSourceIds = ctx.dataSourceIds.map((id) => String(id).trim()).filter(Boolean).slice(0, 20)
  }
  if (ctx.notify && typeof ctx.notify === 'object') {
    next.notify = {
      workbench: typeof ctx.notify.workbench === 'boolean' ? ctx.notify.workbench : undefined,
      desktop: typeof ctx.notify.desktop === 'boolean' ? ctx.notify.desktop : undefined,
      dingtalk: typeof ctx.notify.dingtalk === 'boolean' ? ctx.notify.dingtalk : undefined,
      email: typeof ctx.notify.email === 'boolean' ? ctx.notify.email : undefined,
    }
  }
  return Object.keys(next).length ? next : undefined
}

function readTasks(): ScheduleTask[] {
  const raw = getSetting<ScheduleTask[]>(TASKS_KEY, [])
  return Array.isArray(raw) ? raw.filter((t) => t && typeof t.id === 'string') : []
}

function writeTasks(tasks: ScheduleTask[]): void {
  setSetting(TASKS_KEY, tasks)
}

function readRemovedBuiltins(): string[] {
  const raw = getSetting<string[]>(REMOVED_BUILTINS_KEY, [])
  return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : []
}

function writeRemovedBuiltins(ids: string[]): void {
  setSetting(REMOVED_BUILTINS_KEY, [...new Set(ids)])
}

function readRunState(): Record<string, ScheduleRunState> {
  const raw = getSetting<Record<string, ScheduleRunState>>(RUN_STATE_KEY, {})
  return raw && typeof raw === 'object' ? raw : {}
}

function writeRunState(state: Record<string, ScheduleRunState>): void {
  setSetting(RUN_STATE_KEY, state)
}

function defaultBuiltinTasks(): ScheduleTask[] {
  const notifications = settingsStore.getNotifications()
  const stocks = settingsStore.getStocksSettings()
  const locale = settingsStore.getLocale()
  const en = locale.toLowerCase().startsWith('en')
  const stamp = nowIso()
  const fortuneHour = clampHour(notifications.fortuneNotifyHour ?? 8)
  const stocksHour = clampHour(stocks.autoGenerateHour ?? 10)
  return [
    {
      id: BUILTIN_FORTUNE_TASK_ID,
      kind: 'builtin',
      enabled: Boolean(notifications.fortuneDaily),
      title: en ? 'Daily fortune' : '今日运势提醒',
      hour: fortuneHour,
      minute: 0,
      recurrence: { type: 'daily', hour: fortuneHour, minute: 0 },
      action: { type: 'fortune_notify' },
      coverPreset: 'fortune',
      reportFormat: 'html',
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: BUILTIN_STOCKS_TASK_ID,
      kind: 'builtin',
      enabled: Boolean(stocks.autoGenerate),
      title: en ? 'Daily stock picks' : '每日荐股报告',
      hour: stocksHour,
      minute: 0,
      recurrence: { type: 'daily', hour: stocksHour, minute: 0 },
      action: { type: 'stocks_report' },
      coverPreset: 'stocks',
      reportFormat: 'html',
      createdAt: stamp,
      updatedAt: stamp,
    },
  ]
}

function defaultCoverPreset(action: ScheduleTask['action']): ScheduleTask['coverPreset'] {
  if (action.type === 'fortune_notify') return 'fortune'
  if (action.type === 'stocks_report') return 'stocks'
  return 'agent'
}

function migrateTaskShape(task: ScheduleTask): ScheduleTask {
  const hour = clampHour(typeof task.hour === 'number' ? task.hour : 8)
  const minute = clampMinute(typeof task.minute === 'number' ? task.minute : 0)
  const recurrence = normalizeScheduleRecurrence(
    task.recurrence as ScheduleRecurrence | 'daily' | undefined,
    hour,
    minute,
  )
  const hm = hourMinuteFromRecurrence(recurrence)
  let action = task.action
  if (action?.type === 'agent_turn') {
    action = normalizeAction(action)
  }
  return {
    ...task,
    hour: hm.hour,
    minute: hm.minute,
    recurrence,
    action,
  }
}

function enrichTask(task: ScheduleTask): ScheduleTask {
  const migrated = migrateTaskShape(task)
  const withCover =
    migrated.coverPreset || migrated.coverImage
      ? migrated
      : { ...migrated, coverPreset: defaultCoverPreset(migrated.action) }
  if (withCover.reportFormat === 'html' || withCover.reportFormat === 'markdown') return withCover
  const defaultFormat =
    withCover.action.type === 'fortune_notify' || withCover.action.type === 'stocks_report'
      ? 'html'
      : 'markdown'
  return { ...withCover, reportFormat: defaultFormat }
}

/** Seed builtin tasks once from existing notification/stocks settings. */
export function migrateSchedulesFromSettings(): void {
  if (!getSetting<boolean>(MIGRATED_KEY, false)) {
    const existing = readTasks()
    if (existing.length === 0) {
      writeTasks(defaultBuiltinTasks())
      logger.info('schedules: seeded builtin fortune/stocks tasks')
    }
    setSetting(MIGRATED_KEY, true)
  }
  if (!getSetting<boolean>(RECURRENCE_MIGRATED_KEY, false)) {
    const tasks = readTasks().map(migrateTaskShape)
    writeTasks(tasks)
    setSetting(RECURRENCE_MIGRATED_KEY, true)
    logger.info('schedules: migrated recurrence shapes')
  }
}

function syncBuiltinToSettings(task: ScheduleTask): void {
  if (task.action.type === 'fortune_notify') {
    void settingsStore.setNotifications({
      fortuneDaily: task.enabled,
      fortuneNotifyHour: task.hour,
    })
  }
  if (task.action.type === 'stocks_report') {
    void settingsStore.setStocksSettings({
      autoGenerate: task.enabled,
      autoGenerateHour: task.hour,
    })
    if (task.enabled) {
      const n = settingsStore.getNotifications()
      if (!n.stocksDaily) {
        void settingsStore.setNotifications({ stocksDaily: true })
      }
    }
  }
}

function normalizeAction(action: UpsertScheduleTaskInput['action']): ScheduleTask['action'] {
  if (action.type === 'agent_turn') {
    const message = String(action.message || '').trim()
    if (!message) throw new Error('message_required')
    const legacy = action as typeof action & {
      agentId?: string
      agentName?: string
      systemPrompt?: string
    }
    const agentIds = Array.isArray(action.agentIds)
      ? action.agentIds.map((id) => String(id || '').trim()).filter(Boolean)
      : []
    const resolvedIds =
      agentIds.length > 0
        ? [...new Set(agentIds)].slice(0, 20)
        : String(legacy.agentId || '').trim()
          ? [String(legacy.agentId).trim()]
          : []
    const agentNames = Array.isArray(action.agentNames)
      ? action.agentNames.map((n) => String(n || '').trim()).filter(Boolean).slice(0, 20)
      : legacy.agentName?.trim()
        ? [legacy.agentName.trim()]
        : undefined
    const prompts: Record<string, string> = {}
    if (action.agentSystemPrompts && typeof action.agentSystemPrompts === 'object') {
      for (const [k, v] of Object.entries(action.agentSystemPrompts)) {
        const id = String(k || '').trim()
        const prompt = String(v || '').trim()
        if (id && prompt) prompts[id] = prompt.slice(0, 8000)
      }
    }
    if (legacy.systemPrompt?.trim() && resolvedIds[0]) {
      prompts[resolvedIds[0]!] = legacy.systemPrompt.trim().slice(0, 8000)
    }
    return {
      type: 'agent_turn',
      agentIds: resolvedIds,
      agentNames: agentNames?.length ? agentNames : undefined,
      agentSystemPrompts: Object.keys(prompts).length ? prompts : undefined,
      message: message.slice(0, 2000),
      notifyOnComplete: action.notifyOnComplete !== false,
      runContext: normalizeRunContext(action.runContext),
    }
  }
  if (action.type === 'fortune_notify' || action.type === 'stocks_report') {
    return { type: action.type }
  }
  throw new Error('invalid_action')
}

export function listScheduleTasks(): ScheduleTask[] {
  migrateSchedulesFromSettings()
  const removed = new Set(readRemovedBuiltins())
  return readTasks()
    .filter((t) => !(t.kind === 'builtin' && removed.has(t.id)))
    .map(enrichTask)
    .slice()
    .sort((a, b) => a.hour - b.hour || a.minute - b.minute || a.title.localeCompare(b.title))
}

export function getSchedulesSnapshot(): SchedulesSnapshot {
  return {
    tasks: listScheduleTasks(),
    runState: readRunState(),
  }
}

export function getScheduleRunState(taskId: string): ScheduleRunState | undefined {
  return readRunState()[taskId]
}

export function setScheduleRunState(taskId: string, patch: ScheduleRunState): void {
  const all = readRunState()
  all[taskId] = { ...(all[taskId] ?? {}), ...patch }
  writeRunState(all)
}

export function upsertScheduleTask(input: UpsertScheduleTaskInput): ScheduleTask {
  migrateSchedulesFromSettings()
  const tasks = readTasks()
  const title = input.title.trim().slice(0, 60)
  if (!title) throw new Error('title_required')
  const action = normalizeAction(input.action)
  const stamp = nowIso()

  let recurrence: ScheduleRecurrence
  if (input.recurrence) {
    recurrence = normalizeRecurrence(input.recurrence)
  } else {
    const hour = clampHour(input.hour ?? 8)
    const minute = clampMinute(input.minute ?? 0)
    recurrence = { type: 'daily', hour, minute }
  }
  const hm = hourMinuteFromRecurrence(recurrence)

  const coverImage =
    input.coverImage === null
      ? undefined
      : typeof input.coverImage === 'string' && input.coverImage.startsWith('data:image/')
        ? input.coverImage.slice(0, 900_000)
        : undefined

  if (input.id) {
    const idx = tasks.findIndex((t) => t.id === input.id)
    if (idx < 0) throw new Error('not_found')
    const prev = tasks[idx]!
    const next: ScheduleTask = {
      ...prev,
      enabled: input.enabled ?? prev.enabled,
      title,
      hour: hm.hour,
      minute: hm.minute,
      recurrence,
      action: prev.kind === 'builtin' ? prev.action : action,
      updatedAt: stamp,
    }
    if (prev.kind === 'custom') next.action = action
    if (input.coverImage !== undefined) {
      next.coverImage = coverImage
      next.coverPreset = coverImage ? 'custom' : input.coverPreset || defaultCoverPreset(next.action)
    } else if (input.coverPreset) {
      next.coverPreset = input.coverPreset
      if (input.coverPreset !== 'custom') next.coverImage = undefined
    }
    if (input.reportFormat === 'html' || input.reportFormat === 'markdown') {
      next.reportFormat = input.reportFormat
    }
    tasks[idx] = next
    writeTasks(tasks)
    if (next.kind === 'builtin') syncBuiltinToSettings(next)
    return enrichTask(next)
  }

  if (action.type !== 'agent_turn') {
    throw new Error('custom_requires_agent_turn')
  }

  const created: ScheduleTask = {
    id: uid(),
    kind: 'custom',
    enabled: input.enabled !== false,
    title,
    hour: hm.hour,
    minute: hm.minute,
    recurrence,
    action,
    coverPreset: coverImage ? 'custom' : input.coverPreset || 'agent',
    coverImage,
    reportFormat: input.reportFormat === 'html' ? 'html' : 'markdown',
    createdAt: stamp,
    updatedAt: stamp,
  }
  writeTasks([...tasks, created])
  return enrichTask(created)
}

export function setScheduleTaskEnabled(id: string, enabled: boolean): ScheduleTask | null {
  migrateSchedulesFromSettings()
  const tasks = readTasks()
  const idx = tasks.findIndex((t) => t.id === id)
  if (idx < 0) return null
  const next: ScheduleTask = {
    ...tasks[idx]!,
    enabled,
    updatedAt: nowIso(),
  }
  tasks[idx] = next
  writeTasks(tasks)
  if (next.kind === 'builtin') syncBuiltinToSettings(next)
  return enrichTask(next)
}

export function deleteScheduleTask(id: string): boolean {
  migrateSchedulesFromSettings()
  const tasks = readTasks()
  const hit = tasks.find((t) => t.id === id)
  if (!hit) return false

  if (hit.kind === 'builtin') {
    writeRemovedBuiltins([...readRemovedBuiltins(), id])
    writeTasks(tasks.filter((t) => t.id !== id))
    if (hit.action.type === 'fortune_notify') {
      void settingsStore.setNotifications({ fortuneDaily: false })
    }
    if (hit.action.type === 'stocks_report') {
      void settingsStore.setStocksSettings({ autoGenerate: false })
    }
  } else {
    writeTasks(tasks.filter((t) => t.id !== id))
  }

  const state = readRunState()
  if (state[id]) {
    delete state[id]
    writeRunState(state)
  }
  return true
}

export function getScheduleTask(id: string): ScheduleTask | undefined {
  return listScheduleTasks().find((t) => t.id === id)
}
