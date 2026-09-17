import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createAgent, type AgentDef } from '../lib/agentRegistry'
import { toCreateAgentInput, type ParsedAgentSpec } from '../lib/parseAgentSpec'
import styles from './AgentSpecCard.module.css'

interface AgentSpecCardProps {
  spec: ParsedAgentSpec
  onCreated: (agent: AgentDef) => void
}

export function AgentSpecCard({ spec, onCreated }: AgentSpecCardProps): React.JSX.Element {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [doneId, setDoneId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onCreate = (): void => {
    if (busy || doneId) return
    setBusy(true)
    setError(null)
    try {
      const agent = createAgent(toCreateAgentInput(spec))
      setDoneId(String(agent.id))
      onCreated(agent)
    } catch {
      setError(t('agents.create.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <strong>{t('workbench.agentSpec.title')}</strong>
        <span className={styles.badge}>{t('workbench.agentSpec.ready')}</span>
      </div>
      <dl className={styles.meta}>
        <div>
          <dt>{t('agents.create.name')}</dt>
          <dd>{spec.name}</dd>
        </div>
        {spec.description ? (
          <div>
            <dt>{t('agents.create.description')}</dt>
            <dd>{spec.description}</dd>
          </div>
        ) : null}
        {spec.quickPrompts?.length ? (
          <div>
            <dt>{t('agents.create.quickPrompts')}</dt>
            <dd>{spec.quickPrompts.join(' · ')}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t('agents.create.prompt')}</dt>
          <dd className={styles.prompt}>{spec.systemPrompt}</dd>
        </div>
      </dl>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.actions}>
        {doneId ? (
          <span className={styles.done}>{t('workbench.agentSpec.created')}</span>
        ) : (
          <button type="button" className={styles.createBtn} disabled={busy} onClick={onCreate}>
            {busy ? t('workbench.agentSpec.creating') : t('workbench.agentSpec.create')}
          </button>
        )}
      </div>
    </div>
  )
}
