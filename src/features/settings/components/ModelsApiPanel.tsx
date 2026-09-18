import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AiModelConfig,
  FortuneAiProviderConfig,
  MediaProfileId,
} from '@shared'
import {
  AI_PROVIDER_PRESETS,
  DEFAULT_FORTUNE_SETTINGS,
  MEDIA_PROFILE_IDS,
  aiModelIds,
  defaultAiModelConfig,
  firstModelId,
  mediaIdsFromModels,
  modelsFromProviderPreset,
} from '@shared'
import { AddModelModal } from './AddModelModal'
import styles from './ModelsApiPanel.module.css'

interface ModelsApiPanelProps {
  refreshKey?: number
  onOpenLocalLlm?: () => void
}

export function ModelsApiPanel({
  refreshKey = 0,
  onOpenLocalLlm,
}: ModelsApiPanelProps): React.JSX.Element {
  const { t } = useTranslation()
  const [aiProviders, setAiProviders] = useState<FortuneAiProviderConfig[]>(
    DEFAULT_FORTUNE_SETTINGS.aiProviders,
  )
  const [aiActiveProviderId, setAiActiveProviderId] = useState(
    DEFAULT_FORTUNE_SETTINGS.aiActiveProviderId,
  )
  const [aiProviderName, setAiProviderName] = useState(DEFAULT_FORTUNE_SETTINGS.aiProviderName)
  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_FORTUNE_SETTINGS.aiBaseUrl)
  const [aiApiFormat, setAiApiFormat] = useState(DEFAULT_FORTUNE_SETTINGS.aiApiFormat)
  const [aiModel, setAiModel] = useState(DEFAULT_FORTUNE_SETTINGS.aiModel)
  const [aiApiKey, setAiApiKey] = useState(DEFAULT_FORTUNE_SETTINGS.aiApiKey)
  const [aiMediaProfile, setAiMediaProfile] = useState<MediaProfileId>('auto')
  const [modelModal, setModelModal] = useState<AiModelConfig | null | 'new'>(null)
  const [savedHint, setSavedHint] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testHint, setTestHint] = useState<string | null>(null)

  useEffect(() => {
    void window.treasureChest.getSettingsSnapshot().then((snap) => {
      setAiProviders(snap.fortune?.aiProviders ?? DEFAULT_FORTUNE_SETTINGS.aiProviders)
      setAiActiveProviderId(
        snap.fortune?.aiActiveProviderId ?? DEFAULT_FORTUNE_SETTINGS.aiActiveProviderId,
      )
      setAiProviderName(snap.fortune?.aiProviderName ?? DEFAULT_FORTUNE_SETTINGS.aiProviderName)
      setAiBaseUrl(snap.fortune?.aiBaseUrl ?? DEFAULT_FORTUNE_SETTINGS.aiBaseUrl)
      setAiApiFormat(snap.fortune?.aiApiFormat ?? DEFAULT_FORTUNE_SETTINGS.aiApiFormat)
      setAiModel(snap.fortune?.aiModel ?? DEFAULT_FORTUNE_SETTINGS.aiModel)
      setAiApiKey(snap.fortune?.aiApiKey ?? DEFAULT_FORTUNE_SETTINGS.aiApiKey)
      const active =
        (snap.fortune?.aiProviders ?? []).find((p) => p.id === snap.fortune?.aiActiveProviderId) ??
        snap.fortune?.aiProviders?.[0]
      setAiMediaProfile(active?.mediaProfile ?? 'auto')
    })
  }, [refreshKey])

  const onSelectProvider = (id: string): void => {
    const provider = aiProviders.find((p) => p.id === id)
    if (!provider) return
    setAiActiveProviderId(provider.id)
    setAiProviderName(provider.name)
    setAiBaseUrl(provider.baseUrl)
    setAiApiFormat(provider.apiFormat)
    setAiModel(firstModelId(provider.models))
    setAiApiKey(provider.apiKey)
    setAiMediaProfile(provider.mediaProfile ?? 'auto')
  }

  const onAddProvider = (): void => {
    const id = `provider-${Date.now()}`
    const next: FortuneAiProviderConfig = {
      id,
      name: `Provider ${aiProviders.length + 1}`,
      baseUrl: 'https://api.example.com/v1',
      apiFormat: 'openai',
      models: [],
      apiKey: '',
      mediaProfile: 'auto',
    }
    setAiProviders([...aiProviders, next])
    setAiActiveProviderId(next.id)
    setAiProviderName(next.name)
    setAiBaseUrl(next.baseUrl)
    setAiApiFormat(next.apiFormat)
    setAiModel('')
    setAiApiKey('')
    setAiMediaProfile('auto')
  }

  const onRemoveProvider = (id: string): void => {
    const next = aiProviders.filter((p) => p.id !== id)
    if (next.length === 0) return
    setAiProviders(next)
    if (aiActiveProviderId === id) {
      const first = next[0]!
      setAiActiveProviderId(first.id)
      setAiProviderName(first.name)
      setAiBaseUrl(first.baseUrl)
      setAiApiFormat(first.apiFormat)
      setAiModel(firstModelId(first.models))
      setAiApiKey(first.apiKey)
      setAiMediaProfile(first.mediaProfile ?? 'auto')
    }
  }

  const applyCloudPreset = (presetId: string): void => {
    const preset = AI_PROVIDER_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    const models = modelsFromProviderPreset(preset)
    setAiProviderName(t(preset.nameKey))
    setAiBaseUrl(preset.baseUrl)
    setAiApiFormat(preset.apiFormat)
    setAiMediaProfile(preset.mediaProfile)
    setAiProviders((prev) =>
      prev.map((p) =>
        p.id === aiActiveProviderId
          ? {
              ...p,
              name: t(preset.nameKey),
              baseUrl: preset.baseUrl,
              apiFormat: preset.apiFormat,
              mediaProfile: preset.mediaProfile,
              models,
              imageModel: preset.imageModel,
              videoModel: preset.videoModel,
              musicModel: preset.musicModel,
            }
          : p,
      ),
    )
    setAiModel(firstModelId(models))
  }

  const applyLocalPreset = (kind: 'ollama' | 'lmstudio'): void => {
    const isOllama = kind === 'ollama'
    const name = isOllama ? 'Ollama' : 'LM Studio'
    const baseUrl = isOllama ? 'http://127.0.0.1:11434/v1' : 'http://127.0.0.1:1234/v1'
    const fallbackId = isOllama ? 'qwen2.5:7b' : 'local-model'
    const current = aiProviders.find((p) => p.id === aiActiveProviderId)?.models ?? []
    const models = current.length > 0 ? current : [defaultAiModelConfig(fallbackId)]
    setAiProviderName(name)
    setAiBaseUrl(baseUrl)
    setAiApiFormat('openai')
    setAiApiKey('')
    setAiMediaProfile('openai_compat')
    setAiProviders((prev) =>
      prev.map((p) =>
        p.id === aiActiveProviderId
          ? { ...p, name, baseUrl, apiFormat: 'openai', mediaProfile: 'openai_compat', models }
          : p,
      ),
    )
    if (current.length === 0) setAiModel(fallbackId)
  }

  const patchActiveModels = (models: AiModelConfig[]): void => {
    setAiProviders((prev) =>
      prev.map((p) => (p.id === aiActiveProviderId ? { ...p, models } : p)),
    )
    const ids = aiModelIds(models)
    if (!ids.includes(aiModel)) setAiModel(ids[0] ?? '')
  }

  const onSaveAiModel = (model: AiModelConfig): void => {
    const current = aiProviders.find((p) => p.id === aiActiveProviderId)?.models ?? []
    const oldId = typeof modelModal === 'object' && modelModal ? modelModal.id : ''
    const without = oldId
      ? current.filter((m) => m.id !== oldId)
      : current.filter((m) => m.id !== model.id)
    const next = without.some((m) => m.id === model.id)
      ? without.map((m) => (m.id === model.id ? model : m))
      : [...without, model]
    patchActiveModels(next)
    setAiModel(model.id)
    setModelModal(null)
  }

  const onRemoveAiModel = (modelId: string): void => {
    const current = aiProviders.find((p) => p.id === aiActiveProviderId)?.models ?? []
    patchActiveModels(current.filter((m) => m.id !== modelId))
  }

  const onSaveAiConfig = (): void => {
    setSavedHint(null)
    const current = aiProviders.find((p) => p.id === aiActiveProviderId) ?? aiProviders[0]
    const resolvedModels = current?.models ?? []
    const ids = aiModelIds(resolvedModels)
    const resolvedModel = ids.includes(aiModel.trim()) ? aiModel.trim() : (ids[0] ?? '')
    const media = mediaIdsFromModels(resolvedModels)
    const nextProviders = aiProviders.map((provider) =>
      provider.id === aiActiveProviderId
        ? {
            ...provider,
            name: aiProviderName.trim() || provider.name,
            baseUrl: aiBaseUrl.trim() || provider.baseUrl,
            apiFormat: aiApiFormat,
            models: resolvedModels,
            apiKey: aiApiKey.trim(),
            mediaProfile: aiMediaProfile,
            imageModel: media.imageModel,
            videoModel: media.videoModel,
            musicModel: media.musicModel,
          }
        : provider,
    )

    void window.treasureChest
      .setFortuneSettings({
        aiProviderName: aiProviderName.trim(),
        aiBaseUrl: aiBaseUrl.trim(),
        aiApiFormat,
        aiModels: ids,
        aiModel: resolvedModel,
        aiApiKey: aiApiKey.trim(),
        aiProviders: nextProviders,
        aiActiveProviderId,
      })
      .then((next) => {
        setAiProviders(next.aiProviders)
        setAiActiveProviderId(next.aiActiveProviderId)
        setAiProviderName(next.aiProviderName)
        setAiBaseUrl(next.aiBaseUrl)
        setAiApiFormat(next.aiApiFormat)
        setAiModel(next.aiModel)
        setAiApiKey(next.aiApiKey)
        const active =
          next.aiProviders.find((p) => p.id === next.aiActiveProviderId) ?? next.aiProviders[0]
        setAiMediaProfile(active?.mediaProfile ?? 'auto')
        setSavedHint(t('settings.fortuneAiConfigSaved'))
      })
  }

  const onTestAiConnection = (): void => {
    const current = aiProviders.find((p) => p.id === aiActiveProviderId)
    const model = aiModel.trim() || firstModelId(current?.models ?? [])
    if (!model) {
      setTestHint(t('settings.fortuneAiNeedModel'))
      return
    }
    const provider: FortuneAiProviderConfig = {
      id: aiActiveProviderId || 'temp-provider',
      name: aiProviderName.trim() || 'Provider',
      baseUrl: aiBaseUrl.trim(),
      apiFormat: aiApiFormat,
      models: current?.models?.length ? current.models : [defaultAiModelConfig(model)],
      apiKey: aiApiKey.trim(),
    }
    setTesting(true)
    setTestHint(t('settings.fortuneAiTesting'))
    void window.treasureChest.testFortuneAiConnection({ provider, model }).then((res) => {
      setTesting(false)
      setTestHint(
        res.ok
          ? t('settings.fortuneAiTestPassed', { message: res.message })
          : t('settings.fortuneAiTestFailed', { error: res.message }),
      )
    })
  }

  const activeModels = aiProviders.find((p) => p.id === aiActiveProviderId)?.models ?? []

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.title}>{t('settings.modelsTitle')}</h2>
        <p className={styles.desc}>{t('settings.modelsHint')}</p>
        {onOpenLocalLlm ? (
          <p className={styles.hint}>
            {t('settings.modelsLocalLlmEntry')}{' '}
            <button type="button" className={styles.linkBtn} onClick={onOpenLocalLlm}>
              {t('settings.nav.localLlm')}
            </button>
          </p>
        ) : null}
      </div>

      <div className={styles.section}>
        <p className={styles.sectionLabel}>{t('settings.modelsLocalPresets')}</p>
        <div className={styles.presetGrid}>
          <button type="button" className={styles.presetChip} onClick={() => applyLocalPreset('ollama')}>
            {t('settings.modelsPreset.ollama')}
          </button>
          <button
            type="button"
            className={styles.presetChip}
            onClick={() => applyLocalPreset('lmstudio')}
          >
            {t('settings.modelsPreset.lmstudio')}
          </button>
        </div>
        <p className={styles.sectionLabel}>{t('settings.modelsCloudPresets')}</p>
        <div className={styles.presetGrid}>
          {AI_PROVIDER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.presetChip}
              onClick={() => applyCloudPreset(preset.id)}
            >
              {t(preset.nameKey)}
            </button>
          ))}
        </div>
        <p className={styles.hint}>{t('settings.modelsPresetHint')}</p>
        <p className={styles.hint}>{t('settings.modelsLocalHint')}</p>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionLabel}>{t('settings.fortuneAiProviders')}</p>
        <div className={styles.providerGrid}>
          {aiProviders.map((provider) => {
            const active = provider.id === aiActiveProviderId
            return (
              <div
                key={provider.id}
                className={`${styles.providerCard} ${active ? styles.providerCardActive : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => onSelectProvider(provider.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectProvider(provider.id)
                  }
                }}
              >
                <div className={styles.providerTop}>
                  <h3 className={styles.providerName}>{provider.name}</h3>
                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                    <span className={styles.providerBadge}>{provider.apiFormat}</span>
                    {aiProviders.length > 1 ? (
                      <button
                        type="button"
                        className={styles.providerRemove}
                        aria-label={t('settings.fortuneAiProviderRemove')}
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemoveProvider(provider.id)
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className={styles.providerMeta}>{provider.baseUrl || '—'}</p>
                <p className={styles.providerMeta}>
                  {t('settings.modelsModelCount', { count: provider.models?.length ?? 0 })}
                </p>
              </div>
            )
          })}
          <button type="button" className={styles.addProvider} onClick={onAddProvider}>
            + {t('settings.fortuneAiProviderAdd')}
          </button>
        </div>
      </div>

      <div className={styles.detailCard}>
        <h3 className={styles.detailTitle}>{t('settings.modelsActiveProvider')}</h3>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>{t('settings.fortuneAiProviderName')}</span>
            <input
              value={aiProviderName}
              onChange={(e) => setAiProviderName(e.target.value)}
              placeholder={t('settings.fortuneAiProviderNamePlaceholder')}
            />
          </label>
          <label className={styles.field}>
            <span>{t('settings.fortuneAiFormat')}</span>
            <select
              value={aiApiFormat}
              onChange={(e) => setAiApiFormat(e.target.value as 'openai' | 'anthropic')}
            >
              <option value="openai">{t('settings.fortuneAiFormat.openai')}</option>
              <option value="anthropic">{t('settings.fortuneAiFormat.anthropic')}</option>
            </select>
          </label>
          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span>{t('settings.fortuneAiBaseUrl')}</span>
            <input
              value={aiBaseUrl}
              onChange={(e) => setAiBaseUrl(e.target.value)}
              placeholder={t('settings.fortuneAiBaseUrlPlaceholder')}
            />
          </label>
          <label className={styles.field}>
            <span>{t('settings.fortuneAiApiKey')}</span>
            <input
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              placeholder={t('settings.fortuneAiApiKeyPlaceholder')}
              type="password"
              autoComplete="off"
            />
          </label>
          <label className={styles.field}>
            <span>{t('settings.mediaProfile')}</span>
            <select
              value={aiMediaProfile}
              onChange={(e) => setAiMediaProfile(e.target.value as MediaProfileId)}
            >
              {MEDIA_PROFILE_IDS.map((id) => (
                <option key={id} value={id}>
                  {t(`settings.mediaProfile.${id}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={styles.hint}>{t('settings.mediaProfileHint')}</p>

        <div className={styles.modelsHead}>
          <div>
            <h4 className={styles.modelsTitle}>{t('settings.fortuneAiModelList')}</h4>
            <p className={styles.hint}>{t('settings.fortuneAiModelHint')}</p>
          </div>
          <button type="button" className={styles.addBtn} onClick={() => setModelModal('new')}>
            + {t('settings.fortuneAiModelAdd')}
          </button>
        </div>

        {activeModels.length === 0 ? (
          <div className={styles.emptyModels}>{t('settings.modelsEmptyModels')}</div>
        ) : (
          <div className={styles.modelGrid}>
            {activeModels.map((model) => (
              <article
                key={model.id}
                className={`${styles.modelCard} ${aiModel === model.id ? styles.modelCardActive : ''}`}
              >
                <button
                  type="button"
                  className={styles.modelId}
                  onClick={() => setAiModel(model.id)}
                  title={model.id}
                >
                  {model.id}
                </button>
                <div className={styles.caps}>
                  {model.inputModalities
                    .filter((m) => m !== 'text')
                    .map((m) => (
                      <span key={`in-${m}`} className={styles.cap}>
                        {t(`settings.modelModal.modality.${m}`)}
                        {t('settings.modelModal.capIn')}
                      </span>
                    ))}
                  {model.outputModalities
                    .filter((m) => m !== 'text')
                    .map((m) => (
                      <span key={`out-${m}`} className={styles.cap}>
                        {t(`settings.modelModal.modality.${m}`)}
                        {t('settings.modelModal.capOut')}
                      </span>
                    ))}
                </div>
                <div className={styles.modelActions}>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() => setModelModal(model)}
                  >
                    {t('settings.fortuneAiModelEdit')}
                  </button>
                  <button
                    type="button"
                    className={`${styles.ghostBtn} ${styles.ghostDanger}`}
                    onClick={() => onRemoveAiModel(model.id)}
                  >
                    {t('settings.modelsDeleteModel')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.primaryBtn} onClick={onSaveAiConfig}>
            {t('settings.fortuneAiSaveConfig')}
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={testing}
            onClick={onTestAiConnection}
          >
            {testing ? t('settings.fortuneAiTesting') : t('settings.fortuneAiTestConnection')}
          </button>
        </div>
        {savedHint ? <p className={styles.status}>{savedHint}</p> : null}
        {testHint ? <p className={styles.status}>{testHint}</p> : null}
      </div>

      {modelModal !== null ? (
        <AddModelModal
          initial={modelModal === 'new' ? null : modelModal}
          onClose={() => setModelModal(null)}
          onSave={onSaveAiModel}
        />
      ) : null}
    </div>
  )
}
