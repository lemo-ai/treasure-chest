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
import { ProjectModal } from '@renderer/features/projects/components/ProjectModal'
import {
  archiveProject,
  getActiveProjectIdSync,
  hydrateProjects,
  listProjectsSync,
  onProjectsChanged,
  setActiveProject,
} from '@renderer/features/projects/lib/projectStore'
import type { Project } from '@shared'
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
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)

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
    const sync = (): void => {
      setProjects(listProjectsSync(false))
      setActiveProjectIdState(getActiveProjectIdSync())
    }
    void hydrateProjects().then(sync)
    return onProjectsChanged(sync)
  }, [])

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

  const activateProject = async (id: string | null): Promise<void> => {
    const next = await setActiveProject(id)
    setActiveProjectIdState(next)
    const project = next ? projects.find((p) => p.id === next) ?? null : null
    if (project?.defaultAgentId) {
      void navigate(`/?agent=${encodeURIComponent(project.defaultAgentId)}`)
    } else if (onWorkbench) {
      // stay; workbench will refilter sessions
      window.dispatchEvent(new Event('qiankun-projects-changed'))
    }
  }

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

          <div className={styles.sectionLabel}>{t('nav.sectionProjects')}</div>
          <button
            type="button"
            className={
              activeProjectId === null
                ? `${styles.link} ${styles.linkActive} ${styles.projectBtn}`
                : `${styles.link} ${styles.projectBtn}`
            }
            onClick={() => void activateProject(null)}
          >
            <span className={styles.linkLabel}>{t('projects.none')}</span>
          </button>
          {projects.length === 0 ? (
            <p className={styles.sectionHint}>{t('projects.emptyHint')}</p>
          ) : null}
          {projects.map((project) => {
            const isActive = activeProjectId === project.id
            return (
              <div key={project.id} className={styles.agentRow}>
                <button
                  type="button"
                  className={
                    isActive
                      ? `${styles.link} ${styles.linkActive} ${styles.projectBtn}`
                      : `${styles.link} ${styles.projectBtn}`
                  }
                  onClick={() => void activateProject(project.id)}
                  title={project.workDir || project.name}
                >
                  <span className={styles.linkLabel}>{project.name}</span>
                </button>
                <span className={styles.agentActions}>
                  <button
                    type="button"
                    className={styles.agentEditBtn}
                    title={t('projects.edit')}
                    aria-label={t('projects.edit')}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setEditingProject(project)
                      setProjectModalOpen(true)
                    }}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className={`${styles.agentEditBtn} ${styles.agentDeleteBtn}`}
                    title={t('projects.archive')}
                    aria-label={t('projects.archive')}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (!window.confirm(t('projects.archiveConfirm'))) return
                      void archiveProject(project.id, true).then(() => {
                        if (activeProjectId === project.id) void activateProject(null)
                      })
                    }}
                  >
                    ×
                  </button>
                </span>
              </div>
            )
          })}
          <button
            type="button"
            className={styles.addAgentBtn}
            onClick={() => {
              setEditingProject(null)
              setProjectModalOpen(true)
            }}
          >
            <span className={styles.linkIcon}>
              <IconPlus />
            </span>
            <span className={styles.linkLabel}>{t('nav.addProject')}</span>
          </button>

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
          onUpdated={() => {
            setAgents(listAgents())
            setEditingAgent(null)
          }}
          onDeleted={(agentId) => {
            setAgents(listAgents())
            setEditingAgent(null)
            if (activeAgentParam === agentId) void navigate('/')
          }}
        />
      ) : null}

      <ProjectModal
        open={projectModalOpen}
        project={editingProject}
        onClose={() => {
          setProjectModalOpen(false)
          setEditingProject(null)
        }}
        onSaved={(saved) => {
          setProjects(listProjectsSync(false))
          if (!editingProject) void activateProject(saved.id)
        }}
      />
      <InboxToastHost />
    </div>
  )
}

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? `${styles.link} ${styles.linkActive}` : styles.link
}
