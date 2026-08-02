import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addMemoryFact,
  deleteMemoryFact,
  listMemoryFacts,
  type AgentMemoryFact,
} from '../lib/agentMemoryStore'
import styles from './MemoryPanel.module.css'

interface MemoryPanelProps {
  open: boolean
  agentId: string
  agentName: string
  onClose: () => void
}

export function MemoryPanel({ open, agentId, agentName, onClose }: MemoryPanelProps): ReactNode {
  const { t } = useTranslation()
  const [facts, setFacts] = useState<AgentMemoryFact[]>([])
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (open) setFacts(listMemoryFacts(agentId))
  }, [open, agentId])

  if (!open) return null

  const refresh = (): void => setFacts(listMemoryFacts(agentId))

  return (
    <aside className={styles.panel} aria-label={t('workbench.memory')}>
      <div className={styles.head}>
        <div>
          <strong>{t('workbench.memory')}</strong>
          <p className={styles.sub}>{t('workbench.memorySub', { agent: agentName })}</p>
        </div>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={onClose}
          title={t('workbench.memoryClose')}
        >
          ×
        </button>
      </div>
      <form
        className={styles.addRow}
        onSubmit={(e) => {
          e.preventDefault()
          try {
            addMemoryFact(agentId, draft)
            setDraft('')
            refresh()
          } catch {
            /* empty */
          }
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('workbench.memoryPlaceholder')}
          maxLength={280}
        />
        <button type="submit" disabled={!draft.trim()}>
          {t('workbench.memoryAdd')}
        </button>
      </form>
      {facts.length === 0 ? (
        <p className={styles.empty}>{t('workbench.memoryEmpty')}</p>
      ) : (
        <ul className={styles.list}>
          {facts.map((fact) => (
            <li key={fact.id} className={styles.item}>
              <span>{fact.content}</span>
              <button
                type="button"
                className={styles.iconBtn}
                title={t('workbench.memoryDelete')}
                onClick={() => {
                  deleteMemoryFact(fact.id)
                  refresh()
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
