import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import {
  agentDisplayDesc,
  agentDisplayName,
  deleteAgent,
  listAgents,
  type AgentDef,
} from '@renderer/features/agents/lib/agentRegistry'
import { AgentAvatar } from '@renderer/features/agents/components/AgentAvatar'
import { CreateAgentModal } from '@renderer/features/agents/components/CreateAgentModal'
import { IconPlus, IconTrash, IconWrite } from '@renderer/shared/ui/icons'
import styles from './AgentsPanel.module.css'

export function AgentsPanel(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [agents, setAgents] = useState<AgentDef[]>(() => listAgents())
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<AgentDef | null>(null)

  const refresh = (): void => {
    setAgents(listAgents())
  }

  useEffect(() => {
    refresh()
  }, [])

  const onDelete = (agent: AgentDef): void => {
    if (agent.builtin) return
    if (!window.confirm(t('agents.delete.confirm'))) return
    if (!deleteAgent(String(agent.id))) return
    refresh()
    window.dispatchEvent(new Event('qiankun-agents-changed'))
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h2 className={styles.title}>{t('settings.agents.title')}</h2>
          <p className={styles.desc}>{t('settings.agents.desc')}</p>
        </div>
        <button type="button" className={styles.addBtn} onClick={() => setCreateOpen(true)}>
          <IconPlus />
          {t('agents.create.title')}
        </button>
      </div>

      <div className={styles.grid}>
        {agents.map((agent) => {
          const name = agentDisplayName(agent, t)
          const desc = agentDisplayDesc(agent, t)
          return (
            <article key={agent.id} className={styles.card}>
              <div className={styles.cardTop}>
                <AgentAvatar agent={agent} size="md" fallback="skill" />
                <div className={styles.cardMeta}>
                  <h3 className={styles.cardName}>{name}</h3>
                  <div className={styles.badges}>
                    <span className={styles.badge}>
                      {agent.builtin ? t('settings.agents.builtin') : t('settings.agents.custom')}
                    </span>
                  </div>
                </div>
              </div>
              <p className={styles.cardDesc}>{desc || t('agents.noDescription')}</p>
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() => void navigate(`/?agent=${encodeURIComponent(agent.id)}`)}
                >
                  {t('settings.agents.open')}
                </button>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() => setEditing(agent)}
                >
                  <IconWrite />
                  {t('agents.edit.action')}
                </button>
                {!agent.builtin ? (
                  <button
                    type="button"
                    className={styles.dangerBtn}
                    onClick={() => onDelete(agent)}
                  >
                    <IconTrash />
                    {t('agents.delete.action')}
                  </button>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>

      {createOpen ? (
        <CreateAgentModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            refresh()
            setCreateOpen(false)
            window.dispatchEvent(new Event('qiankun-agents-changed'))
          }}
        />
      ) : null}

      {editing ? (
        <CreateAgentModal
          editing={editing}
          onClose={() => setEditing(null)}
          onUpdated={() => {
            refresh()
            setEditing(null)
            window.dispatchEvent(new Event('qiankun-agents-changed'))
          }}
          onDeleted={() => {
            refresh()
            setEditing(null)
            window.dispatchEvent(new Event('qiankun-agents-changed'))
          }}
        />
      ) : null}
    </div>
  )
}
