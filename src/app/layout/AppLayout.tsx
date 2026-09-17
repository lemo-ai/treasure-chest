import { useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  IconBook,
  IconBell,
  IconCalendar,
  IconClock,
  IconPlus,
  IconSettings,
  IconTools,
  IconWorkbench,
} from '@renderer/shared/ui/icons'
import appLogo from '@renderer/assets/app-logo.png'
import {
  agentDisplayName,
  deleteAgent,
  isDirectChatId,
  listAgents,
  type AgentDef,
} from '@renderer/features/agents/lib/agentRegistry'
import { AgentAvatar } from '@renderer/features/agents/components/AgentAvatar'
import { CreateAgentModal } from '@renderer/features/agents/components/CreateAgentModal'
import { InboxToastHost } from '@renderer/features/notifications/components/InboxToastHost'
import { useTheme } from '@renderer/shared/hooks/useTheme'
import styles from './AppLayout.module.css'

export function AppLayout(): React.JSX.Element {
  useTheme()
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const flushMain =
    location.pathname === '/' ||
    location.pathname.startsWith('/workbench') ||
    location.pathname.startsWith('/knowledge') ||
    location.pathname.startsWith('/schedules') ||
    location.pathname.startsWith('/notifications') ||
    location.pathname.startsWith('/settings') ||
    location.pathname.startsWith('/changelog') ||
    location.pathname.startsWith('/tools/image') ||
    location.pathname.startsWith('/tools/video') ||
    location.pathname.startsWith('/tools/audio') ||
    location.pathname.startsWith('/tools/doc')

  const activeAgentParam = new URLSearchParams(location.search).get('agent')
  const onWorkbench =
    location.pathname === '/' || location.pathname.startsWith('/workbench')
  const workbenchActive =
    onWorkbench && (activeAgentParam === null || isDirectChatId(activeAgentParam))

  const [version, setVersion] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentDef | null>(null)
  const [agents, setAgents] = useState<AgentDef[]>(() => listAgents())
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    void window.treasureChest.getVersion().then(setVersion)
  }, [])

  useEffect(() => {
    setAgents(listAgents())
    const onChanged = (): void => setAgents(listAgents())
    window.addEventListener('qiankun-agents-changed', onChanged)
    return () => window.removeEventListener('qiankun-agents-changed', onChanged)
  }, [location.pathname, location.search, createOpen, editingAgent])

  useEffect(() => {
    const refreshUnread = (): void => {
      void window.treasureChest.getInboxSnapshot().then((snap) => setUnread(snap.unreadCount))
    }
    refreshUnread()
    const offAppend = window.treasureChest.onInboxAppended(() => refreshUnread())
    const offOpen = window.treasureChest.onInboxOpen((payload) => {
      navigate(`/notifications?id=${encodeURIComponent(payload.id)}`)
      refreshUnread()
    })
    return () => {
      offAppend()
      offOpen()
    }
  }, [navigate, location.pathname])

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
                  <span className={styles.linkIcon}>
                    <AgentAvatar agent={agent} size="sm" fallback="skill" />
                  </span>
                  <span className={styles.linkLabel}>{agentDisplayName(agent, t)}</span>
                </NavLink>
                <span className={styles.agentActions}>
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
                  {!agent.builtin ? (
                    <button
                      type="button"
                      className={`${styles.agentEditBtn} ${styles.agentDeleteBtn}`}
                      title={t('agents.delete.action')}
                      aria-label={t('agents.delete.action')}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (!window.confirm(t('agents.delete.confirm'))) return
                        if (!deleteAgent(String(agent.id))) return
                        setAgents(listAgents())
                        if (activeAgentParam === agent.id) {
                          void navigate('/')
                        }
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
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

          <NavLink to="/schedules" className={navClass}>
            <span className={styles.linkIcon}>
              <IconClock />
            </span>
            <span className={styles.linkLabel}>{t('nav.schedules')}</span>
          </NavLink>

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
          <NavLink to="/notifications" className={navClass}>
            <span className={styles.linkIcon}>
              <IconBell />
              {unread > 0 ? (
                <span className={styles.badge}>{unread > 99 ? '99+' : unread}</span>
              ) : null}
            </span>
            <span className={styles.linkLabel}>{t('nav.notifications')}</span>
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
          onDeleted={(agentId) => {
            setAgents(listAgents())
            setEditingAgent(null)
            if (activeAgentParam === agentId) void navigate('/')
          }}
        />
      ) : null}

      <InboxToastHost />
    </div>
  )
}

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? `${styles.link} ${styles.linkActive}` : styles.link
}
