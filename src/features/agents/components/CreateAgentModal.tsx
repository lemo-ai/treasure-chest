import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { IconClose } from '@renderer/shared/ui/icons'
import {
  createAgent,
  type AgentTone,
  type CreateAgentInput,
  type AgentDef,
} from '../lib/agentRegistry'
import styles from './CreateAgentModal.module.css'

const TONES: AgentTone[] = ['brand', 'accent', 'highlight']

interface CreateAgentModalProps {
  onClose: () => void
  onCreated: (agent: AgentDef) => void
}

export function CreateAgentModal({ onClose, onCreated }: CreateAgentModalProps): React.JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [tone, setTone] = useState<AgentTone>('brand')
  const [error, setError] = useState<string | null>(null)

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    setError(null)
    const input: CreateAgentInput = { name, description, systemPrompt, tone }
    if (!input.name.trim()) {
      setError(t('agents.create.nameRequired'))
      return
    }
    try {
      const agent = createAgent(input)
      onCreated(agent)
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
              {t('agents.create.title')}
            </h2>
            <p className={styles.sub}>{t('agents.create.subtitle')}</p>
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

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onClose}>
              {t('agents.create.cancel')}
            </button>
            <button type="submit" className={styles.primary}>
              {t('agents.create.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
