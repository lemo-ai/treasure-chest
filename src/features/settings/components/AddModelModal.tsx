import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AiModelConfig, AiModelModality } from '@shared'
import { defaultAiModelConfig } from '@shared'
import { IconClose } from '@renderer/shared/ui/icons'
import styles from './AddModelModal.module.css'

const OPTIONAL_INPUT: AiModelModality[] = ['image', 'video']
const OPTIONAL_OUTPUT: AiModelModality[] = ['image', 'video', 'audio']

interface AddModelModalProps {
  initial?: AiModelConfig | null
  onClose: () => void
  onSave: (model: AiModelConfig) => void
}

function toggle(list: AiModelModality[], item: AiModelModality, on: boolean): AiModelModality[] {
  if (on) return list.includes(item) ? list : [...list, item]
  return list.filter((m) => m !== item)
}

export function AddModelModal({ initial, onClose, onSave }: AddModelModalProps): React.JSX.Element {
  const { t } = useTranslation()
  const isEdit = Boolean(initial?.id)
  const [id, setId] = useState(initial?.id ?? '')
  const [contextWindow, setContextWindow] = useState(String(initial?.contextWindow ?? 1_000_000))
  const [maxOutputTokens, setMaxOutputTokens] = useState(String(initial?.maxOutputTokens ?? 128_000))
  const [inputModalities, setInputModalities] = useState<AiModelModality[]>(
    initial?.inputModalities ?? ['text'],
  )
  const [outputModalities, setOutputModalities] = useState<AiModelModality[]>(
    initial?.outputModalities ?? ['text'],
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

        <label className={styles.field}>
          <span>{t('settings.modelModal.id')}</span>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder={t('settings.modelModal.idPlaceholder')}
            autoFocus
          />
        </label>
        <label className={styles.field}>
          <span>{t('settings.modelModal.contextWindow')}</span>
          <input
            inputMode="numeric"
            value={contextWindow}
            onChange={(e) => setContextWindow(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>{t('settings.modelModal.maxOutput')}</span>
          <input
            inputMode="numeric"
            value={maxOutputTokens}
            onChange={(e) => setMaxOutputTokens(e.target.value)}
          />
        </label>

        <fieldset className={styles.mods}>
          <legend>{t('settings.modelModal.inputTypes')}</legend>
          <label className={`${styles.check} ${styles.locked}`}>
            <input type="checkbox" checked disabled />
            <span>{t('settings.modelModal.modality.text')}</span>
            <span className={styles.lock} aria-hidden>
              🔒
            </span>
          </label>
          {OPTIONAL_INPUT.map((kind) => (
            <label key={kind} className={styles.check}>
              <input
                type="checkbox"
                checked={inputModalities.includes(kind)}
                onChange={(e) => setInputModalities((prev) => toggle(prev, kind, e.target.checked))}
              />
              <span>{t(`settings.modelModal.modality.${kind}`)}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className={styles.mods}>
          <legend>{t('settings.modelModal.outputTypes')}</legend>
          <label className={`${styles.check} ${styles.locked}`}>
            <input type="checkbox" checked disabled />
            <span>{t('settings.modelModal.modality.text')}</span>
            <span className={styles.lock} aria-hidden>
              🔒
            </span>
          </label>
          {OPTIONAL_OUTPUT.map((kind) => (
            <label key={kind} className={styles.check}>
              <input
                type="checkbox"
                checked={outputModalities.includes(kind)}
                onChange={(e) => setOutputModalities((prev) => toggle(prev, kind, e.target.checked))}
              />
              <span>{t(`settings.modelModal.modality.${kind}`)}</span>
            </label>
          ))}
        </fieldset>

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
