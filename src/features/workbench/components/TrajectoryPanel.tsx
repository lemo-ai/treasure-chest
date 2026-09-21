import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentGoal, SessionEvent } from '@shared'
import styles from './TrajectoryPanel.module.css'

interface TrajectoryPanelProps {
  open: boolean
  sessionId: string | null
  refreshKey?: number
  liveEvents?: SessionEvent[]
  onOpenChildSession?: (childSessionId: string) => void
  onForkAtSeq?: (boundarySeq: number) => void
  onClose: () => void
}

function eventLabel(type: SessionEvent['type'], t: (k: string) => string): string {
  const key = `workbench.trajectory.type.${type.replace(/\//g, '_')}`
  const translated = t(key)
  return translated === key ? type : translated
}

function eventDetail(ev: SessionEvent): string {
  const p = ev.payload as unknown as Record<string, unknown>
  switch (ev.type) {
    case 'user/message':
      return String(p.content ?? '').slice(0, 120)
    case 'assistant/message':
      return String(p.content ?? '').slice(0, 120)
    case 'tool/call':
      return `${String(p.name ?? '')} ${String(p.arguments ?? '').slice(0, 80)}`
    case 'tool/result':
      return `${String(p.name ?? '')} → ${String(p.content ?? '').slice(0, 80)}`
    case 'turn/start':
      return `#${String(p.turnIndex ?? '')}`
    case 'step/start':
      return `t${String(p.turnIndex ?? '')}/s${String(p.stepIndex ?? '')}`
    case 'subagent/start':
      return String(p.task ?? '').slice(0, 100)
    case 'subagent/end':
      return String(p.resultPreview ?? p.status ?? '')
    case 'goal/set':
      return String(p.title ?? '')
    case 'goal/update':
      return `${String(p.goalId ?? '')} → ${String(p.status ?? '')}`
    case 'compaction/summary':
      return String(p.summary ?? '').slice(0, 100)
    case 'assistant/chunk':
      return String(p.delta ?? '').slice(0, 100)
    case 'system/inject':
      return `${String(p.section ?? '')}: ${String(p.content ?? '').slice(0, 80)}`
    case 'shell/chunk':
      return `${String(p.stream ?? 'out')}: ${String(p.delta ?? '').slice(0, 80)}`
    default:
      return JSON.stringify(p).slice(0, 100)
  }
}

function fullPayloadText(ev: SessionEvent): string {
  const p = ev.payload as unknown as Record<string, unknown>
  if (ev.type === 'tool/result' && typeof p.content === 'string') return p.content
  if (ev.type === 'tool/call' && typeof p.arguments === 'string') {
    return `${String(p.name ?? '')}\n${p.arguments}`
  }
  try {
    return JSON.stringify(p, null, 2)
  } catch {
    return String(p)
  }
}

function mergeEvents(base: SessionEvent[], live: SessionEvent[]): SessionEvent[] {
  const byId = new Map<string, SessionEvent>()
  for (const ev of base) byId.set(ev.id, ev)
  for (const ev of live) byId.set(ev.id, ev)
  return [...byId.values()].sort((a, b) => a.seq - b.seq)
}

export function TrajectoryPanel({
  open,
  sessionId,
  refreshKey,
  liveEvents = [],
  onOpenChildSession,
  onForkAtSeq,
  onClose,
}: TrajectoryPanelProps): ReactNode {
  const { t } = useTranslation()
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [goals, setGoals] = useState<AgentGoal[]>([])
  const [plugins, setPlugins] = useState<string[]>([])
  const [reloading, setReloading] = useState(false)
  const [goalTitle, setGoalTitle] = useState('')
  const [addingGoal, setAddingGoal] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})
  const [copyFlash, setCopyFlash] = useState<string | null>(null)

  const refresh = (): void => {
    if (!sessionId) return
    void window.treasureChest.harnessListEvents(sessionId).then(setEvents)
    void window.treasureChest.harnessListGoals(sessionId, true).then(setGoals)
    void window.treasureChest.harnessListPlugins().then((list) => setPlugins(list.map((p) => p.name)))
  }

  useEffect(() => {
    if (!open || !sessionId) return
    refresh()
  }, [open, sessionId, refreshKey])

  const mergedEvents = useMemo(() => mergeEvents(events, liveEvents), [events, liveEvents])

  const onReloadPlugins = (): void => {
    setReloading(true)
    void window.treasureChest
      .harnessReloadPlugins()
      .then(() => refresh())
      .finally(() => setReloading(false))
  }

  const onAddGoal = (e: FormEvent): void => {
    e.preventDefault()
    if (!sessionId || !goalTitle.trim()) return
    setAddingGoal(true)
    void window.treasureChest
      .harnessSetGoal(sessionId, goalTitle.trim())
      .then(() => {
        setGoalTitle('')
        refresh()
      })
      .finally(() => setAddingGoal(false))
  }

  const toggleExpand = (id: string): void => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const onCopy = async (ev: SessionEvent): Promise<void> => {
    const text = fullPayloadText(ev)
    try {
      await navigator.clipboard.writeText(text)
      setCopyFlash(ev.id)
      window.setTimeout(() => setCopyFlash((cur) => (cur === ev.id ? null : cur)), 1500)
    } catch {
      /* ignore */
    }
  }

  const turns = useMemo(() => {
    const groups: Array<{ turnIndex: number; events: SessionEvent[] }> = []
    let current: SessionEvent[] = []
    let turnIndex = -1
    for (const ev of mergedEvents) {
      if (ev.type === 'turn/start') {
        if (current.length) groups.push({ turnIndex, events: current })
        turnIndex = (ev.payload as { turnIndex: number }).turnIndex
        current = [ev]
      } else if (ev.type === 'turn/end') {
        current.push(ev)
        groups.push({ turnIndex, events: current })
        current = []
      } else {
        current.push(ev)
      }
    }
    if (current.length) groups.push({ turnIndex, events: current })
    return groups
  }, [mergedEvents])

  const orchestration = useMemo(() => {
    const starts = mergedEvents.filter((e) => e.type === 'subagent/start')
    return starts.map((ev) => {
      const p = ev.payload as {
        childSessionId?: string
        task?: string
        agentId?: string
      }
      const end = mergedEvents.find(
        (e) =>
          e.type === 'subagent/end' &&
          (e.payload as { childSessionId?: string }).childSessionId === p.childSessionId,
      )
      const endPayload = end?.payload as { status?: string; resultPreview?: string } | undefined
      return {
        id: ev.id,
        childSessionId: String(p.childSessionId || ''),
        task: String(p.task || ''),
        agentId: String(p.agentId || ''),
        status: endPayload?.status || (end ? 'done' : 'running'),
        preview: String(endPayload?.resultPreview || ''),
      }
    })
  }, [mergedEvents])

  if (!open) return null

  return (
    <aside className={styles.panel} aria-label={t('workbench.trajectory')}>
      <div className={styles.head}>
        <div>
          <strong>{t('workbench.trajectory')}</strong>
          <p className={styles.sub}>{t('workbench.trajectorySub')}</p>
        </div>
        <div className={styles.headActions}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onReloadPlugins}
            disabled={reloading}
            title={t('workbench.trajectoryReloadPlugins')}
          >
            ↻
          </button>
          <button type="button" className={styles.iconBtn} onClick={onClose} title={t('workbench.trajectoryClose')}>
            ×
          </button>
        </div>
      </div>

      <section className={styles.section}>
        <h3>{t('workbench.trajectoryGoals')}</h3>
        {sessionId ? (
          <form className={styles.goalForm} onSubmit={onAddGoal}>
            <input
              className={styles.goalInput}
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              placeholder={t('workbench.trajectoryGoalPlaceholder')}
              disabled={addingGoal}
            />
            <button type="submit" className={styles.goalAddBtn} disabled={addingGoal || !goalTitle.trim()}>
              {t('workbench.trajectoryAddGoal')}
            </button>
          </form>
        ) : null}
        {goals.length > 0 ? (
          <ul className={styles.goalList}>
            {goals.map((g) => (
              <li key={g.id} className={styles.goalItem} data-status={g.status}>
                <span className={styles.goalTitle}>{g.title}</span>
                <span className={styles.goalStatus}>{g.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>{t('workbench.trajectoryGoalsEmpty')}</p>
        )}
      </section>

      {orchestration.length > 0 ? (
        <section className={styles.section}>
          <h3>{t('workbench.orchestration')}</h3>
          <ul className={styles.orchList}>
            {orchestration.map((node) => (
              <li key={node.id} className={styles.orchItem} data-status={node.status}>
                <div className={styles.orchHead}>
                  <strong>{node.agentId || 'subagent'}</strong>
                  <span>{node.status}</span>
                </div>
                <p className={styles.orchTask}>{node.task}</p>
                {node.preview ? <p className={styles.orchPreview}>{node.preview.slice(0, 160)}</p> : null}
                {node.childSessionId && onOpenChildSession ? (
                  <button
                    type="button"
                    className={styles.childBtn}
                    onClick={() => onOpenChildSession(node.childSessionId)}
                  >
                    {t('workbench.trajectoryOpenChild')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plugins.length > 0 ? (
        <p className={styles.plugins}>{t('workbench.trajectoryPlugins', { names: plugins.join(', ') })}</p>
      ) : null}

      <div className={styles.timeline}>
        {turns.length === 0 ? (
          <p className={styles.empty}>{t('workbench.trajectoryEmpty')}</p>
        ) : (
          turns.map((group) => (
            <section key={`turn-${group.turnIndex}-${group.events[0]?.seq ?? 0}`} className={styles.turn}>
              <header className={styles.turnHead}>
                {t('workbench.trajectoryTurn', { index: group.turnIndex })}
              </header>
              <ol className={styles.eventList}>
                {group.events.map((ev) => {
                  const childId =
                    ev.type === 'subagent/start'
                      ? String((ev.payload as { childSessionId?: string }).childSessionId ?? '')
                      : ''
                  const expandable = ev.type === 'tool/call' || ev.type === 'tool/result'
                  const expanded = Boolean(expandedIds[ev.id])
                  return (
                    <li key={ev.id} className={styles.event} data-type={ev.type.replace('/', '-')}>
                      <span className={styles.eventType}>{eventLabel(ev.type, t)}</span>
                      <span className={styles.eventSeq}>#{ev.seq}</span>
                      <span className={styles.eventDetail}>{eventDetail(ev)}</span>
                      <div className={styles.eventActions}>
                        {expandable ? (
                          <button
                            type="button"
                            className={styles.childBtn}
                            onClick={() => toggleExpand(ev.id)}
                          >
                            {expanded
                              ? t('workbench.trajectoryCollapse')
                              : t('workbench.trajectoryExpand')}
                          </button>
                        ) : null}
                        {expandable ? (
                          <button type="button" className={styles.childBtn} onClick={() => void onCopy(ev)}>
                            {copyFlash === ev.id
                              ? t('workbench.trajectoryCopied')
                              : t('workbench.trajectoryCopy')}
                          </button>
                        ) : null}
                        {childId && onOpenChildSession ? (
                          <button
                            type="button"
                            className={styles.childBtn}
                            onClick={() => onOpenChildSession(childId)}
                          >
                            {t('workbench.trajectoryOpenChild')}
                          </button>
                        ) : null}
                        {onForkAtSeq ? (
                          <button
                            type="button"
                            className={styles.childBtn}
                            onClick={() => onForkAtSeq(ev.seq)}
                          >
                            {t('workbench.trajectoryForkHere')}
                          </button>
                        ) : null}
                      </div>
                      {expanded ? (
                        <pre className={styles.eventFull}>{fullPayloadText(ev)}</pre>
                      ) : null}
                    </li>
                  )
                })}
              </ol>
            </section>
          ))
        )}
      </div>
    </aside>
  )
}
