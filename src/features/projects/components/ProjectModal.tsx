import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project, UpsertProjectInput } from '@shared'
import { listAgents, agentDisplayName, type AgentDef } from '@renderer/features/agents/lib/agentRegistry'
import { pickProjectWorkDir, upsertProject } from '../lib/projectStore'
import styles from './ProjectModal.module.css'

interface ProjectModalProps {
  open: boolean
  project?: Project | null
  onClose: () => void
  onSaved: (project: Project) => void
}

export function ProjectModal({ open, project, onClose, onSaved }: ProjectModalProps): ReactNode {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [workDir, setWorkDir] = useState('')
  const [defaultAgentId, setDefaultAgentId] = useState('')
  const [rulesPath, setRulesPath] = useState('')
  const [collectionIds, setCollectionIds] = useState<string[]>([])
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([])
  const [agents, setAgents] = useState<AgentDef[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setAgents(listAgents())
    setName(project?.name ?? '')
    setWorkDir(project?.workDir ?? '')
    setDefaultAgentId(project?.defaultAgentId ?? '')
    setRulesPath(project?.rulesPath ?? '')
    setCollectionIds(project?.knowledgeCollectionIds ?? [])
    setError('')
    void window.treasureChest
      .listKnowledgeCollections()
      .then((cols) => setCollections(cols.map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => setCollections([]))
  }, [open, project])

  if (!open) return null

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('projects.errorName'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const input: UpsertProjectInput = {
        id: project?.id,
        name: trimmed,
        workDir: workDir.trim(),
        defaultAgentId: defaultAgentId.trim() || null,
        rulesPath: rulesPath.trim() || null,
        knowledgeCollectionIds: collectionIds,
        skillIds: project?.skillIds,
        mcpServerIds: project?.mcpServerIds,
        dataSourceIds: project?.dataSourceIds,
      }
      const saved = await upsertProject(input)
      onSaved(saved)
      onClose()
    } catch {
      setError(t('projects.errorSave'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal
        aria-label={project ? t('projects.editTitle') : t('projects.createTitle')}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <h2>{project ? t('projects.editTitle') : t('projects.createTitle')}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t('projects.close')}>
            ×
          </button>
        </header>
        <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
          <label className={styles.field}>
            <span>{t('projects.fieldName')}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder={t('projects.namePlaceholder')}
              autoFocus
            />
          </label>
          <label className={styles.field}>
            <span>{t('projects.fieldWorkDir')}</span>
            <div className={styles.row}>
              <input
                value={workDir}
                onChange={(e) => setWorkDir(e.target.value)}
                placeholder={t('projects.workDirPlaceholder')}
              />
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  void pickProjectWorkDir().then((p) => {
                    if (p) setWorkDir(p)
                  })
                }}
              >
                {t('projects.pickDir')}
              </button>
            </div>
          </label>
          <label className={styles.field}>
            <span>{t('projects.fieldDefaultAgent')}</span>
            <select value={defaultAgentId} onChange={(e) => setDefaultAgentId(e.target.value)}>
              <option value="">{t('projects.agentNone')}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {agentDisplayName(a, t)}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.field}>
            <span>{t('projects.fieldKnowledge')}</span>
            {collections.length === 0 ? (
              <p className={styles.hint}>{t('projects.knowledgeEmpty')}</p>
            ) : (
              <div className={styles.chips}>
                {collections.map((col) => {
                  const on = collectionIds.includes(col.id)
                  return (
                    <button
                      key={col.id}
                      type="button"
                      className={on ? `${styles.chip} ${styles.chipOn}` : styles.chip}
                      onClick={() =>
                        setCollectionIds((prev) =>
                          on ? prev.filter((id) => id !== col.id) : [...prev, col.id],
                        )
                      }
                    >
                      {col.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <label className={styles.field}>
            <span>{t('projects.fieldRules')}</span>
            <input
              value={rulesPath}
              onChange={(e) => setRulesPath(e.target.value)}
              placeholder={t('projects.rulesPlaceholder')}
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <footer className={styles.foot}>
            <button type="button" className={styles.secondary} onClick={onClose}>
              {t('projects.cancel')}
            </button>
            <button type="submit" className={styles.primary} disabled={saving}>
              {saving ? t('projects.saving') : t('projects.save')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
