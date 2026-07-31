import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  IconBook,
  IconChatBubble,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconFortune,
  IconGrid,
  IconImage,
  IconKey,
  IconMcp,
  IconMic,
  IconMusic,
  IconPaperclip,
  IconPlus,
  IconResearch,
  IconSearch,
  IconSend,
  IconSkill,
  IconSparkles,
  IconStocks,
  IconTranslate,
  IconVideo,
  IconWrite,
  IconTrash,
} from '@renderer/shared/ui/icons'
import {
  agentDisplayDesc,
  agentDisplayName,
  getAgent,
  listAgents,
  type AgentDef,
  type AgentId,
} from '@renderer/features/agents/lib/agentRegistry'
import { CreateAgentModal } from '@renderer/features/agents/components/CreateAgentModal'
import {
  splitWorkbenchCapabilities,
  type WorkbenchCapabilityId,
} from '../lib/capabilities'
import {
  appendMessage,
  createSession,
  deleteSession,
  getActiveSessionId,
  getSession,
  listMessages,
  listSessions,
  setActiveSessionId,
  type WorkbenchMessage,
  type WorkbenchSession,
} from '../lib/sessionStore'
import styles from './WorkbenchPage.module.css'

const PANEL_KEY = 'qiankun.workbench.sessionPanelOpen'

interface WorkbenchAttachment {
  id: string
  name: string
  size: number
  mime: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function readPanelOpen(): boolean {
  try {
    const raw = localStorage.getItem(PANEL_KEY)
    if (raw === null) return true
    return raw === '1'
  } catch {
    return true
  }
}

function agentIcon(agent: AgentDef): React.JSX.Element {
  if (agent.id === 'fortune') return <IconFortune />
  if (agent.id === 'stocks') return <IconStocks />
  return <IconSparkles />
}

function capabilityIcon(id: WorkbenchCapabilityId): ReactNode {
  switch (id) {
    case 'upload':
      return <IconPaperclip />
    case 'knowledge':
      return <IconBook />
    case 'mcp':
      return <IconMcp />
    case 'skills':
      return <IconSkill />
    case 'image':
      return <IconImage />
    case 'write':
      return <IconWrite />
    case 'translate':
      return <IconTranslate />
    case 'video':
      return <IconVideo />
    case 'music':
      return <IconMusic />
    case 'transcribe':
      return <IconMic />
    case 'research':
      return <IconResearch />
    default:
      return <IconGrid />
  }
}

export function WorkbenchPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [panelOpen, setPanelOpen] = useState(readPanelOpen)
  const [agents, setAgents] = useState<AgentDef[]>(() => listAgents())
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    fortune: true,
    stocks: true,
  })
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeAgent, setActiveAgent] = useState<AgentId>('fortune')
  const [createOpen, setCreateOpen] = useState(false)
  const [sessions, setSessions] = useState<WorkbenchSession[]>([])
  const [messages, setMessages] = useState<WorkbenchMessage[]>([])
  const [draft, setDraft] = useState('')
  const [activeCap, setActiveCap] = useState<WorkbenchCapabilityId | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [morePos, setMorePos] = useState<{ left: number; bottom: number } | null>(null)
  const [attachments, setAttachments] = useState<WorkbenchAttachment[]>([])
  const moreRef = useRef<HTMLDivElement>(null)
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [providerName, setProviderName] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const refreshAgents = (): void => {
    const next = listAgents()
    setAgents(next)
    setExpanded((prev) => {
      const merged = { ...prev }
      for (const agent of next) {
        if (merged[agent.id] === undefined) merged[agent.id] = false
      }
      return merged
    })
  }

  const refresh = (preferSessionId?: string | null): void => {
    const all = listSessions()
    setSessions(all)
    const nextId = preferSessionId ?? getActiveSessionId() ?? all[0]?.id ?? null
    setActiveId(nextId)
    if (nextId) {
      setActiveSessionId(nextId)
      const session = getSession(nextId)
      if (session) setActiveAgent(session.agentId)
      setMessages(listMessages(nextId))
    } else {
      setMessages([])
    }
  }

  useEffect(() => {
    refresh()
    refreshAgents()
    const applyAiSettings = (fortune: {
      aiModels?: string[]
      aiModel?: string
      aiProviderName?: string
      aiApiKey?: string
    } | undefined): void => {
      const models = (fortune?.aiModels ?? []).map((m) => m.trim()).filter(Boolean)
      setModelOptions(models)
      const selected =
        fortune?.aiModel && models.includes(fortune.aiModel)
          ? fortune.aiModel
          : (models[0] ?? '')
      setSelectedModel(selected)
      setProviderName(fortune?.aiProviderName || '')
      setHasApiKey(Boolean(fortune?.aiApiKey?.trim()))
    }

    const loadAi = (): void => {
      void window.treasureChest.getSettingsSnapshot().then((snap) => {
        applyAiSettings(snap.fortune)
      })
    }

    loadAi()
    const onFocus = (): void => loadAi()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    const agentId = searchParams.get('agent')
    if (!agentId) return
    if (!getAgent(agentId)) return
    setActiveAgent(agentId)
    setExpanded((prev) => ({ ...prev, [agentId]: true }))
    setPanelOpen(true)
  }, [searchParams])

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_KEY, panelOpen ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [panelOpen])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, activeId])

  const togglePanel = (): void => setPanelOpen((v) => !v)

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  )

  const activeAgentDef = getAgent(activeAgent) ?? agents[0] ?? listAgents()[0]!
  const activeAgentName = agentDisplayName(activeAgentDef, t)

  const selectAgent = (agentId: AgentId): void => {
    setActiveAgent(agentId)
    setExpanded((prev) => ({ ...prev, [agentId]: true }))
    setSearchParams({ agent: agentId }, { replace: true })
  }

  const filteredSessions = (agentId: AgentId): WorkbenchSession[] => {
    const q = query.trim().toLowerCase()
    return sessions.filter((s) => {
      if (s.agentId !== agentId) return false
      if (!q) return true
      return s.title.toLowerCase().includes(q)
    })
  }

  const ensureSession = (agentId: AgentId): string => {
    if (activeSession && activeSession.agentId === agentId) return activeSession.id
    const title = i18n.language.startsWith('zh') ? '新会话' : 'New chat'
    const created = createSession(agentId, title)
    refresh(created.id)
    return created.id
  }

  const onNewSession = (agentId: AgentId): void => {
    const title = i18n.language.startsWith('zh') ? '新会话' : 'New chat'
    const created = createSession(agentId, title)
    setExpanded((prev) => ({ ...prev, [agentId]: true }))
    selectAgent(agentId)
    refresh(created.id)
    inputRef.current?.focus()
  }

  const onSelectSession = (id: string): void => {
    setActiveSessionId(id)
    refresh(id)
  }

  const onDeleteSession = (id: string): void => {
    deleteSession(id)
    refresh()
  }

  const sendText = (text: string): void => {
    const content = text.trim()
    if (!content && attachments.length === 0) return
    const sessionId = ensureSession(activeAgent)
    const fileLine =
      attachments.length > 0
        ? `\n${t('workbench.attachedFiles', { files: attachments.map((a) => a.name).join('、') })}`
        : ''
    const modelLine = selectedModel ? `\n[${providerName || 'AI'} · ${selectedModel}]` : ''
    appendMessage(sessionId, 'user', `${content}${fileLine}`.trim())
    appendMessage(
      sessionId,
      'assistant',
      t('workbench.placeholderReply', { agent: activeAgentName }) + modelLine,
    )
    setDraft('')
    setAttachments([])
    refresh(sessionId)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendText(draft)
    }
  }

  const onCapability = (id: WorkbenchCapabilityId): void => {
    setActiveCap(id)
    setMoreOpen(false)
    if (id === 'upload') {
      fileRef.current?.click()
      return
    }
    if (id === 'knowledge') {
      inputRef.current?.focus()
      setDraft((prev) => (prev.includes('@知识库') || prev.includes('@knowledge') ? prev : `${prev}${prev ? ' ' : ''}@知识库 `))
      return
    }
    const sessionId = ensureSession(activeAgent)
    appendMessage(sessionId, 'system', t('workbench.capSoon', { name: t(`workbench.cap.${id}`) }))
    refresh(sessionId)
  }

  useEffect(() => {
    if (!moreOpen) {
      setMorePos(null)
      return
    }
    const updatePos = (): void => {
      const el = moreRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setMorePos({
        left: Math.max(8, rect.left),
        bottom: Math.max(8, window.innerHeight - rect.top + 8),
      })
    }
    updatePos()
    const onDoc = (e: MouseEvent): void => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    window.addEventListener('resize', updatePos)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', updatePos)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  const onFilesPicked = (files: FileList | null): void => {
    if (!files?.length) return
    const next = Array.from(files).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.name}`,
      name: f.name,
      size: f.size,
      mime: f.type || 'application/octet-stream',
    }))
    setAttachments((prev) => [...prev, ...next].slice(0, 8))
    setActiveCap('upload')
  }

  const onRemoveAttachment = (id: string): void => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const onModelChange = async (model: string): Promise<void> => {
    setSelectedModel(model)
    try {
      const next = await window.treasureChest.setFortuneSettings({ aiModel: model })
      const models = (next.aiModels ?? []).map((m) => m.trim()).filter(Boolean)
      setModelOptions(models)
      setSelectedModel(models.includes(next.aiModel) ? next.aiModel : (models[0] ?? ''))
      setHasApiKey(Boolean(next.aiApiKey?.trim()))
    } catch {
      /* ignore */
    }
  }

  const quickPrompts =
    activeAgent === 'fortune'
      ? ['workbench.chip.fortune1', 'workbench.chip.fortune2', 'workbench.chip.fortune3']
      : activeAgent === 'stocks'
        ? ['workbench.chip.stocks1', 'workbench.chip.stocks2', 'workbench.chip.stocks3']
        : ['workbench.chip.custom1', 'workbench.chip.custom2', 'workbench.chip.custom3']

  const { primary: primaryCaps, overflow: overflowCaps } = splitWorkbenchCapabilities()

  const renderCapButton = (cap: (typeof primaryCaps)[number], compact = false): ReactNode => (
    <button
      key={cap.id}
      type="button"
      className={`${styles.capItem} ${compact ? styles.capItemMenu : ''} ${
        activeCap === cap.id ? styles.capItemActive : ''
      }`}
      onClick={() => onCapability(cap.id)}
      title={
        cap.status === 'soon' ? t('workbench.capSoonHint', { name: t(cap.labelKey) }) : t(cap.labelKey)
      }
    >
      <span className={styles.capIcon}>{capabilityIcon(cap.id)}</span>
      <span>{t(cap.labelKey)}</span>
    </button>
  )

  return (
    <div className={`${styles.page} ${panelOpen ? '' : styles.pageCollapsed}`.trim()}>
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          onFilesPicked(e.target.files)
          e.target.value = ''
        }}
      />

      <aside className={`${styles.agentPane} ${panelOpen ? '' : styles.agentPaneCollapsed}`.trim()}>
        {panelOpen ? (
          <>
            <div className={styles.panelTop}>
              <span className={styles.panelTitle}>{t('workbench.sessionHistory')}</span>
              <button
                type="button"
                className={styles.iconGhost}
                title={t('workbench.collapseSessions')}
                aria-label={t('workbench.collapseSessions')}
                onClick={togglePanel}
              >
                <IconChevronLeft />
              </button>
            </div>

            <label className={styles.searchWrap}>
              <IconSearch />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('workbench.searchSessions')}
              />
            </label>

            <div className={styles.agentList}>
              {agents.map((agent) => {
                const open = expanded[agent.id]
                const list = filteredSessions(agent.id)
                const name = agentDisplayName(agent, t)
                const desc = agentDisplayDesc(agent, t)
                return (
                  <section key={agent.id} className={styles.agentBlock}>
                    <div className={styles.agentRow}>
                      <button
                        type="button"
                        className={styles.agentSelect}
                        onClick={() => selectAgent(agent.id)}
                      >
                        <span className={`${styles.agentIcon} ${styles[`agentIcon_${agent.tone}`]}`}>
                          {agentIcon(agent)}
                        </span>
                        <span className={styles.agentMeta}>
                          <span className={styles.agentName}>{name}</span>
                          <span className={styles.agentDesc}>{desc || t('agents.noDescription')}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={styles.iconGhost}
                        title={t('workbench.newSession')}
                        aria-label={t('workbench.newSession')}
                        onClick={() => onNewSession(agent.id)}
                      >
                        <IconPlus />
                      </button>
                      <button
                        type="button"
                        className={styles.iconGhost}
                        aria-label={open ? t('workbench.collapse') : t('workbench.expand')}
                        onClick={() =>
                          setExpanded((prev) => ({ ...prev, [agent.id]: !prev[agent.id] }))
                        }
                      >
                        <IconChevronDown
                          style={{
                            transform: open ? 'rotate(180deg)' : undefined,
                            transition: '0.15s',
                          }}
                        />
                      </button>
                    </div>

                    {open ? (
                      <div className={styles.sessionList}>
                        {list.length === 0 ? (
                          <button
                            type="button"
                            className={styles.sessionItem}
                            onClick={() => onNewSession(agent.id)}
                          >
                            <span className={styles.sessionTitle}>{t('workbench.startSession')}</span>
                          </button>
                        ) : (
                          list.map((session) => (
                            <div key={session.id} className={styles.sessionRow}>
                              <button
                                type="button"
                                className={`${styles.sessionItem} ${
                                  session.id === activeId ? styles.sessionItemActive : ''
                                }`}
                                onClick={() => onSelectSession(session.id)}
                              >
                                <span className={styles.sessionTitle}>{session.title}</span>
                              </button>
                              <button
                                type="button"
                                className={styles.iconGhost}
                                title={t('workbench.deleteSession')}
                                aria-label={t('workbench.deleteSession')}
                                onClick={() => onDeleteSession(session.id)}
                              >
                                <IconTrash />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </section>
                )
              })}
              <button
                type="button"
                className={styles.addAgentRow}
                onClick={() => setCreateOpen(true)}
              >
                <IconPlus />
                {t('nav.addAgent')}
              </button>
            </div>
          </>
        ) : (
          <div className={styles.collapsedRail}>
            <button
              type="button"
              className={styles.expandRailBtn}
              title={t('workbench.expandSessions')}
              aria-label={t('workbench.expandSessions')}
              onClick={togglePanel}
            >
              <IconChevronRight />
            </button>
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                className={`${styles.railAgent} ${styles[`agentIcon_${agent.tone}`]} ${
                  activeAgent === agent.id ? styles.railAgentActive : ''
                }`}
                title={agentDisplayName(agent, t)}
                aria-label={agentDisplayName(agent, t)}
                onClick={() => {
                  selectAgent(agent.id)
                  setPanelOpen(true)
                }}
              >
                {agentIcon(agent)}
              </button>
            ))}
            <button
              type="button"
              className={styles.railAgent}
              title={t('nav.addAgent')}
              aria-label={t('nav.addAgent')}
              onClick={() => setCreateOpen(true)}
            >
              <IconPlus />
            </button>
          </div>
        )}
      </aside>

      <section className={styles.chatPane}>
        <header className={styles.chatHead}>
          <div className={styles.headLeft}>
            {!panelOpen ? (
              <button
                type="button"
                className={styles.panelToggle}
                title={t('workbench.expandSessions')}
                aria-label={t('workbench.expandSessions')}
                onClick={togglePanel}
              >
                <IconChevronRight />
                <span>{t('workbench.sessionHistory')}</span>
              </button>
            ) : null}
            <div className={styles.breadcrumb}>
              <strong>{activeAgentName}</strong>
              <span className={styles.crumbSep}>›</span>
              <span>{activeSession?.title ?? t('workbench.newSession')}</span>
            </div>
          </div>
          <div className={styles.headActions}>
            {panelOpen ? (
              <button
                type="button"
                className={styles.chipLink}
                title={t('workbench.collapseSessions')}
                onClick={togglePanel}
              >
                <IconChevronLeft />
                {t('workbench.collapseSessions')}
              </button>
            ) : null}
            {activeAgentDef.classicPath ? (
              <Link className={styles.chipLink} to={activeAgentDef.classicPath}>
                {t('workbench.openClassic')}
              </Link>
            ) : null}
            <Link className={styles.chipLink} to="/settings">
              <IconKey />
              {t('workbench.modelSettings')}
            </Link>
          </div>
        </header>

        <div className={styles.messages}>
          {messages.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyMark}>
                <IconChatBubble />
              </div>
              <h1 className={styles.emptyTitle}>{activeAgentName}</h1>
              <p className={styles.emptySub}>
                {t('workbench.welcome', { agent: activeAgentName })}
              </p>
              <div className={styles.chips}>
                {quickPrompts.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={styles.chip}
                    onClick={() => sendText(t(key))}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.msgList}>
              {messages.map((msg) => {
                if (msg.role === 'system') {
                  return (
                    <div key={msg.id} className={styles.bubbleRow}>
                      <div className={`${styles.bubble} ${styles.bubbleSystem}`}>{msg.content}</div>
                    </div>
                  )
                }
                const rowClass =
                  msg.role === 'user' ? styles.bubbleRowUser : styles.bubbleRowAssistant
                const bubbleClass = msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant
                return (
                  <div key={msg.id} className={`${styles.bubbleRow} ${rowClass}`}>
                    <div className={`${styles.bubble} ${bubbleClass}`}>{msg.content}</div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className={styles.composerWrap}>
          <div className={styles.composer}>
            {attachments.length > 0 ? (
              <div className={styles.attachRow}>
                {attachments.map((file) => (
                  <div key={file.id} className={styles.attachCard}>
                    <span className={styles.attachIcon} aria-hidden>
                      <IconPaperclip />
                    </span>
                    <span className={styles.attachMeta}>
                      <span className={styles.attachName} title={file.name}>
                        {file.name}
                      </span>
                      <span className={styles.attachSize}>{formatFileSize(file.size)}</span>
                    </span>
                    <button
                      type="button"
                      className={styles.attachRemove}
                      aria-label={t('workbench.removeAttachment')}
                      title={t('workbench.removeAttachment')}
                      onClick={() => onRemoveAttachment(file.id)}
                    >
                      <IconClose />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              ref={inputRef}
              className={styles.composerInput}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('workbench.inputPlaceholder')}
              rows={2}
            />
            <div className={styles.composerBar} role="toolbar" aria-label={t('workbench.capabilities')}>
              <div className={styles.composerLeft}>
                {primaryCaps.map((cap) => renderCapButton(cap))}
                {overflowCaps.length > 0 ? (
                  <div className={styles.moreWrap} ref={moreRef}>
                    <button
                      type="button"
                      className={`${styles.capItem} ${moreOpen ? styles.capItemActive : ''}`}
                      aria-expanded={moreOpen}
                      aria-haspopup="menu"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        setMoreOpen((v) => {
                          const next = !v
                          if (next && moreRef.current) {
                            const rect = moreRef.current.getBoundingClientRect()
                            setMorePos({
                              left: Math.max(8, rect.left),
                              bottom: Math.max(8, window.innerHeight - rect.top + 8),
                            })
                          } else {
                            setMorePos(null)
                          }
                          return next
                        })
                      }}
                      title={t('workbench.cap.more')}
                    >
                      <span className={styles.capIcon}>
                        <IconGrid />
                      </span>
                      <span>{t('workbench.cap.more')}</span>
                    </button>
                    {moreOpen && morePos ? (
                      <div
                        className={styles.moreMenu}
                        role="menu"
                        style={{ left: morePos.left, bottom: morePos.bottom }}
                      >
                        {overflowCaps.map((cap) => renderCapButton(cap, true))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className={styles.composerRight}>
                {modelOptions.length > 0 ? (
                  <label className={styles.modelSelectWrap}>
                    <select
                      className={styles.modelSelect}
                      value={selectedModel}
                      onChange={(e) => void onModelChange(e.target.value)}
                      title={t('workbench.selectModel')}
                    >
                      {modelOptions.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <Link className={styles.modelPill} to="/settings">
                    {t('workbench.configureModel')}
                  </Link>
                )}
                {modelOptions.length > 0 && !hasApiKey ? (
                  <Link className={styles.keyWarn} to="/settings">
                    {t('workbench.missingApiKey')}
                  </Link>
                ) : null}
                <button
                  type="button"
                  className={styles.sendBtn}
                  disabled={!draft.trim() && attachments.length === 0}
                  onClick={() => sendText(draft)}
                  aria-label={t('workbench.send')}
                >
                  <IconSend />
                </button>
              </div>
            </div>
          </div>
          <p className={styles.hint}>{t('workbench.inputHint')}</p>
        </div>
      </section>

      {createOpen ? (
        <CreateAgentModal
          onClose={() => setCreateOpen(false)}
          onCreated={(agent) => {
            refreshAgents()
            setCreateOpen(false)
            selectAgent(agent.id)
            onNewSession(agent.id)
          }}
        />
      ) : null}
    </div>
  )
}
