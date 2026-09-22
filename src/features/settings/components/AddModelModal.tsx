import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AiModelConfig, AiModelModality } from '@shared'
import { defaultAiModelConfig, isChatAiModel } from '@shared'
import { IconClose } from '@renderer/shared/ui/icons'
import styles from './AddModelModal.module.css'

interface AddModelModalProps {
  initial?: AiModelConfig | null
  onClose: () => void
  onSave: (model: AiModelConfig) => void
}

export function AddModelModal({ initial, onClose, onSave }: AddModelModalProps): React.JSX.Element {
  const { t } = useTranslation()
  const isEdit = Boolean(initial?.id)
  const [id, setId] = useState(initial?.id ?? '')
  const [vision, setVision] = useState(
    Boolean(initial?.inputModalities.includes('image')),
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [contextWindow, setContextWindow] = useState(
    initial?.contextWindow ? String(initial.contextWindow) : '',
  )
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    initial?.maxOutputTokens ? String(initial.maxOutputTokens) : '',
  )
  const [mediaOnly, setMediaOnly] = useState(initial ? !isChatAiModel(initial) : false)
  const [mediaKind, setMediaKind] = useState<Exclude<AiModelModality, 'text'>>(
    initial?.outputModalities.includes('video')
      ? 'video'
      : initial?.outputModalities.includes('audio')
        ? 'audio'
        : 'image',
  )
  const [error, setError] = useState('')

  const submit = (): void => {
    const nextId = id.trim()
    if (!nextId) {
      setError(t('settings.modelModal.needId'))
      return
    }
    const ctx = Number(contextWindow)
    const maxOut = Number(maxOutputTokens)
    const inputModalities: AiModelModality[] = vision ? ['text', 'image'] : ['text']
    const outputModalities: AiModelModality[] = mediaOnly ? [mediaKind] : ['text']
    onSave(
      defaultAiModelConfig(nextId, {
        contextWindow: Number.isFinite(ctx) && ctx > 0 ? Math.round(ctx) : undefined,
        maxOutputTokens: Number.isFinite(maxOut) && maxOut > 0 ? Math.round(maxOut) : undefined,
        inputModalities,
        outputModalities,
      }),
    )
  }

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-model-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <h2 id="add-model-title" className={styles.title}>
            {isEdit ? t('settings.modelModal.titleEdit') : t('settings.modelModal.titleAdd')}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t('settings.modelModal.cancel')}>
            <IconClose />
          </button>
        </div>

        <p className={styles.hint}>{t('settings.modelModal.protocolNotice')}</p>

        <label className={styles.field}>
          <span>{t('settings.modelModal.id')}</span>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder={t('settings.modelModal.idPlaceholder')}
            autoFocus
          />
        </label>

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={vision}
            disabled={mediaOnly}
            onChange={(e) => setVision(e.target.checked)}
          />
          <span>{t('settings.modelModal.vision')}</span>
        </label>
        <p className={styles.hint}>{t('settings.modelModal.visionHint')}</p>

        <button
          type="button"
          className={styles.advancedToggle}
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          {advancedOpen ? t('settings.modelModal.hideAdvanced') : t('settings.modelModal.showAdvanced')}
        </button>

        {advancedOpen ? (
          <div className={styles.advanced}>
            <label className={styles.field}>
              <span>{t('settings.modelModal.contextWindow')}</span>
              <input
                inputMode="numeric"
                value={contextWindow}
                onChange={(e) => setContextWindow(e.target.value)}
                placeholder={t('settings.modelModal.tokenDefault')}
              />
            </label>
            <label className={styles.field}>
              <span>{t('settings.modelModal.maxOutput')}</span>
              <input
                inputMode="numeric"
                value={maxOutputTokens}
                onChange={(e) => setMaxOutputTokens(e.target.value)}
                placeholder={t('settings.modelModal.tokenDefault')}
              />
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={mediaOnly}
                onChange={(e) => {
                  setMediaOnly(e.target.checked)
                  if (e.target.checked) setVision(false)
                }}
              />
              <span>{t('settings.modelModal.mediaOnly')}</span>
            </label>
            <p className={styles.hint}>{t('settings.modelModal.mediaOnlyHint')}</p>
            {mediaOnly ? (
              <label className={styles.field}>
                <span>{t('settings.modelModal.mediaKind')}</span>
                <select
                  value={mediaKind}
                  onChange={(e) => setMediaKind(e.target.value as Exclude<AiModelModality, 'text'>)}
                >
                  <option value="image">{t('settings.modelModal.modality.image')}</option>
                  <option value="video">{t('settings.modelModal.modality.video')}</option>
                  <option value="audio">{t('settings.modelModal.modality.audio')}</option>
                </select>
              </label>
            ) : null}
          </div>
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            {t('settings.modelModal.cancel')}
          </button>
          <button type="button" className={styles.save} onClick={submit}>
            {t('settings.modelModal.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
