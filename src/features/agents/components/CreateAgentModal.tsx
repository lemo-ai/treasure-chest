import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { IconClose } from '@renderer/shared/ui/icons'
import {
  createAgent,
  updateAgent,
  type AgentTone,
  type CreateAgentInput,
  type AgentDef,
} from '../lib/agentRegistry'
import type { FortuneAiProviderConfig } from '@shared'
import { groupedChatModels } from '@renderer/features/workbench/lib/chatModelOptions'
import styles from './CreateAgentModal.module.css'

const TONES: AgentTone[] = ['brand', 'accent', 'highlight']

interface CreateAgentModalProps {
  onClose: () => void
  onCreated?: (agent: AgentDef) => void
  onUpdated?: (agent: AgentDef) => void
  /** When set, modal edits this custom agent instead of creating. */
  editing?: AgentDef | null
}

export function CreateAgentModal({
  onClose,
  onCreated,
  onUpdated,
  editing = null,
}: CreateAgentModalProps): React.JSX.Element {
  const { t } = useTranslation()
  const isEdit = Boolean(editing && !editing.builtin)
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [systemPrompt, setSystemPrompt] = useState(editing?.systemPrompt ?? '')
  const [tone, setTone] = useState<AgentTone>(editing?.tone ?? 'brand')
  const [preferredModel, setPreferredModel] = useState(editing?.preferredModel ?? '')
  const [alwaysUseKnowledge, setAlwaysUseKnowledge] = useState(
    Boolean(editing?.alwaysUseKnowledge),
  )
  const [enableCodingTools, setEnableCodingTools] = useState(editing?.enableCodingTools !== false)
  const [enablePluginTools, setEnablePluginTools] = useState(editing?.enablePluginTools !== false)
  const [enableSpawnSubagent, setEnableSpawnSubagent] = useState(editing?.enableSpawnSubagent !== false)
  const [mcpServerIds, setMcpServerIds] = useState<string[]>(editing?.enabledMcpServerIds ?? [])
  const [collectionIds, setCollectionIds] = useState<string[]>(
    editing?.knowledgeCollectionIds ?? [],
  )
  const [modelGroups, setModelGroups] = useState<Array<{ id: string; name: string; models: string[] }>>(
    [],
  )
  const [mcpServers, setMcpServers] = useState<Array<{ id: string; name: string; enabled: boolean }>>(
    [],
  )
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const snap = await window.treasureChest.getSettingsSnapshot()
        const fortune = snap.fortune as { aiProviders?: FortuneAiProviderConfig[] } | undefined
        const groups = groupedChatModels(fortune?.aiProviders)
        setModelGroups(groups)
      } catch {
        setModelGroups([])
      }
      try {
        const status = await window.treasureChest.refreshMcpStatus()
        setMcpServers(
          status.servers.map((s) => ({ id: s.id, name: s.name, enabled: s.enabled })),
        )
      } catch {
        setMcpServers([])
      }
      try {
        const cols = await window.treasureChest.listKnowledgeCollections()
        setCollections(cols.map((c) => ({ id: c.id, name: c.name })))
      } catch {
        setCollections([])
      }
    })()
  }, [])

  const toggleId = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    setError(null)
    const input: CreateAgentInput = {
      name,
      description,
      systemPrompt,
      tone,
      preferredModel,
      enabledMcpServerIds: mcpServerIds,
      knowledgeCollectionIds: collectionIds,
      alwaysUseKnowledge,
      enableCodingTools,
      enablePluginTools,
      enableSpawnSubagent,
    }
    if (!input.name.trim()) {
      setError(t('agents.create.nameRequired'))
      return
    }
    try {
      if (isEdit && editing) {
        const agent = updateAgent(String(editing.id), input)
        if (!agent) {
          setError(t('agents.create.failed'))
          return
        }
        onUpdated?.(agent)
      } else {
        const agent = createAgent(input)
        onCreated?.(agent)
      }
    } catch {
      setError(t('agents.create.failed'))
    }
  }

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-agent-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <div>
            <h2 id="create-agent-title" className={styles.title}>
              {isEdit ? t('agents.edit.title') : t('agents.create.title')}
            </h2>
            <p className={styles.sub}>
              {isEdit ? t('agents.edit.subtitle') : t('agents.create.subtitle')}
            </p>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={t('agents.create.cancel')}
          >
            <IconClose />
          </button>
        </header>

        <form className={styles.form} onSubmit={onSubmit}>
          <label className={styles.field}>
            <span>{t('agents.create.name')}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('agents.create.namePlaceholder')}
              maxLength={40}
              autoFocus
            />
          </label>

          <label className={styles.field}>
            <span>{t('agents.create.description')}</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('agents.create.descPlaceholder')}
              maxLength={80}
            />
          </label>

          <label className={styles.field}>
            <span>{t('agents.create.prompt')}</span>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t('agents.create.promptPlaceholder')}
              rows={5}
            />
          </label>

          <label className={styles.field}>
            <span>{t('agents.create.model')}</span>
            <select
              value={preferredModel}
              onChange={(e) => setPreferredModel(e.target.value)}
            >
              <option value="">{t('agents.create.modelDefault')}</option>
              {modelGroups.map((group) => (
                <optgroup key={group.id} label={group.name}>
                  {group.models.map((m) => (
                    <option key={`${group.id}::${m}`} value={m}>
                      {m}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className={styles.hint}>{t('agents.create.modelHint')}</span>
          </label>

          <fieldset className={styles.toneField}>
            <legend>{t('agents.create.tone')}</legend>
            <div className={styles.tones}>
              {TONES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`${styles.toneBtn} ${styles[`tone_${item}`]} ${
                    tone === item ? styles.toneActive : ''
                  }`}
                  onClick={() => setTone(item)}
                  aria-pressed={tone === item}
                >
                  {t(`agents.create.tone.${item}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={alwaysUseKnowledge}
              onChange={(e) => setAlwaysUseKnowledge(e.target.checked)}
            />
            <span>{t('agents.create.alwaysKnowledge')}</span>
          </label>

          <fieldset className={styles.bindField}>
            <legend>{t('agents.create.tools')}</legend>
            <p className={styles.hint}>{t('agents.create.toolsHint')}</p>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={enableCodingTools}
                onChange={(e) => setEnableCodingTools(e.target.checked)}
              />
              <span>{t('agents.create.enableCoding')}</span>
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={enablePluginTools}
                onChange={(e) => setEnablePluginTools(e.target.checked)}
              />
              <span>{t('agents.create.enablePlugins')}</span>
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={enableSpawnSubagent}
                onChange={(e) => setEnableSpawnSubagent(e.target.checked)}
              />
              <span>{t('agents.create.enableSubagent')}</span>
            </label>
          </fieldset>

          <fieldset className={styles.bindField}>
            <legend>{t('agents.create.knowledge')}</legend>
            <p className={styles.hint}>{t('agents.create.knowledgeHint')}</p>
            {collections.length === 0 ? (
              <p className={styles.emptyBind}>{t('agents.create.knowledgeEmpty')}</p>
            ) : (
              <div className={styles.chipRow}>
                {collections.map((col) => {
                  const on = collectionIds.includes(col.id)
                  return (
                    <button
                      key={col.id}
                      type="button"
                      className={`${styles.bindChip} ${on ? styles.bindChipOn : ''}`}
                      aria-pressed={on}
                      onClick={() => setCollectionIds((prev) => toggleId(prev, col.id))}
                    >
                      {col.name}
                    </button>
                  )
                })}
              </div>
            )}
          </fieldset>

          <fieldset className={styles.bindField}>
            <legend>{t('agents.create.mcp')}</legend>
            <p className={styles.hint}>{t('agents.create.mcpHint')}</p>
            {mcpServers.length === 0 ? (
              <p className={styles.emptyBind}>{t('agents.create.mcpEmpty')}</p>
            ) : (
              <div className={styles.chipRow}>
                {mcpServers.map((server) => {
                  const on = mcpServerIds.includes(server.id)
                  return (
                    <button
                      key={server.id}
                      type="button"
                      className={`${styles.bindChip} ${on ? styles.bindChipOn : ''}`}
                      aria-pressed={on}
                      title={server.enabled ? undefined : t('agents.create.mcpDisabled')}
                      onClick={() => setMcpServerIds((prev) => toggleId(prev, server.id))}
                    >
                      {server.name}
                      {!server.enabled ? ' · off' : ''}
                    </button>
                  )
                })}
              </div>
            )}
          </fieldset>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onClose}>
              {t('agents.create.cancel')}
            </button>
            <button type="submit" className={styles.primary}>
              {isEdit ? t('agents.edit.submit') : t('agents.create.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
