import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { MemoryFact } from '../lib/agentMemoryStore'
import {
  addMemoryFact,
  deleteMemoryFact,
  hydrateMemory,
  listMemoryFacts,
  memoryAgentScope,
  memoryProjectScope,
  setMemoryInjectEnabled,
  getMemoryInjectEnabled,
  updateMemoryFact,
} from '../lib/agentMemoryStore'
import { PanelBodyState } from '@renderer/shared/ui/PanelBodyState'
import styles from './MemoryPanel.module.css'

interface MemoryPanelProps {
  open: boolean
  agentId: string
  agentName: string
  projectId?: string | null
  projectName?: string
  onClose: () => void
}

export function MemoryPanel({
  open,
  agentId,
  agentName,
  projectId,
  projectName,
  onClose,
}: MemoryPanelProps): ReactNode {
  const { t } = useTranslation()
  const [facts, setFacts] = useState<MemoryFact[]>([])
  const [draft, setDraft] = useState('')
  const [scope, setScope] = useState<'global' | 'agent' | 'project'>('global')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [injectEnabled, setInject] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      await hydrateMemory({ agentId, projectId: projectId || undefined })
      setFacts(listMemoryFacts(agentId, projectId || undefined))
      setInject(getMemoryInjectEnabled())
    } catch {
      setError(t('workbench.memoryLoadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void refresh()
  }, [open, agentId, projectId])

  useEffect(() => {
    if (!projectId && scope === 'project') setScope('global')
  }, [projectId, scope])

  if (!open) return null

  const scopeLabel = (s: string): string => {
    if (s === 'global') return t('workbench.memoryScopeGlobal')
    if (s.startsWith('agent:')) return t('workbench.memoryScopeAgent')
    if (s.startsWith('project:')) return t('workbench.memoryScopeProject')
    return s
  }

  return (
    <aside className={styles.panel} aria-label={t('workbench.memory')}>
      <div className={styles.head}>
        <div>
          <strong>{t('workbench.memory')}</strong>
          <p className={styles.sub}>
            {projectName
              ? t('workbench.memorySubProject', { agent: agentName, project: projectName })
              : t('workbench.memorySub', { agent: agentName })}
          </p>
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

      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={injectEnabled}
          onChange={(e) => {
            const next = e.target.checked
            setInject(next)
            void setMemoryInjectEnabled(next)
          }}
        />
        <span>{t('workbench.memoryInject')}</span>
      </label>

      <form
        className={styles.addRow}
        onSubmit={(e) => {
          e.preventDefault()
          const targetScope =
            scope === 'agent'
              ? memoryAgentScope(agentId)
              : scope === 'project' && projectId
                ? memoryProjectScope(projectId)
                : 'global'
          void addMemoryFact(draft, targetScope)
            .then(() => {
              setDraft('')
              setError('')
              return refresh()
            })
            .catch(() => {
              setError(t('workbench.memorySaveError'))
            })
        }}
      >
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as typeof scope)}
          aria-label={t('workbench.memoryScope')}
        >
          <option value="global">{t('workbench.memoryScopeGlobal')}</option>
          <option value="agent">{t('workbench.memoryScopeAgent')}</option>
          {projectId ? <option value="project">{t('workbench.memoryScopeProject')}</option> : null}
        </select>
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

      {error && facts.length > 0 ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      <PanelBodyState
        status={
          error && facts.length === 0
            ? 'error'
            : loading && facts.length === 0
              ? 'loading'
              : facts.length === 0
                ? 'empty'
                : 'ready'
        }
        loadingLabel={t('workbench.memoryLoading')}
        emptyLabel={t('workbench.memoryEmpty')}
        errorLabel={error || t('workbench.memoryLoadError')}
        className={styles.empty}
      >
        <ul className={styles.list}>
          {facts.map((fact) => (
            <li key={fact.id} className={styles.item}>
              {editingId === fact.id ? (
                <form
                  className={styles.editRow}
                  onSubmit={(e) => {
                    e.preventDefault()
                    void updateMemoryFact(fact.id, editDraft)
                      .then(() => {
                        setEditingId(null)
                        setError('')
                        return refresh()
                      })
                      .catch(() => setError(t('workbench.memorySaveError')))
                  }}
                >
                  <input
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    maxLength={280}
                    autoFocus
                  />
                  <button type="submit">{t('workbench.memorySave')}</button>
                  <button type="button" onClick={() => setEditingId(null)}>
                    {t('workbench.memoryCancel')}
                  </button>
                </form>
              ) : (
                <>
                  <div className={styles.itemBody}>
                    <span className={styles.scopeTag}>{scopeLabel(fact.scope)}</span>
                    <span>{fact.content}</span>
                  </div>
                  <span className={styles.itemActions}>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title={t('workbench.memoryEdit')}
                      onClick={() => {
                        setEditingId(fact.id)
                        setEditDraft(fact.content)
                      }}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title={t('workbench.memoryForget')}
                      onClick={() => {
                        void deleteMemoryFact(fact.id)
                          .then(() => refresh())
                          .catch(() => setError(t('workbench.memorySaveError')))
                      }}
                    >
                      ×
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      </PanelBodyState>
    </aside>
  )
}
