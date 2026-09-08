import { useEffect, useState, type ReactNode } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  IconBook,
  IconCalendar,
  IconFortune,
  IconPlus,
  IconSettings,
  IconSkill,
  IconStocks,
  IconTools,
  IconWorkbench,
} from '@renderer/shared/ui/icons'
import appLogo from '@renderer/assets/app-logo.png'
import {
  agentDisplayName,
  isDirectChatId,
  listAgents,
  type AgentDef,
} from '@renderer/features/agents/lib/agentRegistry'
import { CreateAgentModal } from '@renderer/features/agents/components/CreateAgentModal'
import { useTheme } from '@renderer/shared/hooks/useTheme'
import styles from './AppLayout.module.css'

function agentNavIcon(agent: AgentDef): ReactNode {
  if (agent.id === 'fortune') return <IconFortune />
  if (agent.id === 'stocks') return <IconStocks />
  return <IconSkill />
}

export function AppLayout(): React.JSX.Element {
  useTheme()
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [version, setVersion] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentDef | null>(null)
  const [agents, setAgents] = useState<AgentDef[]>(() => listAgents())
  const flushMain =
    location.pathname === '/' ||
    location.pathname.startsWith('/workbench') ||
    location.pathname.startsWith('/knowledge') ||
    location.pathname.startsWith('/settings') ||
    location.pathname.startsWith('/changelog') ||
    location.pathname.startsWith('/tools/image')

  const activeAgentParam = new URLSearchParams(location.search).get('agent')
  const onWorkbench =
    location.pathname === '/' || location.pathname.startsWith('/workbench')
  const workbenchActive =
    onWorkbench && (activeAgentParam === null || isDirectChatId(activeAgentParam))

  useEffect(() => {
    void window.treasureChest.getVersion().then(setVersion)
  }, [])

  useEffect(() => {
    setAgents(listAgents())
  }, [location.pathname, location.search, createOpen, editingAgent])

  return (
    <div className={styles.shell}>
      <aside className={styles.nav}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <img src={appLogo} alt="" width={38} height={38} draggable={false} />
          </span>
          <div className={styles.brandText}>
            <span className={styles.brandName}>{t('appName')}</span>
            <span className={styles.brandTag}>{t('nav.brandTag')}</span>
          </div>
        </div>

        <nav className={styles.links}>
          <NavLink
            to="/"
            end
            className={() =>
              workbenchActive ? `${styles.link} ${styles.linkActive}` : styles.link
            }
          >
            <span className={styles.linkIcon}>
              <IconWorkbench />
            </span>
            <span className={styles.linkLabel}>{t('nav.workbench')}</span>
          </NavLink>
          <NavLink to="/knowledge" className={navClass}>
            <span className={styles.linkIcon}>
              <IconBook />
            </span>
            <span className={styles.linkLabel}>{t('nav.knowledge')}</span>
          </NavLink>

          <div className={styles.sectionLabel}>{t('nav.sectionAgents')}</div>
          {agents.map((agent) => {
            const to = `/?agent=${encodeURIComponent(agent.id)}`
            const isActive = onWorkbench && activeAgentParam === agent.id
            return (
              <div key={agent.id} className={styles.agentRow}>
                <NavLink
                  to={to}
                  className={() =>
                    isActive ? `${styles.link} ${styles.linkActive}` : styles.link
                  }
                >
                  <span className={styles.linkIcon}>{agentNavIcon(agent)}</span>
                  <span className={styles.linkLabel}>{agentDisplayName(agent, t)}</span>
                </NavLink>
                {!agent.builtin ? (
                  <button
                    type="button"
                    className={styles.agentEditBtn}
                    title={t('agents.edit.action')}
                    aria-label={t('agents.edit.action')}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setEditingAgent(agent)
                    }}
                  >
                    ✎
                  </button>
                ) : null}
              </div>
            )
          })}
          <button
            type="button"
            className={styles.addAgentBtn}
            onClick={() => setCreateOpen(true)}
          >
            <span className={styles.linkIcon}>
              <IconPlus />
            </span>
            <span className={styles.linkLabel}>{t('nav.addAgent')}</span>
          </button>

          <div className={styles.sectionLabel}>{t('nav.sectionTools')}</div>
          <NavLink to="/calendar" className={navClass}>
            <span className={styles.linkIcon}>
              <IconCalendar />
            </span>
            <span className={styles.linkLabel}>{t('nav.calendar')}</span>
          </NavLink>
          <NavLink to="/tools" className={navClass}>
            <span className={styles.linkIcon}>
              <IconTools />
            </span>
            <span className={styles.linkLabel}>{t('nav.toolbox')}</span>
          </NavLink>
        </nav>

        <div className={styles.navFooter}>
          <NavLink to="/settings" className={navClass}>
            <span className={styles.linkIcon}>
              <IconSettings />
            </span>
            <span className={styles.linkLabel}>{t('nav.settings')}</span>
          </NavLink>

          {version ? (
            <NavLink
              to="/changelog"
              className={({ isActive }) =>
                isActive ? `${styles.versionBtn} ${styles.versionBtnActive}` : styles.versionBtn
              }
              title={t('changelog.openHint')}
            >
              <span className={styles.versionLabel}>{t('nav.version')}</span>
              <span className={styles.versionValue}>v{version}</span>
            </NavLink>
          ) : null}
        </div>
      </aside>
      <main className={flushMain ? styles.mainFlush : styles.main}>
        <Outlet />
      </main>

      {createOpen ? (
        <CreateAgentModal
          onClose={() => setCreateOpen(false)}
          onCreated={(agent) => {
            setAgents(listAgents())
            setCreateOpen(false)
            void navigate(`/?agent=${encodeURIComponent(agent.id)}`)
          }}
        />
      ) : null}

      {editingAgent ? (
        <CreateAgentModal
          editing={editingAgent}
          onClose={() => setEditingAgent(null)}
          onUpdated={(agent) => {
            setAgents(listAgents())
            setEditingAgent(null)
            void navigate(`/?agent=${encodeURIComponent(agent.id)}`)
          }}
        />
      ) : null}
    </div>
  )
}

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? `${styles.link} ${styles.linkActive}` : styles.link
}
