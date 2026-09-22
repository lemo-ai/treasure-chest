import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AiModelConfig,
  FortuneAiProviderConfig,
  FortuneSettings,
  MediaProfileId,
} from '@shared'
import {
  DEFAULT_FORTUNE_SETTINGS,
  MEDIA_PROFILE_IDS,
  aiModelIds,
  firstChatModelId,
  firstModelId,
  isChatAiModel,
  mediaIdsFromModels,
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
  const [advancedOpen, setAdvancedOpen] = useState(false)
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

  const applyFromFortune = (next: FortuneSettings): void => {
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
  }

  const persistConfig = (opts: {
    providers: FortuneAiProviderConfig[]
    activeProviderId: string
    providerName: string
    baseUrl: string
    apiFormat: 'openai' | 'anthropic'
    model: string
    apiKey: string
    mediaProfile: MediaProfileId
    hint?: boolean
  }): void => {
    const current =
      opts.providers.find((p) => p.id === opts.activeProviderId) ?? opts.providers[0]
    const resolvedModels = current?.models ?? []
    const ids = aiModelIds(resolvedModels)
    const resolvedModel = ids.includes(opts.model.trim())
      ? opts.model.trim()
      : firstChatModelId(resolvedModels) || ids[0] || ''
    const media = mediaIdsFromModels(resolvedModels)
    const nextProviders = opts.providers.map((provider) =>
      provider.id === opts.activeProviderId
        ? {
            ...provider,
            name: opts.providerName.trim() || provider.name,
            baseUrl: opts.baseUrl.trim() || provider.baseUrl,
            apiFormat: opts.apiFormat,
            models: resolvedModels,
            apiKey: opts.apiKey.trim(),
            mediaProfile: opts.mediaProfile,
            imageModel: media.imageModel ?? current?.imageModel,
            videoModel: media.videoModel ?? current?.videoModel,
            musicModel: media.musicModel ?? current?.musicModel,
          }
        : provider,
    )

    void window.treasureChest
      .setFortuneSettings({
        aiProviderName: opts.providerName.trim(),
        aiBaseUrl: opts.baseUrl.trim(),
        aiApiFormat: opts.apiFormat,
        aiModels: ids,
        aiModel: resolvedModel,
        aiApiKey: opts.apiKey.trim(),
        aiProviders: nextProviders,
        aiActiveProviderId: opts.activeProviderId,
      })
      .then((next) => {
        applyFromFortune(next)
        if (opts.hint !== false) setSavedHint(t('settings.fortuneAiConfigSaved'))
      })
  }

  const onSelectProvider = (id: string): void => {
    const provider = aiProviders.find((p) => p.id === id)
    if (!provider) return
    setAiActiveProviderId(provider.id)
    setAiProviderName(provider.name)
    setAiBaseUrl(provider.baseUrl)
    setAiApiFormat(provider.apiFormat)
    setAiModel(firstChatModelId(provider.models) || firstModelId(provider.models))
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
    const providers = [...aiProviders, next]
    setAiProviders(providers)
    setAiActiveProviderId(next.id)
    setAiProviderName(next.name)
    setAiBaseUrl(next.baseUrl)
    setAiApiFormat(next.apiFormat)
    setAiModel('')
    setAiApiKey('')
    setAiMediaProfile('auto')
    persistConfig({
      providers,
      activeProviderId: next.id,
      providerName: next.name,
      baseUrl: next.baseUrl,
      apiFormat: next.apiFormat,
      model: '',
      apiKey: '',
      mediaProfile: 'auto',
    })
  }

  const onRemoveProvider = (id: string): void => {
    const next = aiProviders.filter((p) => p.id !== id)
    if (next.length === 0) return
    setAiProviders(next)
    let activeId = aiActiveProviderId
    let name = aiProviderName
    let baseUrl = aiBaseUrl
    let apiFormat = aiApiFormat
    let model = aiModel
    let apiKey = aiApiKey
    let mediaProfile = aiMediaProfile
    if (aiActiveProviderId === id) {
      const first = next[0]!
      activeId = first.id
      name = first.name
      baseUrl = first.baseUrl
      apiFormat = first.apiFormat
      model = firstChatModelId(first.models) || firstModelId(first.models)
      apiKey = first.apiKey
      mediaProfile = first.mediaProfile ?? 'auto'
      setAiActiveProviderId(activeId)
      setAiProviderName(name)
      setAiBaseUrl(baseUrl)
      setAiApiFormat(apiFormat)
      setAiModel(model)
      setAiApiKey(apiKey)
      setAiMediaProfile(mediaProfile)
    }
    persistConfig({
      providers: next,
      activeProviderId: activeId,
      providerName: name,
      baseUrl,
      apiFormat,
      model,
      apiKey,
      mediaProfile,
    })
  }

  const onSaveAiModel = (model: AiModelConfig): void => {
    const current = aiProviders.find((p) => p.id === aiActiveProviderId)?.models ?? []
    const oldId = typeof modelModal === 'object' && modelModal ? modelModal.id : ''
    const without = oldId
      ? current.filter((m) => m.id !== oldId)
      : current.filter((m) => m.id !== model.id)
    const nextModels = without.some((m) => m.id === model.id)
      ? without.map((m) => (m.id === model.id ? model : m))
      : [...without, model]
    const providers = aiProviders.map((p) =>
      p.id === aiActiveProviderId ? { ...p, models: nextModels } : p,
    )
    setAiProviders(providers)
    setAiModel(model.id)
    setModelModal(null)
    persistConfig({
      providers,
      activeProviderId: aiActiveProviderId,
      providerName: aiProviderName,
      baseUrl: aiBaseUrl,
      apiFormat: aiApiFormat,
      model: model.id,
      apiKey: aiApiKey,
      mediaProfile: aiMediaProfile,
    })
  }

  const onRemoveAiModel = (modelId: string): void => {
    const current = aiProviders.find((p) => p.id === aiActiveProviderId)?.models ?? []
    const nextModels = current.filter((m) => m.id !== modelId)
    const nextModel =
      aiModel === modelId ? firstChatModelId(nextModels) || firstModelId(nextModels) : aiModel
    const providers = aiProviders.map((p) =>
      p.id === aiActiveProviderId ? { ...p, models: nextModels } : p,
    )
    setAiProviders(providers)
    setAiModel(nextModel)
    persistConfig({
      providers,
      activeProviderId: aiActiveProviderId,
      providerName: aiProviderName,
      baseUrl: aiBaseUrl,
      apiFormat: aiApiFormat,
      model: nextModel,
      apiKey: aiApiKey,
      mediaProfile: aiMediaProfile,
    })
  }

  const onSaveAiConfig = (): void => {
    setSavedHint(null)
    persistConfig({
      providers: aiProviders,
      activeProviderId: aiActiveProviderId,
      providerName: aiProviderName,
      baseUrl: aiBaseUrl,
      apiFormat: aiApiFormat,
      model: aiModel,
      apiKey: aiApiKey,
      mediaProfile: aiMediaProfile,
    })
  }

  const onTestAiConnection = (): void => {
    const current = aiProviders.find((p) => p.id === aiActiveProviderId)
    const models = current?.models ?? []
    const selected = models.find((m) => m.id === aiModel.trim())
    // Probe chat completions only — media models (wanx etc.) are skipped for the
    // request, but we do not change the user's selected model in the UI.
    const model =
      (selected && isChatAiModel(selected) ? selected.id : '') ||
      firstChatModelId(models) ||
      ''
    if (!model) {
      setTestHint(t('settings.fortuneAiNeedChatModel'))
      return
    }
    const provider: FortuneAiProviderConfig = {
      id: aiActiveProviderId || 'temp-provider',
      name: aiProviderName.trim() || 'Provider',
      baseUrl: aiBaseUrl.trim(),
      apiFormat: aiApiFormat,
      models: models.length ? models : [{ id: model, inputModalities: ['text'], outputModalities: ['text'] }],
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
        <p className={styles.hint}>{t('settings.modelModal.protocolNotice')}</p>
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
          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span>{t('settings.fortuneAiApiKey')}</span>
            <input
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              placeholder={t('settings.fortuneAiApiKeyPlaceholder')}
              type="password"
              autoComplete="off"
            />
          </label>
        </div>

        <button
          type="button"
          className={styles.linkBtn}
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          {advancedOpen ? t('settings.modelModal.hideAdvanced') : t('settings.modelModal.showAdvanced')}
        </button>
        {advancedOpen ? (
          <div className={styles.advancedBox}>
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
            <p className={styles.hint}>{t('settings.mediaProfileHint')}</p>
          </div>
        ) : null}

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
          <>
            <p className={styles.legend}>
              <span className={`${styles.cap} ${styles.capChat}`}>{t('settings.modelModal.roleChat')}</span>
              <span>{t('settings.modelLegendChat')}</span>
              <span className={`${styles.cap} ${styles.capMedia}`}>{t('settings.modelModal.roleMedia')}</span>
              <span>{t('settings.modelLegendMedia')}</span>
            </p>
            <div className={styles.modelGrid}>
              {activeModels.map((model) => {
                const chat = isChatAiModel(model)
                return (
                  <article
                    key={model.id}
                    className={`${styles.modelCard} ${aiModel === model.id ? styles.modelCardActive : ''} ${chat ? '' : styles.modelCardMedia}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={aiModel === model.id}
                    title={
                      chat
                        ? t('settings.modelCardChatTitle')
                        : t('settings.modelCardMediaTitle')
                    }
                    onClick={() => {
                      if (!chat) return
                      setAiModel(model.id)
                    }}
                    onKeyDown={(e) => {
                      if (!chat) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setAiModel(model.id)
                      }
                    }}
                  >
                    <div className={styles.modelId} title={model.id}>
                      {model.id}
                    </div>
                    <div className={styles.caps}>
                      <span className={`${styles.cap} ${chat ? styles.capChat : styles.capMedia}`}>
                        {chat
                          ? t('settings.modelModal.roleChat')
                          : t('settings.modelModal.roleMedia')}
                      </span>
                      {!chat ? (
                        <span className={styles.capNote}>{t('settings.modelModal.roleMediaNote')}</span>
                      ) : null}
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
                        onClick={(e) => {
                          e.stopPropagation()
                          setModelModal(model)
                        }}
                      >
                        {t('settings.fortuneAiModelEdit')}
                      </button>
                      <button
                        type="button"
                        className={`${styles.ghostBtn} ${styles.ghostDanger}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemoveAiModel(model.id)
                        }}
                      >
                        {t('settings.modelsDeleteModel')}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </>
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
