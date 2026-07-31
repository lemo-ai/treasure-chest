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
import { ChangelogModal } from './ChangelogModal'
import styles from './AppLayout.module.css'

function agentNavIcon(agent: AgentDef): ReactNode {
  if (agent.id === 'fortune') return <IconFortune />
  if (agent.id === 'stocks') return <IconStocks />
  return <IconSkill />
}

export function AppLayout(): React.JSX.Element {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [version, setVersion] = useState('')
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [agents, setAgents] = useState<AgentDef[]>(() => listAgents())
  const flushMain =
    location.pathname === '/' ||
    location.pathname.startsWith('/workbench') ||
    location.pathname.startsWith('/knowledge') ||
    location.pathname.startsWith('/settings')

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
  }, [location.pathname, location.search, createOpen])

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
              <NavLink
                key={agent.id}
                to={to}
                className={() => (isActive ? `${styles.link} ${styles.linkActive}` : styles.link)}
              >
                <span className={styles.linkIcon}>{agentNavIcon(agent)}</span>
                <span className={styles.linkLabel}>{agentDisplayName(agent, t)}</span>
              </NavLink>
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
        </nav>

        <div className={styles.navFooter}>
          <NavLink to="/settings" className={navClass}>
            <span className={styles.linkIcon}>
              <IconSettings />
            </span>
            <span className={styles.linkLabel}>{t('nav.settings')}</span>
          </NavLink>

          {version ? (
            <button
              type="button"
              className={styles.versionBtn}
              onClick={() => setChangelogOpen(true)}
              title={t('changelog.openHint')}
            >
              <span className={styles.versionLabel}>{t('nav.version')}</span>
              <span className={styles.versionValue}>v{version}</span>
            </button>
          ) : null}
        </div>
      </aside>
      <main className={flushMain ? styles.mainFlush : styles.main}>
        <Outlet />
      </main>

      {changelogOpen ? (
        <ChangelogModal version={version} onClose={() => setChangelogOpen(false)} />
      ) : null}

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
    </div>
  )
}

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? `${styles.link} ${styles.linkActive}` : styles.link
}
