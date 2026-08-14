import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { SessionEvent } from '@shared'
import styles from './StepTimelinePanel.module.css'

const TIMELINE_TYPES = new Set<SessionEvent['type']>([
  'turn/start',
  'turn/end',
  'step/start',
  'step/end',
  'tool/call',
  'tool/result',
  'subagent/start',
  'subagent/end',
])

interface StepTimelinePanelProps {
  events: SessionEvent[]
}

function eventLabel(type: SessionEvent['type'], t: (k: string) => string): string {
  const key = `workbench.trajectory.type.${type.replace(/\//g, '_')}`
  const translated = t(key)
  return translated === key ? type : translated
}

function eventDetail(ev: SessionEvent): string {
  const p = ev.payload as unknown as Record<string, unknown>
  switch (ev.type) {
    case 'turn/start':
    case 'turn/end':
      return `#${String(p.turnIndex ?? '')}`
    case 'step/start':
    case 'step/end':
      return `t${String(p.turnIndex ?? '')}/s${String(p.stepIndex ?? '')}`
    case 'tool/call':
      return String(p.name ?? '')
    case 'tool/result':
      return `${String(p.name ?? '')} (${String(p.status ?? 'done')})`
    case 'subagent/start':
      return String(p.task ?? '').slice(0, 60)
    case 'subagent/end':
      return String(p.status ?? '')
    default:
      return ''
  }
}

function eventTone(type: SessionEvent['type']): string {
  if (type === 'tool/call' || type === 'step/start' || type === 'turn/start' || type === 'subagent/start') {
    return styles.itemActive
  }
  if (type === 'tool/result') return styles.itemDone
  if (type.endsWith('/end')) return styles.itemDone
  return styles.itemNeutral
}

export function StepTimelinePanel({ events }: StepTimelinePanelProps): ReactNode {
  const { t } = useTranslation()
  const items = useMemo(
    () =>
      [...events]
        .filter((ev) => TIMELINE_TYPES.has(ev.type))
        .sort((a, b) => a.seq - b.seq),
    [events],
  )

  if (!items.length) return null

  return (
    <div className={styles.wrap} aria-label={t('workbench.stepTimeline')}>
      <div className={styles.head}>{t('workbench.stepTimeline')}</div>
      <ol className={styles.list}>
        {items.map((ev) => (
          <li key={ev.id} className={`${styles.item} ${eventTone(ev.type)}`}>
            <span className={styles.type}>{eventLabel(ev.type, t)}</span>
            <span className={styles.detail}>{eventDetail(ev)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
