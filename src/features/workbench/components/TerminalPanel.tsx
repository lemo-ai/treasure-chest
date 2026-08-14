import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { SessionEvent } from '@shared'
import { PtyTerminal } from './PtyTerminal'
import { DiagnosticsPanel } from './DiagnosticsPanel'
import { DshWebPanel } from './DshWebPanel'
import styles from './TerminalPanel.module.css'

interface TerminalPanelProps {
  open: boolean
  sessionId: string | null
  refreshKey?: number
  liveEvents?: SessionEvent[]
  onClose: () => void
}

type TerminalTab = 'agent' | 'interactive' | 'diagnostics' | 'dsh'

interface TerminalEntry {
  id: string
  command: string
  cwd?: string
  stdout: string
  stderr: string
  status: 'running' | 'done' | 'error'
  exitCode?: number | null
}

function parseShellArgs(raw: string): { command?: string; cwd?: string } {
  try {
    return JSON.parse(raw || '{}') as { command?: string; cwd?: string }
  } catch {
    return {}
  }
}

function deriveTerminalEntries(events: SessionEvent[]): TerminalEntry[] {
  const byId = new Map<string, TerminalEntry>()
  const order: string[] = []

  for (const ev of events) {
    if (ev.type === 'tool/call') {
      const p = ev.payload as { id: string; name: string; arguments: string }
      if (p.name !== 'run_shell' && p.name !== 'run_shell_background') continue
      const args = parseShellArgs(p.arguments)
      byId.set(p.id, {
        id: p.id,
        command: String(args.command || p.arguments).trim(),
        cwd: args.cwd,
        stdout: '',
        stderr: '',
        status: 'running',
      })
      order.push(p.id)
      continue
    }
    if (ev.type === 'shell/chunk') {
      const p = ev.payload as { toolCallId: string; stream: 'stdout' | 'stderr'; delta: string }
      const entry = byId.get(p.toolCallId)
      if (!entry) continue
      if (p.stream === 'stderr') entry.stderr += p.delta
      else entry.stdout += p.delta
      continue
    }
    if (ev.type === 'tool/result') {
      const p = ev.payload as { id: string; name: string; content: string; status: string }
      if (p.name !== 'run_shell' && p.name !== 'run_shell_background') continue
      const entry = byId.get(p.id)
      if (!entry) continue
      entry.status = p.status === 'done' ? 'done' : 'error'
      try {
        const parsed = JSON.parse(p.content) as {
          exitCode?: number | null
          stdout?: string
          stderr?: string
          jobId?: string
        }
        if (!entry.stdout && parsed.stdout) entry.stdout = parsed.stdout
        if (!entry.stderr && parsed.stderr) entry.stderr = parsed.stderr
        if (parsed.exitCode !== undefined) entry.exitCode = parsed.exitCode
        if (parsed.jobId) entry.command = `${entry.command}  [job ${parsed.jobId}]`
      } catch {
        /* keep streamed output */
      }
    }
  }

  return order.map((id) => byId.get(id)!).filter(Boolean)
}

export function TerminalPanel({ open, sessionId, refreshKey, liveEvents = [], onClose }: TerminalPanelProps): ReactNode {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TerminalTab>('agent')
  const [events, setEvents] = useState<SessionEvent[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !sessionId || tab !== 'agent') return
    void window.treasureChest.harnessListEvents(sessionId).then(setEvents)
  }, [open, sessionId, refreshKey, tab])

  const mergedEvents = useMemo(() => {
    const byId = new Map<string, SessionEvent>()
    for (const ev of events) byId.set(ev.id, ev)
    for (const ev of liveEvents) byId.set(ev.id, ev)
    return [...byId.values()].sort((a, b) => a.seq - b.seq)
  }, [events, liveEvents])

  const entries = useMemo(() => deriveTerminalEntries(mergedEvents), [mergedEvents])

  useEffect(() => {
    if (!open || tab !== 'agent') return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [open, tab, entries.length, entries.at(-1)?.stdout.length, entries.at(-1)?.stderr.length])

  if (!open) return null

  return (
    <aside className={styles.panel} aria-label={t('workbench.terminal')}>
      <div className={styles.head}>
        <div>
          <strong>{t('workbench.terminal')}</strong>
          <p className={styles.sub}>{t('workbench.terminalSub')}</p>
        </div>
        <button type="button" className={styles.iconBtn} onClick={onClose} title={t('workbench.terminalClose')}>
          ×
        </button>
      </div>
      <div className={styles.tabs}>
        <button
          type="button"
          className={tab === 'agent' ? styles.tabActive : styles.tab}
          onClick={() => setTab('agent')}
        >
          {t('workbench.terminalTabAgent')}
        </button>
        <button
          type="button"
          className={tab === 'interactive' ? styles.tabActive : styles.tab}
          onClick={() => setTab('interactive')}
        >
          {t('workbench.terminalTabInteractive')}
        </button>
        <button
          type="button"
          className={tab === 'diagnostics' ? styles.tabActive : styles.tab}
          onClick={() => setTab('diagnostics')}
        >
          {t('workbench.terminalTabDiagnostics')}
        </button>
        <button
          type="button"
          className={tab === 'dsh' ? styles.tabActive : styles.tab}
          onClick={() => setTab('dsh')}
        >
          {t('workbench.terminalTabDsh')}
        </button>
      </div>
      <div className={styles.body}>
        {tab === 'agent' ? (
          entries.length === 0 ? (
            <p className={styles.empty}>{t('workbench.terminalEmpty')}</p>
          ) : (
            entries.map((entry) => (
              <section key={entry.id} className={styles.block} data-status={entry.status}>
                <div className={styles.prompt}>
                  <span className={styles.promptMark}>$</span>
                  <code>{entry.command}</code>
                  {entry.cwd ? <span className={styles.cwd}>{entry.cwd}</span> : null}
                  {entry.status === 'running' ? (
                    <span className={styles.badge}>{t('workbench.terminalRunning')}</span>
                  ) : entry.exitCode != null ? (
                    <span className={styles.badge} data-exit={entry.exitCode === 0 ? 'ok' : 'err'}>
                      exit {entry.exitCode}
                    </span>
                  ) : null}
                </div>
                {entry.stdout ? <pre className={styles.out}>{entry.stdout}</pre> : null}
                {entry.stderr ? <pre className={`${styles.out} ${styles.err}`}>{entry.stderr}</pre> : null}
              </section>
            ))
          )
        ) : null}
        {tab === 'interactive' ? <PtyTerminal /> : null}
        <DiagnosticsPanel active={tab === 'diagnostics'} refreshKey={refreshKey} />
        <DshWebPanel active={tab === 'dsh'} />
        {tab === 'agent' ? <div ref={bottomRef} /> : null}
      </div>
    </aside>
  )
}
