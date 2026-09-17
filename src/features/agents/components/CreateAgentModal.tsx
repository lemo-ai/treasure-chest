import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { IconClose, IconImage } from '@renderer/shared/ui/icons'
import {
  createAgent,
  deleteAgent,
  updateAgent,
  type AgentTone,
  type CreateAgentInput,
  type AgentDef,
} from '../lib/agentRegistry'
import { isUsableLogoUrl, logoDataUrlFromFile } from '../lib/agentLogo'
import { AgentAvatar } from './AgentAvatar'
import type { FortuneAiProviderConfig } from '@shared'
import {
  decodeChatModelRef,
  encodeChatModelRef,
  groupedChatModels,
} from '@renderer/features/workbench/lib/chatModelOptions'
import styles from './CreateAgentModal.module.css'

const TONES: AgentTone[] = ['brand', 'accent', 'highlight']

interface CreateAgentModalProps {
  onClose: () => void
  onCreated?: (agent: AgentDef) => void
  onUpdated?: (agent: AgentDef) => void
  onDeleted?: (agentId: string) => void
  /** When set, modal edits this agent instead of creating. */
  editing?: AgentDef | null
}

export function CreateAgentModal({
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
  editing = null,
}: CreateAgentModalProps): React.JSX.Element {
  const { t } = useTranslation()
  const isEdit = Boolean(editing)
  const isBuiltinEdit = Boolean(editing?.builtin)
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [systemPrompt, setSystemPrompt] = useState(editing?.systemPrompt ?? '')
  const [tone, setTone] = useState<AgentTone>(editing?.tone ?? 'brand')
  const [preferredModel, setPreferredModel] = useState(() => {
    const raw = editing?.preferredModel ?? ''
    if (!raw) return ''
    if (decodeChatModelRef(raw)) return raw
    return raw
  })
  const [logoUrl, setLogoUrl] = useState(editing?.logoUrl ?? '')
  const [logoBusy, setLogoBusy] = useState(false)
  const [quickPrompts, setQuickPrompts] = useState<string[]>(() => {
    const existing = editing?.quickPrompts?.filter(Boolean) ?? []
    return existing.length ? existing : ['']
  })
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
  const logoInputRef = useRef<HTMLInputElement>(null)

  const previewAgent: AgentDef = {
    id: editing?.id ?? 'custom_preview',
    name: name || 'preview',
    description: description || '',
    tone,
    systemPrompt: '',
    builtin: Boolean(editing?.builtin),
    createdAt: editing?.createdAt ?? '',
    updatedAt: editing?.updatedAt ?? '',
    logoUrl: isUsableLogoUrl(logoUrl) ? logoUrl.trim() : undefined,
  }

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

  const onPickLogo = async (file: File | undefined): Promise<void> => {
    if (!file) return
    setLogoBusy(true)
    setError(null)
    try {
      const dataUrl = await logoDataUrlFromFile(file)
      setLogoUrl(dataUrl)
    } catch (err) {
      const code = err instanceof Error ? err.message : String(err)
      if (code === 'too_large') setError(t('agents.create.logoTooLarge'))
      else if (code === 'not_image') setError(t('agents.create.logoInvalid'))
      else setError(t('agents.create.logoFailed'))
    } finally {
      setLogoBusy(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    setError(null)
    if (isBuiltinEdit && editing) {
      const agent = updateAgent(String(editing.id), { logoUrl })
      if (!agent) {
        setError(t('agents.create.failed'))
        return
      }
      onUpdated?.(agent)
      return
    }
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
      logoUrl,
      quickPrompts,
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
              {isBuiltinEdit
                ? t('agents.edit.logoTitle')
                : isEdit
                  ? t('agents.edit.title')
                  : t('agents.create.title')}
            </h2>
            <p className={styles.sub}>
              {isBuiltinEdit
                ? t('agents.edit.logoSubtitle')
                : isEdit
                  ? t('agents.edit.subtitle')
                  : t('agents.create.subtitle')}
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
          <div className={styles.logoField}>
            <span className={styles.logoLabel}>{t('agents.create.logo')}</span>
            <div className={styles.logoRow}>
              <AgentAvatar agent={previewAgent} size="lg" fallback="sparkles" className={styles.logoPreview} />
              <div className={styles.logoActions}>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hidden
                  onChange={(e) => void onPickLogo(e.target.files?.[0])}
                />
                <button
                  type="button"
                  className={styles.logoBtn}
                  disabled={logoBusy}
                  onClick={() => logoInputRef.current?.click()}
                >
                  <IconImage />
                  {logoBusy ? t('agents.create.logoUploading') : t('agents.create.logoUpload')}
                </button>
                {logoUrl ? (
                  <button
                    type="button"
                    className={styles.logoClear}
                    disabled={logoBusy}
                    onClick={() => setLogoUrl('')}
                  >
                    {isBuiltinEdit ? t('agents.create.logoRestore') : t('agents.create.logoClear')}
                  </button>
                ) : null}
                <p className={styles.hint}>{t('agents.create.logoHint')}</p>
              </div>
            </div>
            <label className={styles.field}>
              <span>{t('agents.create.logoUrl')}</span>
              <input
                value={logoUrl.startsWith('data:') ? '' : logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder={t('agents.create.logoUrlPlaceholder')}
              />
            </label>
          </div>

          {!isBuiltinEdit ? (
            <>
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

              <fieldset className={styles.bindField}>
                <legend>{t('agents.create.quickPrompts')}</legend>
                <p className={styles.hint}>{t('agents.create.quickPromptsHint')}</p>
                <div className={styles.promptList}>
                  {quickPrompts.map((prompt, index) => (
                    <div key={`qp-${index}`} className={styles.promptRow}>
                      <input
                        value={prompt}
                        maxLength={40}
                        placeholder={t('agents.create.quickPromptPlaceholder', { n: index + 1 })}
                        onChange={(e) => {
                          const value = e.target.value
                          setQuickPrompts((prev) => prev.map((p, i) => (i === index ? value : p)))
                        }}
                      />
                      <button
                        type="button"
                        className={styles.promptRemove}
                        disabled={quickPrompts.length <= 1 && !prompt.trim()}
                        aria-label={t('agents.create.quickPromptRemove')}
                        onClick={() => {
                          setQuickPrompts((prev) => {
                            if (prev.length <= 1) return ['']
                            return prev.filter((_, i) => i !== index)
                          })
                        }}
                      >
                        <IconClose />
                      </button>
                    </div>
                  ))}
                </div>
                {quickPrompts.length < 6 ? (
                  <button
                    type="button"
                    className={styles.promptAdd}
                    onClick={() => setQuickPrompts((prev) => [...prev, ''])}
                  >
                    {t('agents.create.quickPromptAdd')}
                  </button>
                ) : null}
              </fieldset>

              <label className={styles.field}>
                <span>{t('agents.create.model')}</span>
                <select
                  value={(() => {
                    if (!preferredModel) return ''
                    if (decodeChatModelRef(preferredModel)) return preferredModel
                    const group = modelGroups.find((g) => g.models.includes(preferredModel))
                    return group ? encodeChatModelRef(group.id, preferredModel) : ''
                  })()}
                  onChange={(e) => setPreferredModel(e.target.value)}
                >
                  <option value="">{t('agents.create.modelDefault')}</option>
                  {modelGroups.map((group) => (
                    <optgroup key={group.id} label={group.name}>
                      {group.models.map((m) => (
                        <option key={`${group.id}::${m}`} value={encodeChatModelRef(group.id, m)}>
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
            </>
          ) : null}

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.actions}>
            {isEdit && !isBuiltinEdit && editing ? (
              <button
                type="button"
                className={styles.danger}
                onClick={() => {
                  if (!window.confirm(t('agents.delete.confirm'))) return
                  const id = String(editing.id)
                  if (!deleteAgent(id)) {
                    setError(t('agents.delete.failed'))
                    return
                  }
                  onDeleted?.(id)
                  onClose()
                }}
              >
                {t('agents.delete.action')}
              </button>
            ) : null}
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
