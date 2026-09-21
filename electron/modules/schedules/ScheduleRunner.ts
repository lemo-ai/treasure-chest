import type { ScheduleNotifyOverride, ScheduleRecurrence, ScheduleTask } from '@shared'
import { setSetting } from '../../db/AppSettingsRepo'
import {
  runHarnessChat,
} from '../harness/HarnessService'
import { settingsStore } from '../settings/SettingsStore'
import {
  buildFortuneInboxCopy,
  checkFortuneNotification,
} from '../notifications/FortuneNotificationService'
import { publishInboxItem } from '../notifications/InboxStore'
import {
  escapeHtml,
  markdownToSimpleHtml,
  scheduleReportShell,
} from '../notifications/reportFormat'
import { buildDataSourcesAppendix } from '../dataSources/DataSourceService'
import { listSkills } from '../skills/SkillsStore'
import { checkStocksAutoGenerate } from '../stocks/StocksScheduler'
import { logger } from '../../utils/logger'
import {
  getScheduleRunState,
  getScheduleTask,
  listScheduleTasks,
  setScheduleRunState,
  setScheduleTaskEnabled,
} from './SchedulesStore'

function todayYmd(): string {
  const n = new Date()
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`
}

function minsOf(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

function recurrenceOf(task: ScheduleTask): ScheduleRecurrence {
  if (task.recurrence && typeof task.recurrence === 'object' && 'type' in task.recurrence) {
    return task.recurrence
  }
  return { type: 'daily', hour: task.hour, minute: task.minute }
}

function isDue(task: ScheduleTask): boolean {
  if (!task.enabled) return false
  const now = new Date()
  const state = getScheduleRunState(task.id)
  const rec = recurrenceOf(task)

  if (rec.type === 'once') {
    const at = new Date(rec.atIso)
    if (Number.isNaN(at.getTime())) return false
    if (now.getTime() < at.getTime()) return false
    return !state?.lastRunAtIso
  }

  if (rec.type === 'daily') {
    const target = rec.hour * 60 + rec.minute
    if (minsOf(now) < target) return false
    return state?.lastRunYmd !== todayYmd()
  }

  if (rec.type === 'interval') {
    const everyMs = Math.max(1, rec.everyMinutes) * 60_000
    const last = state?.lastRunAtIso ? new Date(state.lastRunAtIso).getTime() : 0
    const anchor = rec.anchorIso ? new Date(rec.anchorIso).getTime() : 0
    const baseline = Math.max(last, anchor)
    if (!baseline) return true
    return now.getTime() - baseline >= everyMs
  }

  if (rec.type === 'window') {
    const start = rec.startHour * 60 + rec.startMinute
    const end = rec.endHour * 60 + rec.endMinute
    const cur = minsOf(now)
    const inWindow = start <= end ? cur >= start && cur <= end : cur >= start || cur <= end
    if (!inWindow) return false
    const everyMs = Math.max(1, rec.everyMinutes) * 60_000
    const last = state?.lastRunAtIso ? new Date(state.lastRunAtIso).getTime() : 0
    if (!last) return true
    return now.getTime() - last >= everyMs
  }

  return false
}

function coverOf(task: ScheduleTask): 'fortune' | 'stocks' | 'lottery' | 'agent' | 'custom' {
  if (task.coverPreset) return task.coverPreset
  if (task.action.type === 'fortune_notify') return 'fortune'
  if (task.action.type === 'stocks_report') return 'stocks'
  if (task.id === 'builtin:lottery') return 'lottery'
  if (task.action.type === 'agent_turn' && task.action.agentIds?.includes('lottery')) return 'lottery'
  return 'agent'
}

function notifyFromTask(task: ScheduleTask): ScheduleNotifyOverride | undefined {
  if (task.action.type !== 'agent_turn') return undefined
  if (task.action.runContext?.notify) return task.action.runContext.notify
  if (task.action.notifyOnComplete === false) {
    return { workbench: true, desktop: false, dingtalk: false, email: false }
  }
  return undefined
}

function inboxTitleFor(task: ScheduleTask, locale: string): string {
  const en = locale.toLowerCase().startsWith('en')
  if (task.action.type === 'fortune_notify') {
    return en ? 'Daily fortune' : '今日运势'
  }
  if (task.action.type === 'stocks_report') {
    return en ? 'Daily stock picks' : '每日荐股'
  }
  return task.title
}

function skipLabel(code: string | undefined, locale: string): string {
  const en = locale.toLowerCase().startsWith('en')
  switch (code) {
    case 'disabled':
      return en ? 'Task is disabled' : '任务未启用'
    case 'no_profile':
      return en ? 'Birth profile not set' : '尚未配置生辰档案'
    case 'already_today':
      return en ? 'Already ran today' : '今日已执行过'
    case 'before_hour':
      return en ? 'Not yet scheduled time' : '未到设定时间'
    case 'markets_closed':
      return en ? 'Markets closed today' : '今日市场休市'
    case 'busy':
      return en ? 'Another run is in progress' : '已有任务正在执行'
    case 'compute_failed':
      return en ? 'Could not compute fortune' : '无法计算今日运势'
    default:
      return code || (en ? 'Skipped' : '已跳过')
  }
}

function markRun(
  task: ScheduleTask,
  patch: {
    lastStatus: 'ok' | 'error' | 'skipped'
    lastPreview?: string
    lastError?: string
    lastSessionId?: string
  },
): void {
  const prev = getScheduleRunState(task.id)
  setScheduleRunState(task.id, {
    lastRunYmd: todayYmd(),
    lastRunAtIso: new Date().toISOString(),
    runCount: (prev?.runCount ?? 0) + 1,
    ...patch,
  })
}

async function runFortuneTask(task: ScheduleTask, force = false): Promise<void> {
  const locale = settingsStore.getLocale()
  if (force) setSetting('notifications.lastFortuneDate', '')
  const format = task.reportFormat === 'markdown' ? 'markdown' : 'html'
  const result = checkFortuneNotification({ desktopNotify: false, force })
  const copy = buildFortuneInboxCopy(locale, { format })
  const notify = notifyFromTask(task)

  if (result.sent || copy.ok) {
    markRun(task, {
      lastStatus: copy.ok ? 'ok' : 'skipped',
      lastPreview: (copy.summary || result.summary || '').slice(0, 180),
      lastError: copy.ok ? undefined : copy.reason,
    })
    publishInboxItem({
      status: copy.ok ? 'ok' : 'skipped',
      title: inboxTitleFor(task, locale),
      summary: copy.summary || result.summary || (locale.startsWith('en') ? 'Fortune reminder' : '运势提醒'),
      detail: copy.detail || result.detail || copy.summary,
      detailFormat: copy.detailFormat,
      taskId: task.id,
      coverPreset: coverOf(task),
      notify,
    })
    return
  }

  markRun(task, { lastStatus: 'skipped', lastError: result.skipped || 'skipped' })
  if (force) {
    publishInboxItem({
      status: 'skipped',
      title: inboxTitleFor(task, locale),
      summary: skipLabel(result.skipped, locale),
      detail: copy.detail || skipLabel(result.skipped, locale),
      detailFormat: copy.detailFormat,
      taskId: task.id,
      coverPreset: coverOf(task),
      notify,
    })
  }
}

async function runStocksTask(task: ScheduleTask, force = false): Promise<void> {
  if (force) setSetting('stocks.lastAutoReportDate', '')
  const locale = settingsStore.getLocale()
  const format = task.reportFormat === 'markdown' ? 'markdown' : 'html'
  const result = await checkStocksAutoGenerate({ desktopNotify: false, force, format })
  const notify = notifyFromTask(task)

  if (result.ok) {
    markRun(task, { lastStatus: 'ok', lastPreview: (result.summary || '').slice(0, 180) })
    publishInboxItem({
      status: 'ok',
      title: inboxTitleFor(task, locale),
      summary: result.summary || (locale.startsWith('en') ? 'Stocks report ready' : '荐股报告已生成'),
      detail: result.detail || result.summary || '',
      detailFormat: result.detailFormat || format,
      taskId: task.id,
      coverPreset: coverOf(task),
      notify,
    })
    return
  }

  const status = result.skipped === 'error' ? 'error' : 'skipped'
  markRun(task, {
    lastStatus: status,
    lastError: result.skipped || result.summary,
    lastPreview: (result.summary || '').slice(0, 180),
  })
  if (force || result.skipped === 'error' || result.skipped === 'markets_closed') {
    publishInboxItem({
      status,
      title: inboxTitleFor(task, locale),
      summary:
        result.skipped === 'error'
          ? result.summary || (locale.startsWith('en') ? 'Failed' : '生成失败')
          : result.summary || skipLabel(result.skipped, locale),
      detail: result.detail || result.summary || skipLabel(result.skipped, locale),
      detailFormat: result.detailFormat || format,
      taskId: task.id,
      coverPreset: coverOf(task),
      notify,
    })
  }
}

async function runAgentTask(task: ScheduleTask, force = false): Promise<void> {
  if (task.action.type !== 'agent_turn') return
  const action = task.action
  const ctx = action.runContext ?? {}
  const locale = settingsStore.getLocale()
  const isEn = locale.toLowerCase().startsWith('en')
  const agentIds =
    Array.isArray(action.agentIds) && action.agentIds.length > 0 ? action.agentIds : ['direct']
  const agentNames = Array.isArray(action.agentNames) ? action.agentNames : []
  const prompts = action.agentSystemPrompts || {}

  const skillPrompt = (ctx.skillIds || [])
    .map((id) => listSkills().find((s) => s.id === id)?.prompt)
    .filter((p): p is string => Boolean(p && p.trim()))
    .join('\n\n')

  const dsAppendix = await buildDataSourcesAppendix(ctx.dataSourceIds)
  const userMessage = dsAppendix ? `${action.message}\n\n${dsAppendix}` : action.message
  const fortune = settingsStore.getFortuneSettings()
  const useKnowledge = Boolean(ctx.useKnowledge && (ctx.knowledgeCollectionIds?.length ?? 0) > 0)
  const collectionId = ctx.knowledgeCollectionIds?.[0]
  const notify = notifyFromTask(task)

  const sections: string[] = []
  const errors: string[] = []
  let firstPreview = ''

  for (let i = 0; i < agentIds.length; i++) {
    const agentId = agentIds[i]!
    const agentLabel = agentNames[i]?.trim() || agentId

    // Ephemeral turn: do not create workbench sessions for scheduled jobs.
    // Results go to inbox / notify only.
    const res = await runHarnessChat(
      {
        agentId,
        messages: [{ role: 'user', content: userMessage }],
        systemPrompt: prompts[agentId],
        model: ctx.model,
        skillPrompt: skillPrompt || undefined,
        locale,
        enableWebSearch: ctx.enableWebSearch !== false,
        enableCodingTools: false,
        enableHarnessTools: false,
        enablePluginTools: false,
        enableSpawnSubagent: false,
        enableMcpTools: Boolean(ctx.enableMcpTools),
        enabledMcpServerIds: ctx.enabledMcpServerIds,
        useKnowledge,
        knowledgeCollectionId: collectionId,
      },
      fortune,
    )

    if (!res.ok) {
      const err = res.error || (isEn ? 'Agent task failed' : '智能体任务失败')
      errors.push(`${agentLabel}: ${err}`)
      sections.push(`## ${agentLabel}\n\n${err}`)
      continue
    }

    const full = (res.text || '').trim()
    if (!firstPreview) firstPreview = full.slice(0, 180)
    sections.push(`## ${agentLabel}\n\n${full || (isEn ? '(empty)' : '（无内容）')}`)
  }

  const detailMd = [
    isEn ? `Prompt: ${action.message}` : `提问：${action.message}`,
    sections.join('\n\n'),
  ]
    .filter(Boolean)
    .join('\n\n')

  const format = task.reportFormat === 'markdown' ? 'markdown' : 'html'
  const detailBody =
    format === 'html'
      ? scheduleReportShell(
          [
            `<section class="hero"><h1>${escapeHtml(task.title)}</h1><div class="meta">${escapeHtml(
              isEn ? 'Scheduled agent report' : '定时智能体报告',
            )}</div></section>`,
            `<article class="card"><h2>${isEn ? 'Prompt' : '提问'}</h2><p>${escapeHtml(action.message)}</p></article>`,
            ...sections.map((sec) => {
              const lines = sec.split('\n')
              const head = lines[0]?.replace(/^##\s*/, '') || ''
              const body = lines.slice(2).join('\n')
              return `<article class="card"><h2>${escapeHtml(head)}</h2>${markdownToSimpleHtml(body)}</article>`
            }),
          ].join('\n'),
          locale,
        )
      : detailMd

  if (errors.length === agentIds.length) {
    markRun(task, {
      lastStatus: 'error',
      lastError: errors.join('; '),
    })
    publishInboxItem({
      status: 'error',
      title: task.title,
      summary: errors[0] || (isEn ? 'Agent task failed' : '智能体任务失败'),
      detail: detailBody,
      detailFormat: format,
      taskId: task.id,
      coverPreset: coverOf(task),
      notify,
    })
    throw new Error(errors[0] || 'agent_turn_failed')
  }

  const label =
    agentNames.filter(Boolean).join(' · ') ||
    (agentIds.length === 1 && agentIds[0] !== 'direct' ? agentIds[0] : '') ||
    task.title

  markRun(task, {
    lastStatus: errors.length ? 'ok' : 'ok',
    lastError: errors.length ? errors.join('; ') : undefined,
    lastPreview: firstPreview,
  })

  if (recurrenceOf(task).type === 'once') {
    setScheduleTaskEnabled(task.id, false)
  }

  publishInboxItem({
    status: errors.length ? 'ok' : 'ok',
    title: label,
    summary:
      firstPreview ||
      (errors.length
        ? isEn
          ? 'Finished with partial errors.'
          : '已完成（部分失败）'
        : isEn
          ? 'Scheduled task finished.'
          : '定时任务已完成。'),
    detail: detailBody,
    detailFormat: format,
    taskId: task.id,
    coverPreset: coverOf(task),
    notify: force && !notify ? undefined : notify,
  })
}

export async function executeScheduleTask(taskId: string, opts?: { force?: boolean }): Promise<void> {
  const task = getScheduleTask(taskId)
  if (!task) throw new Error('not_found')
  if (!opts?.force && !isDue(task)) {
    setScheduleRunState(task.id, {
      ...(getScheduleRunState(task.id) ?? {}),
      lastStatus: 'skipped',
    })
    return
  }

  logger.info(`schedule run id=${task.id} type=${task.action.type} force=${Boolean(opts?.force)}`)
  try {
    if (task.action.type === 'fortune_notify') {
      await runFortuneTask(task, opts?.force)
      if (recurrenceOf(task).type === 'once') setScheduleTaskEnabled(task.id, false)
      return
    }
    if (task.action.type === 'stocks_report') {
      await runStocksTask(task, opts?.force)
      if (recurrenceOf(task).type === 'once') setScheduleTaskEnabled(task.id, false)
      return
    }
    await runAgentTask(task, opts?.force)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`schedule run failed id=${task.id}`, err)
    markRun(task, { lastStatus: 'error', lastError: msg })
    throw err
  }
}

export async function tickScheduleRunner(): Promise<void> {
  const tasks = listScheduleTasks()
  for (const task of tasks) {
    if (!isDue(task)) continue
    try {
      await executeScheduleTask(task.id)
    } catch {
      /* already logged */
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null

export function startScheduleRunner(): void {
  void tickScheduleRunner()
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    void tickScheduleRunner()
  }, 60_000)
}

export function stopScheduleRunner(): void {
  if (timer) clearInterval(timer)
  timer = null
}
