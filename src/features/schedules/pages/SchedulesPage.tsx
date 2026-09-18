import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type {
  DataSourceConfig,
  FortuneAiProviderConfig,
  KnowledgeCollection,
  ScheduleAction,
  ScheduleCoverPreset,
  ScheduleNotifyOverride,
  ScheduleRecurrence,
  ScheduleRunContext,
  ScheduleRunState,
  ScheduleTask,
  UpsertScheduleTaskInput,
} from '@shared'
import { resolveDataSourceIcon, resolveScheduleAgentIds, resolveScheduleAgentLabel } from '@shared'
import {
  agentDisplayName,
  getAgent,
  listAgents,
  type AgentDef,
} from '@renderer/features/agents/lib/agentRegistry'
import { encodeChatModelRef, groupedChatModels } from '@renderer/features/workbench/lib/chatModelOptions'
import { IconBell, IconImage, IconPlus, IconTrash } from '@renderer/shared/ui/icons'
import { ToggleSwitch } from '@renderer/shared/ui/ToggleSwitch'
import { MultiSelectDropdown } from '../components/MultiSelectDropdown'
import { inferPreset, resolveScheduleCoverUrl } from '../lib/coverResolve'
import { coverDataUrlFromFile } from '../lib/scheduleCover'
import styles from './SchedulesPage.module.css'

type RecurrenceKind = ScheduleRecurrence['type']

type Draft = {
  id?: string
  title: string
  enabled: boolean
  agentIds: string[]
  message: string
  coverPreset: ScheduleCoverPreset
  coverImage: string
  coverDirty: boolean
  reportFormat: 'html' | 'markdown'
  recurrenceType: RecurrenceKind
  hour: number
  minute: number
  onceLocal: string
  everyMinutes: number
  windowStartHour: number
  windowStartMinute: number
  windowEndHour: number
  windowEndMinute: number
  model: string
  skillIds: string[]
  enableMcpTools: boolean
  enabledMcpServerIds: string[]
  useKnowledge: boolean
  knowledgeCollectionIds: string[]
  enableWebSearch: boolean
  dataSourceIds: string[]
  notify: ScheduleNotifyOverride
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toLocalInputValue(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function emptyDraft(): Draft {
  const now = new Date()
  now.setMinutes(now.getMinutes() + 30)
  return {
    title: '',
    enabled: true,
    agentIds: [],
    message: '',
    coverPreset: 'agent',
    coverImage: '',
    coverDirty: false,
    reportFormat: 'html',
    recurrenceType: 'daily',
    hour: 8,
    minute: 0,
    onceLocal: toLocalInputValue(now),
    everyMinutes: 60,
    windowStartHour: 9,
    windowStartMinute: 0,
    windowEndHour: 18,
    windowEndMinute: 0,
    model: '',
    skillIds: [],
    enableMcpTools: false,
    enabledMcpServerIds: [],
    useKnowledge: false,
    knowledgeCollectionIds: [],
    enableWebSearch: true,
    dataSourceIds: [],
    notify: {},
  }
}

function recurrenceFromDraft(d: Draft): ScheduleRecurrence {
  if (d.recurrenceType === 'once') {
    const at = new Date(d.onceLocal)
    return { type: 'once', atIso: Number.isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString() }
  }
  if (d.recurrenceType === 'interval') {
    return { type: 'interval', everyMinutes: Math.max(1, d.everyMinutes) }
  }
  if (d.recurrenceType === 'window') {
    return {
      type: 'window',
      startHour: d.windowStartHour,
      startMinute: d.windowStartMinute,
      endHour: d.windowEndHour,
      endMinute: d.windowEndMinute,
      everyMinutes: Math.max(1, d.everyMinutes),
    }
  }
  return { type: 'daily', hour: d.hour, minute: d.minute }
}

function draftFromTask(task: ScheduleTask): Draft {
  const d = emptyDraft()
  d.id = task.id
  d.title = task.title
  d.enabled = task.enabled
  d.coverPreset = inferPreset(task)
  d.coverImage = task.coverImage || ''
  d.reportFormat =
    task.reportFormat === 'html' || task.reportFormat === 'markdown'
      ? task.reportFormat
      : task.action.type === 'fortune_notify' || task.action.type === 'stocks_report'
        ? 'html'
        : 'markdown'
  const rec = task.recurrence
  if (rec && typeof rec === 'object' && 'type' in rec) {
    d.recurrenceType = rec.type
    if (rec.type === 'daily') {
      d.hour = rec.hour
      d.minute = rec.minute
    } else if (rec.type === 'once') {
      d.onceLocal = toLocalInputValue(new Date(rec.atIso))
    } else if (rec.type === 'interval') {
      d.everyMinutes = rec.everyMinutes
    } else if (rec.type === 'window') {
      d.windowStartHour = rec.startHour
      d.windowStartMinute = rec.startMinute
      d.windowEndHour = rec.endHour
      d.windowEndMinute = rec.endMinute
      d.everyMinutes = rec.everyMinutes
    }
  } else {
    d.hour = task.hour
    d.minute = task.minute
  }
  if (task.action.type === 'agent_turn') {
    d.agentIds = resolveScheduleAgentIds(task.action)
    d.message = task.action.message
    const ctx = task.action.runContext
    if (ctx) {
      d.model = ctx.model || ''
      d.skillIds = ctx.skillIds || []
      d.enableMcpTools = Boolean(ctx.enableMcpTools)
      d.enabledMcpServerIds = ctx.enabledMcpServerIds || []
      d.useKnowledge = Boolean(ctx.useKnowledge)
      d.knowledgeCollectionIds = ctx.knowledgeCollectionIds || []
      d.enableWebSearch = ctx.enableWebSearch !== false
      d.dataSourceIds = ctx.dataSourceIds || []
      d.notify = ctx.notify || {}
    } else if (task.action.notifyOnComplete === false) {
      d.notify = { desktop: false, dingtalk: false, email: false }
    }
  }
  return d
}

function actionLabel(
  task: ScheduleTask,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const { action } = task
  if (action.type === 'fortune_notify') return t('schedules.action.fortune')
  if (action.type === 'stocks_report') return t('schedules.action.stocks')
  if (action.type === 'agent_turn') {
    if (action.agentIds?.includes('lottery')) return t('schedules.action.lottery')
    return t('schedules.action.agent', {
      agent: resolveScheduleAgentLabel(action) || t('schedules.context.agentDirect'),
      message: action.message,
    })
  }
  return t('schedules.untitled')
}

function recurrenceLabel(
  task: ScheduleTask,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const rec = task.recurrence
  if (!rec || typeof rec !== 'object') {
    return t('schedules.everyDayAt', { time: `${pad2(task.hour)}:${pad2(task.minute)}` })
  }
  if (rec.type === 'daily') {
    return t('schedules.everyDayAt', { time: `${pad2(rec.hour)}:${pad2(rec.minute)}` })
  }
  if (rec.type === 'once') {
    try {
      return t('schedules.recurrence.onceAt', { time: new Date(rec.atIso).toLocaleString() })
    } catch {
      return t('schedules.recurrence.once')
    }
  }
  if (rec.type === 'interval') {
    return t('schedules.recurrence.intervalEvery', { minutes: rec.everyMinutes })
  }
  return t('schedules.recurrence.windowEvery', {
    start: `${pad2(rec.startHour)}:${pad2(rec.startMinute)}`,
    end: `${pad2(rec.endHour)}:${pad2(rec.endMinute)}`,
    minutes: rec.everyMinutes,
  })
}

const TONE: Record<ScheduleCoverPreset, string> = {
  fortune: styles.toneFortune,
  stocks: styles.toneStocks,
  lottery: styles.toneLottery,
  agent: styles.toneAgent,
  custom: styles.toneCustom,
}

export function SchedulesPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [tasks, setTasks] = useState<ScheduleTask[]>([])
  const [runState, setRunState] = useState<Record<string, ScheduleRunState>>({})
  const [agents, setAgents] = useState<AgentDef[]>(() => listAgents())
  const [providers, setProviders] = useState<FortuneAiProviderConfig[]>([])
  const [skills, setSkills] = useState<Array<{ id: string; name: string }>>([])
  const [mcpServers, setMcpServers] = useState<Array<{ id: string; name: string; enabled: boolean }>>([])
  const [collections, setCollections] = useState<KnowledgeCollection[]>([])
  const [dataSources, setDataSources] = useState<DataSourceConfig[]>([])
  const [channelAvail, setChannelAvail] = useState({
    workbench: true,
    desktop: true,
    dingtalk: false,
    email: false,
  })
  const [loaded, setLoaded] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const fileRef = useRef<HTMLInputElement>(null)

  const modelGroups = useMemo(() => groupedChatModels(providers), [providers])

  const reload = async (): Promise<void> => {
    const [snap, settings, skillList, mcp, cols] = await Promise.all([
      window.treasureChest.getSchedulesSnapshot(),
      window.treasureChest.getSettingsSnapshot(),
      window.treasureChest.listSkills(),
      window.treasureChest.getMcpSettings(),
      window.treasureChest.listKnowledgeCollections(),
    ])
    setTasks(snap.tasks)
    setRunState(snap.runState)
    setAgents(listAgents())
    setProviders(settings.fortune?.aiProviders ?? [])
    setSkills(skillList.map((s) => ({ id: s.id, name: s.name })))
    setMcpServers(mcp.servers.map((s) => ({ id: s.id, name: s.name, enabled: s.enabled })))
    setCollections(cols)
    setDataSources(settings.dataSources?.sources ?? [])
    const ch = settings.notifications?.channels
    setChannelAvail({
      workbench: ch?.workbenchInbox !== false,
      desktop: ch?.desktopOs !== false,
      dingtalk: Boolean(ch?.dingtalk?.enabled && ch.dingtalk.webhookUrl?.trim()),
      email: Boolean(ch?.email?.enabled && ch.email.to?.trim() && ch.email.smtpHost?.trim()),
    })
    setLoaded(true)
  }

  useEffect(() => {
    void reload().catch(() => setError(t('schedules.loadFailed')))
  }, [t])

  const openCreate = (): void => {
    const d = emptyDraft()
    d.title = t('schedules.defaultCustomTitleGeneric')
    setDraft(d)
    setEditorOpen(true)
    setError(null)
  }

  const openEdit = (task: ScheduleTask): void => {
    setDraft(draftFromTask(task))
    setEditorOpen(true)
    setError(null)
  }

  const onPickCover = async (file: File | null): Promise<void> => {
    if (!file) return
    try {
      const url = await coverDataUrlFromFile(file)
      setDraft((d) => ({ ...d, coverImage: url, coverPreset: 'custom', coverDirty: true }))
    } catch {
      setError(t('schedules.coverFailed'))
    }
  }

  const saveDraft = async (): Promise<void> => {
    setError(null)
    try {
      const editing = draft.id ? tasks.find((x) => x.id === draft.id) : null
      let action: ScheduleAction
      const lockedBuiltinAction =
        editing?.kind === 'builtin' &&
        (editing.action.type === 'fortune_notify' || editing.action.type === 'stocks_report')
      if (lockedBuiltinAction) {
        action = editing.action
      } else {
        if (!draft.message.trim()) {
          setError(t('schedules.messageRequired'))
          return
        }
        const selectedAgents = draft.agentIds
          .map((id) => getAgent(id))
          .filter((a): a is AgentDef => Boolean(a))
        const agentSystemPrompts: Record<string, string> = {}
        for (const agent of selectedAgents) {
          if (!agent.builtin && agent.systemPrompt.trim()) {
            agentSystemPrompts[String(agent.id)] = agent.systemPrompt
          }
        }
        const runContext: ScheduleRunContext = {
          model: draft.model || undefined,
          skillIds: draft.skillIds,
          enableMcpTools: draft.enabledMcpServerIds.length > 0,
          enabledMcpServerIds: draft.enabledMcpServerIds,
          useKnowledge: draft.knowledgeCollectionIds.length > 0,
          knowledgeCollectionIds: draft.knowledgeCollectionIds,
          enableWebSearch: draft.enableWebSearch,
          dataSourceIds: draft.dataSourceIds,
          notify: draft.notify,
        }
        action = {
          type: 'agent_turn',
          agentIds: selectedAgents.map((a) => String(a.id)),
          agentNames: selectedAgents.map((a) => agentDisplayName(a, t)),
          agentSystemPrompts:
            Object.keys(agentSystemPrompts).length > 0 ? agentSystemPrompts : undefined,
          message: draft.message.trim(),
          notifyOnComplete: draft.notify.desktop !== false,
          runContext,
        }
      }
      const recurrence = recurrenceFromDraft(draft)
      const input: UpsertScheduleTaskInput = {
        id: draft.id,
        title: draft.title.trim() || t('schedules.untitled'),
        enabled: draft.enabled,
        recurrence,
        action,
        coverPreset: draft.coverPreset,
        reportFormat: draft.reportFormat,
      }
      if (draft.coverDirty) input.coverImage = draft.coverImage || null
      await window.treasureChest.upsertScheduleTask(input)
      setEditorOpen(false)
      await reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(t('schedules.saveFailed', { error: msg }))
    }
  }

  const onToggle = async (task: ScheduleTask, enabled: boolean): Promise<void> => {
    setBusyId(task.id)
    try {
      await window.treasureChest.setScheduleTaskEnabled(task.id, enabled)
      await reload()
    } catch {
      setError(t('schedules.saveFailed', { error: 'toggle' }))
    } finally {
      setBusyId(null)
    }
  }

  const onDelete = async (task: ScheduleTask): Promise<void> => {
    const ok = window.confirm(
      task.kind === 'builtin' ? t('schedules.deleteBuiltinConfirm') : t('schedules.deleteConfirm'),
    )
    if (!ok) return
    setBusyId(task.id)
    try {
      await window.treasureChest.deleteScheduleTask(task.id)
      await reload()
    } catch {
      setError(t('schedules.deleteFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const onRunNow = async (task: ScheduleTask): Promise<void> => {
    setBusyId(task.id)
    setError(null)
    try {
      const snap = await window.treasureChest.runScheduleTaskNow(task.id)
      setTasks(snap.tasks)
      setRunState(snap.runState)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(t('schedules.runFailed', { error: msg }))
      await reload()
    } finally {
      setBusyId(null)
    }
  }

  const editingTask = draft.id ? tasks.find((x) => x.id === draft.id) ?? null : null
  const editingBuiltin = editingTask?.kind === 'builtin'
  const showAgentFields =
    !editingBuiltin || editingTask?.action.type === 'agent_turn'
  const draftCoverUrl =
    draft.coverImage ||
    resolveScheduleCoverUrl({
      id: 'draft',
      kind: 'custom',
      enabled: true,
      title: '',
      hour: 0,
      minute: 0,
      recurrence: { type: 'daily', hour: 0, minute: 0 },
      action: { type: 'agent_turn', agentIds: [], message: 'x' },
      coverPreset: draft.coverPreset === 'custom' ? 'agent' : draft.coverPreset,
      createdAt: '',
      updatedAt: '',
    })

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{t('schedules.title')}</h1>
          <p className={styles.sub}>{t('schedules.subtitle')}</p>
        </div>
        <button type="button" className={styles.primaryBtn} onClick={openCreate}>
          <IconPlus />
          {t('schedules.create')}
        </button>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}

      {!loaded ? (
        <p className={styles.loading}>{t('schedules.loading')}</p>
      ) : tasks.length === 0 ? (
        <div className={styles.empty}>
          <IconBell />
          <p>{t('schedules.empty')}</p>
          <button type="button" className={styles.primaryBtn} onClick={openCreate}>
            <IconPlus />
            {t('schedules.create')}
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          {tasks.map((task) => {
            const state = runState[task.id]
            const preset = inferPreset(task)
            const cover = resolveScheduleCoverUrl(task)
            const ctx = task.action.type === 'agent_turn' ? task.action.runContext : undefined
            const agentCount =
              task.action.type === 'agent_turn' ? resolveScheduleAgentIds(task.action).length : 0
            return (
              <article key={task.id} className={`${styles.card} ${TONE[preset]}`}>
                <div
                  className={styles.cardMedia}
                  style={cover ? { backgroundImage: `url(${cover})` } : undefined}
                />
                <div className={styles.cardGlow} />
                <div className={styles.cardScrim} />
                <div className={styles.cardBody}>
                  <div className={styles.cardTop}>
                    <div className={styles.badges}>
                      {task.kind === 'builtin' ? (
                        <span className={styles.badge}>{t('schedules.builtin')}</span>
                      ) : (
                        <span className={styles.badgeCustom}>{t('schedules.custom')}</span>
                      )}
                      <span className={styles.timeChip}>{recurrenceLabel(task, t)}</span>
                    </div>
                    <ToggleSwitch
                      checked={task.enabled}
                      label={task.title}
                      onChange={(enabled) => void onToggle(task, enabled)}
                    />
                  </div>
                  <div>
                    <div className={styles.cardMain}>
                      <h2 className={styles.cardTitle}>{task.title}</h2>
                      <p className={styles.cardAction}>{actionLabel(task, t)}</p>
                      {task.action.type === 'agent_turn' || ctx ? (
                        <div className={styles.chipRow}>
                          {task.action.type === 'agent_turn' ? (
                            <span className={styles.miniChip}>
                              {agentCount > 0 ? `agents ${agentCount}` : 'direct'}
                            </span>
                          ) : null}
                          {ctx?.model ? <span className={styles.miniChip}>model</span> : null}
                          {(ctx?.skillIds?.length ?? 0) > 0 ? (
                            <span className={styles.miniChip}>skills {ctx!.skillIds!.length}</span>
                          ) : null}
                          {ctx?.enableMcpTools ? <span className={styles.miniChip}>MCP</span> : null}
                          {ctx?.useKnowledge ? <span className={styles.miniChip}>KB</span> : null}
                          {(ctx?.dataSourceIds?.length ?? 0) > 0 ? (
                            <span className={styles.miniChip}>DS {ctx!.dataSourceIds!.length}</span>
                          ) : null}
                        </div>
                      ) : null}
                      {state?.lastRunYmd || state?.lastRunAtIso ? (
                        <p className={styles.cardRun}>
                          {t('schedules.lastRun', {
                            date: state.lastRunYmd || state.lastRunAtIso?.slice(0, 10) || '',
                            status:
                              state.lastStatus === 'ok'
                                ? t('schedules.status.ok')
                                : state.lastStatus === 'error'
                                  ? t('schedules.status.error')
                                  : t('schedules.status.skipped'),
                          })}
                          {state.lastPreview ? ` · ${state.lastPreview}` : ''}
                        </p>
                      ) : (
                        <p className={styles.cardRun}>{t('schedules.neverRun')}</p>
                      )}
                    </div>
                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        disabled={busyId === task.id}
                        onClick={() => openEdit(task)}
                      >
                        {t('schedules.edit')}
                      </button>
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        disabled={busyId === task.id}
                        onClick={() => void onRunNow(task)}
                      >
                        {busyId === task.id ? t('schedules.running') : t('schedules.runNow')}
                      </button>
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        disabled={busyId === task.id}
                        onClick={() => void onDelete(task)}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <p className={styles.note}>{t('schedules.appRunningNote')}</p>

      {editorOpen ? (
        <div className={styles.backdrop} role="presentation" onClick={() => setEditorOpen(false)}>
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <header className={styles.dialogHead}>
              <div>
                <p className={styles.dialogEyebrow}>
                  {editingBuiltin ? t('schedules.builtin') : t('schedules.custom')}
                </p>
                <h2 className={styles.dialogTitle}>
                  {draft.id ? t('schedules.editTitle') : t('schedules.createTitle')}
                </h2>
              </div>
              <label className={styles.enablePill}>
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
                />
                <span>{t('schedules.enabled')}</span>
              </label>
            </header>

            <div
              className={styles.coverHero}
              style={draftCoverUrl ? { backgroundImage: `url(${draftCoverUrl})` } : undefined}
            >
              <div className={styles.coverHeroScrim} />
              <div className={styles.coverHeroBody}>
                <p className={styles.coverHeroTitle}>{draft.title || t('schedules.untitled')}</p>
                <div className={styles.coverActions}>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() => fileRef.current?.click()}
                  >
                    <IconImage />
                    {t('schedules.pickCover')}
                  </button>
                  <input
                    ref={fileRef}
                    className={styles.fileInput}
                    type="file"
                    accept="image/*"
                    onChange={(e) => void onPickCover(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
            </div>

            <div className={styles.formGrid}>
              <section className={styles.formSection}>
                <h3 className={styles.sectionTitle}>{t('schedules.form.basic')}</h3>
                <label className={styles.field}>
                  <span>{t('schedules.fieldTitle')}</span>
                  <input
                    value={draft.title}
                    maxLength={60}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  />
                </label>

                <label className={styles.field}>
                  <span>{t('schedules.recurrence.label')}</span>
                  <div className={styles.seg}>
                    {(['daily', 'once', 'interval', 'window'] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className={`${styles.segBtn} ${draft.recurrenceType === kind ? styles.segBtnOn : ''}`}
                        onClick={() => setDraft((d) => ({ ...d, recurrenceType: kind }))}
                      >
                        {t(`schedules.recurrence.${kind}`)}
                      </button>
                    ))}
                  </div>
                </label>

                {draft.recurrenceType === 'daily' ? (
                  <div className={styles.timeRow}>
                    <label className={styles.field}>
                      <span>{t('schedules.fieldHour')}</span>
                      <select
                        value={draft.hour}
                        onChange={(e) => setDraft((d) => ({ ...d, hour: Number(e.target.value) }))}
                      >
                        {Array.from({ length: 24 }, (_, h) => (
                          <option key={h} value={h}>
                            {pad2(h)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>{t('schedules.fieldMinute')}</span>
                      <select
                        value={draft.minute}
                        onChange={(e) => setDraft((d) => ({ ...d, minute: Number(e.target.value) }))}
                      >
                        {Array.from({ length: 60 }, (_, m) => (
                          <option key={m} value={m}>
                            {pad2(m)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}

                {draft.recurrenceType === 'once' ? (
                  <label className={styles.field}>
                    <span>{t('schedules.recurrence.at')}</span>
                    <input
                      type="datetime-local"
                      value={draft.onceLocal}
                      onChange={(e) => setDraft((d) => ({ ...d, onceLocal: e.target.value }))}
                    />
                  </label>
                ) : null}

                {draft.recurrenceType === 'interval' || draft.recurrenceType === 'window' ? (
                  <label className={styles.field}>
                    <span>{t('schedules.recurrence.everyMinutes')}</span>
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      value={draft.everyMinutes}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          everyMinutes: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                    />
                  </label>
                ) : null}

                {draft.recurrenceType === 'window' ? (
                  <div className={styles.timeRow}>
                    <label className={styles.field}>
                      <span>{t('schedules.recurrence.windowStart')}</span>
                      <input
                        type="time"
                        value={`${pad2(draft.windowStartHour)}:${pad2(draft.windowStartMinute)}`}
                        onChange={(e) => {
                          const [h, m] = e.target.value.split(':').map(Number)
                          setDraft((d) => ({
                            ...d,
                            windowStartHour: h || 0,
                            windowStartMinute: m || 0,
                          }))
                        }}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>{t('schedules.recurrence.windowEnd')}</span>
                      <input
                        type="time"
                        value={`${pad2(draft.windowEndHour)}:${pad2(draft.windowEndMinute)}`}
                        onChange={(e) => {
                          const [h, m] = e.target.value.split(':').map(Number)
                          setDraft((d) => ({
                            ...d,
                            windowEndHour: h || 0,
                            windowEndMinute: m || 0,
                          }))
                        }}
                      />
                    </label>
                  </div>
                ) : null}
              </section>

              <section className={styles.formSection}>
                {editingBuiltin && !showAgentFields ? (
                  <p className={styles.hint}>{t('schedules.builtinEditHint')}</p>
                ) : null}
                {editingBuiltin && showAgentFields ? (
                  <p className={styles.hint}>{t('schedules.builtinAgentEditHint')}</p>
                ) : null}
                <label className={styles.field}>
                  <span>{t('schedules.reportFormat')}</span>
                  <select
                    value={draft.reportFormat}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        reportFormat: e.target.value === 'markdown' ? 'markdown' : 'html',
                      }))
                    }
                  >
                    <option value="html">{t('schedules.reportFormatHtml')}</option>
                    <option value="markdown">{t('schedules.reportFormatMarkdown')}</option>
                  </select>
                </label>
                <p className={styles.hint}>{t('schedules.reportFormatHint')}</p>
              </section>

              {showAgentFields ? (
                <>
                  <section className={styles.formSection}>
                    <h3 className={styles.sectionTitle}>{t('schedules.form.prompt')}</h3>
                    <label className={styles.field}>
                      <span>{t('schedules.context.model')}</span>
                      <select
                        value={draft.model}
                        onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                      >
                        <option value="">{t('schedules.context.modelDefault')}</option>
                        {modelGroups.map((g) => (
                          <optgroup key={g.id} label={g.name}>
                            {g.models.map((m) => (
                              <option key={`${g.id}::${m}`} value={encodeChatModelRef(g.id, m)}>
                                {m}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>{t('schedules.fieldMessage')}</span>
                      <textarea
                        rows={4}
                        value={draft.message}
                        placeholder={t('schedules.messagePlaceholder')}
                        onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))}
                      />
                    </label>
                  </section>

                  <section className={`${styles.formSection} ${styles.formSectionWide}`}>
                    <h3 className={styles.sectionTitle}>{t('schedules.form.capabilities')}</h3>
                    <div className={styles.capGrid}>
                      <MultiSelectDropdown
                        label={t('schedules.context.agents')}
                        placeholder={t('schedules.context.pickAgents')}
                        emptyText={t('schedules.context.agentDirect')}
                        options={agents.map((agent) => ({
                          id: String(agent.id),
                          label: agentDisplayName(agent, t),
                        }))}
                        value={draft.agentIds}
                        onChange={(agentIds) => setDraft((d) => ({ ...d, agentIds }))}
                      />
                      <MultiSelectDropdown
                        label={t('schedules.context.skills')}
                        placeholder={t('schedules.context.pickSkills')}
                        emptyText={t('schedules.context.none')}
                        options={skills.map((s) => ({ id: s.id, label: s.name }))}
                        value={draft.skillIds}
                        onChange={(skillIds) => setDraft((d) => ({ ...d, skillIds }))}
                      />
                      <MultiSelectDropdown
                        label={t('schedules.context.mcpServers')}
                        placeholder={t('schedules.context.pickMcp')}
                        emptyText={t('schedules.context.none')}
                        options={mcpServers.map((s) => ({
                          id: s.id,
                          label: s.name,
                          hint: s.enabled ? undefined : 'off',
                          disabled: !s.enabled,
                        }))}
                        value={draft.enabledMcpServerIds}
                        onChange={(enabledMcpServerIds) =>
                          setDraft((d) => ({
                            ...d,
                            enabledMcpServerIds,
                            enableMcpTools: enabledMcpServerIds.length > 0,
                          }))
                        }
                      />
                      <MultiSelectDropdown
                        label={t('schedules.context.collections')}
                        placeholder={t('schedules.context.pickKnowledge')}
                        emptyText={t('schedules.context.none')}
                        options={collections.map((c) => ({ id: c.id, label: c.name }))}
                        value={draft.knowledgeCollectionIds}
                        onChange={(knowledgeCollectionIds) =>
                          setDraft((d) => ({
                            ...d,
                            knowledgeCollectionIds,
                            useKnowledge: knowledgeCollectionIds.length > 0,
                          }))
                        }
                      />
                      <MultiSelectDropdown
                        label={t('schedules.context.dataSources')}
                        placeholder={t('schedules.context.pickDataSources')}
                        emptyText={t('schedules.context.none')}
                        trailing={
                          <Link className={styles.inlineLink} to="/settings?section=dataSources">
                            {t('schedules.context.manageInSettings')}
                          </Link>
                        }
                        options={dataSources.map((s) => ({
                          id: s.id,
                          label: `${resolveDataSourceIcon(s)} ${s.name}`,
                          hint: s.kind,
                        }))}
                        value={draft.dataSourceIds}
                        onChange={(dataSourceIds) => setDraft((d) => ({ ...d, dataSourceIds }))}
                      />
                    </div>
                    <label className={styles.switchCard}>
                      <div>
                        <div className={styles.switchTitle}>{t('schedules.context.webSearch')}</div>
                        <div className={styles.switchHint}>{t('schedules.context.webSearchHint')}</div>
                      </div>
                      <ToggleSwitch
                        checked={draft.enableWebSearch}
                        label={t('schedules.context.webSearch')}
                        onChange={(enableWebSearch) => setDraft((d) => ({ ...d, enableWebSearch }))}
                      />
                    </label>
                  </section>

                  <section className={`${styles.formSection} ${styles.formSectionWide}`}>
                    <div className={styles.sectionHead}>
                      <h3 className={styles.sectionTitle}>{t('schedules.context.notify')}</h3>
                      <Link className={styles.inlineLink} to="/settings?section=notifications">
                        {t('schedules.context.manageInSettings')}
                      </Link>
                    </div>
                    <div className={styles.notifyGrid}>
                      {(
                        [
                          ['workbench', 'schedules.context.notifyWorkbench'],
                          ['desktop', 'schedules.context.notifyDesktop'],
                          ['dingtalk', 'schedules.context.notifyDingTalk'],
                          ['email', 'schedules.context.notifyEmail'],
                        ] as const
                      ).map(([key, labelKey]) => {
                        const available = channelAvail[key]
                        return (
                          <label
                            key={key}
                            className={`${styles.notifyCard} ${!available ? styles.notifyCardOff : ''} ${
                              available && draft.notify[key] !== false ? styles.notifyCardOn : ''
                            }`}
                            title={available ? undefined : t('schedules.context.channelDisabled')}
                          >
                            <input
                              type="checkbox"
                              disabled={!available}
                              checked={available && draft.notify[key] !== false}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  notify: { ...d.notify, [key]: e.target.checked },
                                }))
                              }
                            />
                            <span>{t(labelKey)}</span>
                          </label>
                        )
                      })}
                    </div>
                  </section>
                </>
              ) : null}
            </div>

            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.ghostBtnPlain}
                onClick={() => setEditorOpen(false)}
              >
                {t('schedules.cancel')}
              </button>
              <button type="button" className={styles.primaryBtn} onClick={() => void saveDraft()}>
                {t('schedules.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
