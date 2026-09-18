import type { SessionEvent } from '@shared'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  IconBook,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconGrid,
  IconGlobe,
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
  IconTranslate,
  IconVideo,
  IconWrite,
  IconTrash,
} from '@renderer/shared/ui/icons'
import {
  DIRECT_CHAT_DEF,
  DIRECT_CHAT_ID,
  agentDisplayName,
  getAgent,
  isDirectChatId,
  type AgentDef,
  type AgentId,
} from '@renderer/features/agents/lib/agentRegistry'
import { AgentAvatar } from '@renderer/features/agents/components/AgentAvatar'
import { AgentSpecCard } from '@renderer/features/agents/components/AgentSpecCard'
import { UserAvatar } from '@renderer/features/agents/components/UserAvatar'
import { parseAgentSpec } from '@renderer/features/agents/lib/parseAgentSpec'
import {
  WORKBENCH_CAPABILITIES,
  WORKBENCH_PRIMARY_CAP_IDS,
  splitWorkbenchCapabilities,
  type WorkbenchCapability,
  type WorkbenchCapabilityId,
} from '../lib/capabilities'
import { WORKBENCH_SKILLS } from '../lib/capabilityModes'
import {
  CAPABILITY_OPTION_GROUPS,
  DEFAULT_CAP_OPTIONS,
  buildCapabilityOptionsPrompt,
  imageSizeFromOptions,
  type CapOptionGroupId,
  type CapOptionValues,
} from '../lib/capabilityOptions'
import {
  decodeChatModelRef,
  encodeChatModelRef,
  groupedChatModels,
  resolveMediaRouteModel,
} from '../lib/chatModelOptions'
import type {
  FortuneAiProviderConfig,
  KnowledgeCitation,
  LlmToolStep,
  MediaCapabilitiesSnapshot,
  MediaCapabilityKind,
  MediaSupportLevel,
} from '@shared'

type InstalledSkillRow = {
  id: string
  name: string
  description: string
  source: string
  prompt: string
}
import {
  appendMessage,
  createSession,
  deleteSession,
  forkSession,
  getActiveSessionIdForAgent,
  getSession,
  hydrateSessionStore,
  listMessages,
  listSessions,
  setActiveSessionId,
  syncFromHarness,
  reloadHarnessStore,
  type WorkbenchMessage,
  type WorkbenchSession,
} from '../lib/sessionStore'
import { MarkdownMessage } from '../components/MarkdownMessage'
import { ThinkingIndicator } from '../components/ThinkingIndicator'
import { ArtifactsPanel } from '../components/ArtifactsPanel'
import { MemoryPanel } from '../components/MemoryPanel'
import { agentChatToolFlags } from '../lib/agentChatToolFlags'
import { TrajectoryPanel } from '../components/TrajectoryPanel'
import { TerminalPanel } from '../components/TerminalPanel'
import { ToolApprovalModal } from '../components/ToolApprovalModal'
import {
  clearSessionArtifacts,
  deleteArtifact,
  extractArtifactsFromContent,
  listArtifacts,
  type WorkbenchArtifact,
} from '../lib/artifactStore'
import { memoryFactsForPrompt } from '../lib/agentMemoryStore'
import {
  WORKFLOW_DEFS,
  type WorkflowId,
  type WorkflowStepState,
} from '../lib/workflows'
import { WorkflowStepsCard } from '../components/WorkflowStepsCard'
import type { ToolApprovalRequest } from '@shared'
import styles from './WorkbenchPage.module.css'

const PANEL_KEY = 'qiankun.workbench.sessionPanelOpen'
const WEB_SEARCH_KEY = 'qiankun.workbench.webSearch'

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

function isLocalLlmBaseUrl(baseUrl: string): boolean {
  const raw = baseUrl.trim().toLowerCase()
  if (!raw) return false
  try {
    const host = new URL(raw).hostname.toLowerCase()
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local')
    )
  } catch {
    return (
      raw.includes('localhost') ||
      raw.includes('127.0.0.1') ||
      raw.includes('0.0.0.0') ||
      raw.includes('[::1]')
    )
  }
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

function readWebSearchOn(): boolean {
  try {
    const raw = localStorage.getItem(WEB_SEARCH_KEY)
    if (raw === null) return true
    return raw === '1'
  } catch {
    return true
  }
}

function agentIcon(agent: AgentDef): React.JSX.Element {
  return <AgentAvatar agent={agent} size="lg" fallback="sparkles" />
}

function capabilityIcon(id: WorkbenchCapabilityId): ReactNode {
  switch (id) {
    case 'websearch':
      return <IconGlobe />
    case 'upload':
      return <IconPaperclip />
    case 'knowledge':
      return <IconBook />
    case 'mcp':
      return <IconMcp />
    case 'skills':
      return <IconSkill />
    case 'create_agent':
      return <IconSparkles />
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
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [panelOpen, setPanelOpen] = useState(readPanelOpen)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeAgent, setActiveAgent] = useState<AgentId>(DIRECT_CHAT_ID)
  const [sessions, setSessions] = useState<WorkbenchSession[]>([])
  const [messages, setMessages] = useState<WorkbenchMessage[]>([])
  const [draft, setDraft] = useState('')
  const [activeCap, setActiveCap] = useState<WorkbenchCapabilityId | null>(null)
  const [webSearchOn, setWebSearchOn] = useState(readWebSearchOn)
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null)
  const [skillPickerOpen, setSkillPickerOpen] = useState(false)
  const [streamCitations, setStreamCitations] = useState<KnowledgeCitation[]>([])
  const [streamToolSteps, setStreamToolSteps] = useState<LlmToolStep[]>([])
  const [artifactsOpen, setArtifactsOpen] = useState(false)
  const [artifacts, setArtifacts] = useState<WorkbenchArtifact[]>([])
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [trajectoryOpen, setTrajectoryOpen] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [trajectoryTick, setTrajectoryTick] = useState(0)
  const [terminalTick, setTerminalTick] = useState(0)
  const [liveSessionEvents, setLiveSessionEvents] = useState<SessionEvent[]>([])
  const [pendingApproval, setPendingApproval] = useState<ToolApprovalRequest | null>(null)
  const pendingApprovalBySessionRef = useRef<Map<string, ToolApprovalRequest>>(new Map())
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepState[]>([])
  const [workflowTitle, setWorkflowTitle] = useState('')
  const [armedWorkflow, setArmedWorkflow] = useState<WorkflowId | null>(null)
  const [installedSkills, setInstalledSkills] = useState<InstalledSkillRow[]>([])
  const [skillCatalogs, setSkillCatalogs] = useState<
    Array<{ id: string; name: string; url: string; hint: string }>
  >([])
  const [moreOpen, setMoreOpen] = useState(false)
  const [morePos, setMorePos] = useState<{ left: number; bottom: number } | null>(null)
  const [attachments, setAttachments] = useState<WorkbenchAttachment[]>([])
  const moreRef = useRef<HTMLDivElement>(null)
  const composerBarRef = useRef<HTMLDivElement>(null)
  const composerRightRef = useRef<HTMLDivElement>(null)
  const capMeasureRef = useRef<HTMLDivElement>(null)
  const [inlinePrimaryCount, setInlinePrimaryCount] = useState(WORKBENCH_PRIMARY_CAP_IDS.length)
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [modelGroups, setModelGroups] = useState<Array<{ id: string; name: string; models: string[] }>>([])
  const [aiProviders, setAiProviders] = useState<FortuneAiProviderConfig[]>([])
  const [activeProviderId, setActiveProviderId] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [aiBaseUrl, setAiBaseUrl] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [mediaCaps, setMediaCaps] = useState<MediaCapabilitiesSnapshot | null>(null)
  const [capOptions, setCapOptions] = useState<CapOptionValues>({ ...DEFAULT_CAP_OPTIONS })
  const [streamingSessions, setStreamingSessions] = useState<Record<string, true>>({})
  const streamingSessionsRef = useRef<Record<string, true>>({})
  const [streamText, setStreamText] = useState('')
  const [streamStatus, setStreamStatus] = useState('')
  const [streamSessionId, setStreamSessionId] = useState<string | null>(null)
  const streamSessionRef = useRef<string | null>(null)
  const streamIdsBySessionRef = useRef<Map<string, string>>(new Map())
  const activeAgentRef = useRef<AgentId>(activeAgent)
  const activeIdRef = useRef<string | null>(null)
  activeAgentRef.current = activeAgent
  activeIdRef.current = activeId
  const draftByAgentRef = useRef<Record<string, string>>({})
  const attachmentsByAgentRef = useRef<Record<string, WorkbenchAttachment[]>>({})
  const liveStreamRef = useRef<
    Record<
      string,
      {
        text: string
        status: string
        citations: KnowledgeCitation[]
        toolSteps: LlmToolStep[]
      }
    >
  >({})
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments

  const isSessionStreaming = (sessionId: string | null | undefined): boolean =>
    sessionId != null && sessionId in streamingSessionsRef.current

  const activeStreaming = activeId != null && activeId in streamingSessions

  const markSessionStreaming = (sessionId: string, streaming: boolean): void => {
    const prev = streamingSessionsRef.current
    let next = prev
    if (streaming) {
      if (prev[sessionId]) return
      next = { ...prev, [sessionId]: true }
    } else {
      if (!prev[sessionId]) return
      next = { ...prev }
      delete next[sessionId]
    }
    // Keep ref in sync immediately so refresh/syncLiveStream don't clear the live bubble.
    streamingSessionsRef.current = next
    setStreamingSessions(next)
  }

  const syncLiveStreamToUi = (sessionId: string | null): void => {
    if (!sessionId || !isSessionStreaming(sessionId)) {
      setStreamSessionId(null)
      setStreamText('')
      setStreamStatus('')
      setStreamCitations([])
      setStreamToolSteps([])
      return
    }
    const live = liveStreamRef.current[sessionId]
    setStreamSessionId(sessionId)
    setStreamText(live?.text ?? '')
    setStreamStatus(live?.status ?? '')
    setStreamCitations(live?.citations ?? [])
    setStreamToolSteps(live?.toolSteps ?? [])
  }

  const patchLiveStream = (
    sessionId: string,
    patch: Partial<{
      text: string
      status: string
      citations: KnowledgeCitation[]
      toolSteps: LlmToolStep[]
    }>,
  ): void => {
    const prev = liveStreamRef.current[sessionId] ?? {
      text: '',
      status: '',
      citations: [] as KnowledgeCitation[],
      toolSteps: [] as LlmToolStep[],
    }
    const next = { ...prev, ...patch }
    if (patch.text !== undefined) {
      next.text = patch.text
    }
    liveStreamRef.current[sessionId] = next
    if (activeIdRef.current !== sessionId) return
    // Re-bind live session id on every patch so a raced refresh can't leave deltas invisible.
    setStreamSessionId(sessionId)
    if (patch.text !== undefined) setStreamText(next.text)
    if (patch.status !== undefined) setStreamStatus(next.status)
    if (patch.citations !== undefined) setStreamCitations(next.citations)
    if (patch.toolSteps !== undefined) setStreamToolSteps(next.toolSteps)
  }

  const clearLiveStream = (sessionId: string): void => {
    delete liveStreamRef.current[sessionId]
    streamIdsBySessionRef.current.delete(sessionId)
    markSessionStreaming(sessionId, false)
    if (activeIdRef.current === sessionId) {
      syncLiveStreamToUi(null)
    }
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const appendLiveSessionEvent = (ev: SessionEvent): void => {
    setLiveSessionEvents((prev) => (prev.some((e) => e.id === ev.id) ? prev : [...prev, ev]))
    if (ev.type === 'goal/set' || ev.type === 'goal/update' || ev.type === 'subagent/end') {
      setTrajectoryTick((n) => n + 1)
    }
    if (ev.type === 'shell/chunk' || ev.type === 'tool/call' || ev.type === 'tool/result') {
      setTerminalTick((n) => n + 1)
    }
  }

  const openChildSession = (childSessionId: string): void => {
    const child = listSessions().find((s) => s.id === childSessionId)
    if (!child) return
    setActiveAgent(child.agentId as AgentId)
    refresh(childSessionId, child.agentId as AgentId)
    setLiveSessionEvents([])
    setTrajectoryOpen(true)
  }

  const refresh = (preferSessionId?: string | null, forAgent?: AgentId): void => {
    const agentId = forAgent ?? activeAgentRef.current
    const all = listSessions()
    setSessions(all)
    const scoped = all.filter((s) => s.agentId === agentId)
    const preferred =
      preferSessionId && scoped.some((s) => s.id === preferSessionId)
        ? preferSessionId
        : null
    const remembered = getActiveSessionIdForAgent(String(agentId))
    const keepRemembered =
      remembered && scoped.some((s) => s.id === remembered) ? remembered : null
    const nextId = preferred ?? keepRemembered ?? scoped[0]?.id ?? null
    setActiveId(nextId)
    // Always persist this agent's cursor (including null) so agents stay isolated.
    setActiveSessionId(nextId, String(agentId))
    if (nextId) {
      setMessages(listMessages(nextId))
      const arts = listArtifacts(nextId)
      setArtifacts(arts)
      setActiveArtifactId((prev) => (prev && arts.some((a) => a.id === prev) ? prev : arts[0]?.id ?? null))
    } else {
      setMessages([])
      setArtifacts([])
      setActiveArtifactId(null)
    }
    syncLiveStreamToUi(nextId)
    setPendingApproval(
      nextId ? pendingApprovalBySessionRef.current.get(nextId) ?? null : null,
    )
  }

  const refreshForSession = (sessionId: string): void => {
    const ses = getSession(sessionId)
    if (ses) refresh(sessionId, ses.agentId as AgentId)
    else refresh(null, activeAgentRef.current)
  }

  const appendAssistant = (
    sessionId: string,
    content: string,
    citations?: Parameters<typeof appendMessage>[3],
    toolSteps?: Parameters<typeof appendMessage>[4],
  ): void => {
    const msg = appendMessage(sessionId, 'assistant', content, citations, toolSteps)
    extractArtifactsFromContent(sessionId, content, msg.id)
    const arts = listArtifacts(sessionId)
    setArtifacts(arts)
    if (arts[0]) setActiveArtifactId(arts[0].id)
  }

  const finishHarnessTurn = async (sessionId: string): Promise<void> => {
    const msgs = await syncFromHarness(sessionId)
    setMessages(msgs)
    setTrajectoryTick((n) => n + 1)
    const last = [...msgs].reverse().find((m) => m.role === 'assistant')
    if (last) {
      extractArtifactsFromContent(sessionId, last.content, last.id)
      const arts = listArtifacts(sessionId)
      setArtifacts(arts)
      if (arts[0]) setActiveArtifactId(arts[0].id)
    }
    window.setTimeout(() => {
      void reloadHarnessStore().then(() => {
        const ses = getSession(sessionId)
        // Don't steal focus if the user already switched to another agent.
        if (!ses || activeAgentRef.current !== ses.agentId) {
          setSessions(listSessions())
          return
        }
        refresh(sessionId, ses.agentId as AgentId)
      })
    }, 4000)
  }

  const applyAiSettings = (fortune: {
    aiModels?: string[]
    aiModel?: string
    aiApiKey?: string
    aiBaseUrl?: string
    aiActiveProviderId?: string
    aiProviders?: FortuneAiProviderConfig[]
  } | undefined): void => {
    const groups = groupedChatModels(fortune?.aiProviders)
    setAiProviders(fortune?.aiProviders ?? [])
    setModelGroups(groups)
    const models = groups.flatMap((g) => g.models)
    setModelOptions(models.length ? models : (fortune?.aiModels ?? []).map((m) => m.trim()).filter(Boolean))
    const providerId =
      fortune?.aiActiveProviderId && groups.some((g) => g.id === fortune.aiActiveProviderId)
        ? fortune.aiActiveProviderId
        : (groups[0]?.id ?? '')
    setActiveProviderId(providerId)
    const group = groups.find((g) => g.id === providerId)
    const selected =
      fortune?.aiModel && group?.models.includes(fortune.aiModel)
        ? fortune.aiModel
        : (group?.models[0] ?? models[0] ?? '')
    setSelectedModel(selected)
    setAiBaseUrl(fortune?.aiBaseUrl || '')
    setHasApiKey(Boolean(fortune?.aiApiKey?.trim()))
  }

  useEffect(() => {
    const loadAi = (): void => {
      void window.treasureChest.getSettingsSnapshot().then((snap) => {
        applyAiSettings(snap.fortune)
      })
      void window.treasureChest.getMediaCapabilities().then(setMediaCaps)
    }

    loadAi()
    const onFocus = (): void => loadAi()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    void hydrateSessionStore().then(() => {
      const agentId = searchParams.get('agent')
      const next: AgentId =
        !agentId || isDirectChatId(agentId)
          ? DIRECT_CHAT_ID
          : getAgent(agentId)
            ? agentId
            : DIRECT_CHAT_ID
      const prevAgent = String(activeAgentRef.current)
      draftByAgentRef.current[prevAgent] = draftRef.current
      attachmentsByAgentRef.current[prevAgent] = attachmentsRef.current
      setActiveAgent(next)
      setDraft(draftByAgentRef.current[String(next)] ?? '')
      setAttachments(attachmentsByAgentRef.current[String(next)] ?? [])
      setActiveCap(null)
      setArmedWorkflow(null)
      setLiveSessionEvents([])
      refresh(null, next)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    })
  }, [searchParams])

  useEffect(() => {
    const agent = getAgent(activeAgent)
    if (!agent || agent.builtin || !agent.preferredModel) return
    const preferred = agent.preferredModel.trim()
    const encoded = decodeChatModelRef(preferred)
    const model = encoded?.modelId || preferred
    const group =
      (encoded && modelGroups.find((g) => g.id === encoded.providerId && g.models.includes(model))) ||
      modelGroups.find((g) => g.models.includes(model))
    if (!group || !model) return
    setActiveProviderId(group.id)
    setSelectedModel(model)
    // Must persist provider+model: chat uses main-process settings for API base URL/key.
    void window.treasureChest
      .setFortuneSettings({
        aiActiveProviderId: group.id,
        aiModel: model,
      })
      .then((next) => {
        applyAiSettings(next)
        void window.treasureChest.getMediaCapabilities().then(setMediaCaps)
      })
      .catch(() => {
        /* ignore */
      })
  }, [activeAgent, modelGroups])

  /** Ensure the model we send matches an active provider endpoint (avoids qwen-plus on DeepSeek, etc.). */
  const syncChatEndpoint = async (model: string): Promise<string> => {
    const m = model.trim()
    if (!m) return m
    const group =
      (activeProviderId &&
        modelGroups.find((g) => g.id === activeProviderId && g.models.includes(m))) ||
      modelGroups.find((g) => g.models.includes(m))
    if (!group) return m
    setActiveProviderId(group.id)
    setSelectedModel(m)
    try {
      const next = await window.treasureChest.setFortuneSettings({
        aiActiveProviderId: group.id,
        aiModel: m,
      })
      applyAiSettings(next)
    } catch {
      /* ignore */
    }
    return m
  }

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_KEY, panelOpen ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [panelOpen])

  useEffect(() => {
    try {
      localStorage.setItem(WEB_SEARCH_KEY, webSearchOn ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [webSearchOn])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, activeId, activeStreaming, streamText])

  const togglePanel = (): void => setPanelOpen((v) => !v)

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  )

  const activeAgentDef = getAgent(activeAgent) ?? DIRECT_CHAT_DEF
  const directMode = isDirectChatId(String(activeAgent))
  const enableWebSearch =
    String(activeAgent) === 'stocks' || activeCap === 'research' || webSearchOn
  const activeAgentName = directMode
    ? t('nav.workbench')
    : agentDisplayName(activeAgentDef, t)

  const visibleSessions = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sessions.filter((s) => {
      if (s.agentId !== activeAgent) return false
      if (!q) return true
      return s.title.toLowerCase().includes(q)
    })
  }, [sessions, activeAgent, query])

  const ensureSession = async (agentId: AgentId): Promise<string> => {
    if (activeSession && activeSession.agentId === agentId) return activeSession.id
    const title = i18n.language.startsWith('zh') ? '新会话' : 'New chat'
    const created = await createSession(agentId, title)
    refresh(created.id, agentId)
    return created.id
  }

  const onNewSession = (): void => {
    const title = i18n.language.startsWith('zh') ? '新会话' : 'New chat'
    const agentAtCreate = activeAgent
    void createSession(agentAtCreate, title).then((created) => {
      if (activeAgentRef.current !== agentAtCreate) {
        setSessions(listSessions())
        return
      }
      refresh(created.id, agentAtCreate)
      inputRef.current?.focus()
    })
  }

  const onSelectSession = (id: string): void => {
    setActiveSessionId(id, String(activeAgent))
    refresh(id, activeAgent)
  }

  const onDeleteSession = (id: string): void => {
    clearSessionArtifacts(id)
    deleteSession(id)
    refresh(null, activeAgent)
  }

  const onForkAtSeq = (boundarySeq: number): void => {
    if (!activeId) return
    void forkSession(activeId, boundarySeq).then((forked) => {
      if (!forked) return
      refresh(forked.id, activeAgent)
      setLiveSessionEvents([])
      setTrajectoryTick((n) => n + 1)
    })
  }

  const onForkSession = (id: string): void => {
    void forkSession(id).then((forked) => {
      if (!forked) return
      refresh(forked.id, activeAgent)
      setTrajectoryTick((n) => n + 1)
    })
  }

  const onStopGeneration = (): void => {
    if (!activeId) return
    const streamId = streamIdsBySessionRef.current.get(activeId)
    if (streamId) {
      void window.treasureChest.cancelWorkbenchStream(streamId)
    }
    streamSessionRef.current = null
    clearLiveStream(activeId)
    pendingApprovalBySessionRef.current.delete(activeId)
    setPendingApproval(null)
  }

  const localEndpoint = isLocalLlmBaseUrl(aiBaseUrl)

  const setWorkflowStepStatus = (id: string, status: WorkflowStepState['status']): void => {
    setWorkflowSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)))
  }

  const initWorkflowSteps = (id: WorkflowId): WorkflowStepState[] => {
    const def = WORKFLOW_DEFS[id]
    const steps = def.stepKeys.map((key, i) => ({
      id: `${id}_${i}`,
      label: t(key),
      status: 'pending' as const,
    }))
    setWorkflowTitle(
      id === 'daily_brief' ? t('workbench.workflow.dailyBrief.title') : t('workbench.workflow.deepResearch.title'),
    )
    setWorkflowSteps(steps)
    return steps
  }

  /** Shared single chat round used by workflows (and keeps tool/approval/artifacts wiring). */
  const runChatRound = async (
    sessionId: string,
    opts: {
      userContent: string
      capabilityMode?: string
      useKnowledge?: boolean
      skillPrompt?: string
      appendUser?: boolean
    },
  ): Promise<boolean> => {
    if (opts.appendUser !== false) {
      appendMessage(sessionId, 'user', opts.userContent)
    }
    refreshForSession(sessionId)
    patchLiveStream(sessionId, { text: '', status: '', citations: [], toolSteps: [] })
    markSessionStreaming(sessionId, true)
    streamSessionRef.current = sessionId
    if (activeIdRef.current === sessionId) syncLiveStreamToUi(sessionId)
    setLiveSessionEvents([])

    const knowledgeCollectionId =
      !directMode && !activeAgentDef.builtin
        ? activeAgentDef.knowledgeCollectionIds?.[0]
        : undefined
    const toolFlags = agentChatToolFlags(activeAgentDef, directMode)
    const preferredRaw = !directMode && !activeAgentDef.builtin ? activeAgentDef.preferredModel : undefined
    const preferredDecoded = preferredRaw ? decodeChatModelRef(preferredRaw) : null
    const preferredModelId = preferredDecoded?.modelId || preferredRaw?.trim() || ''
    const chatModel = await syncChatEndpoint(
      preferredModelId && modelOptions.includes(preferredModelId) ? preferredModelId : selectedModel,
    )

    try {
      const res = await window.treasureChest.workbenchChatStream(
        {
          agentId: directMode ? DIRECT_CHAT_ID : String(activeAgent),
          sessionId,
          model: chatModel,
          messages: [],
          systemPrompt:
            !directMode && !activeAgentDef.builtin ? activeAgentDef.systemPrompt : undefined,
          locale: i18n.language,
          useKnowledge: Boolean(opts.useKnowledge),
          enableWebSearch,
          knowledgeCollectionId,
          ...toolFlags,
          memoryFacts: memoryFactsForPrompt(String(activeAgent)),
          capabilityMode: opts.capabilityMode,
          skillPrompt: opts.skillPrompt,
        },
        (delta) => {
          const prevText = liveStreamRef.current[sessionId]?.text ?? ''
          patchLiveStream(sessionId, { text: prevText + delta, status: '' })
        },
        (status) => {
          patchLiveStream(sessionId, { status })
        },
        (citations) => {
          patchLiveStream(sessionId, { citations })
        },
        (step) => {
          const prevSteps = liveStreamRef.current[sessionId]?.toolSteps ?? []
          const idx = prevSteps.findIndex((s) => s.id === step.id)
          const toolSteps =
            idx >= 0
              ? prevSteps.map((s, i) => (i === idx ? step : s))
              : [...prevSteps, step]
          patchLiveStream(sessionId, { toolSteps })
        },
        (request) => {
          pendingApprovalBySessionRef.current.set(sessionId, request)
          if (activeIdRef.current === sessionId) setPendingApproval(request)
        },
        (ev) => {
          if (activeIdRef.current === sessionId) appendLiveSessionEvent(ev)
        },
        (streamId) => {
          streamIdsBySessionRef.current.set(sessionId, streamId)
        },
      )
      if (!isSessionStreaming(sessionId)) return false
      if (res.error === 'cancelled') {
        await finishHarnessTurn(sessionId)
        refreshForSession(sessionId)
        setTrajectoryTick((n) => n + 1)
        return false
      }
      if (res.ok && res.text?.trim()) {
        await finishHarnessTurn(sessionId)
        refreshForSession(sessionId)
        return true
      }
      appendMessage(
        sessionId,
        'system',
        t('workbench.chatFailed', { error: res.error || t('workbench.chatUnknownError') }),
      )
      refreshForSession(sessionId)
      return false
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendMessage(sessionId, 'system', t('workbench.chatFailed', { error: msg }))
      if (activeIdRef.current === sessionId) refreshForSession(sessionId)
      return false
    } finally {
      if (streamSessionRef.current === sessionId) streamSessionRef.current = null
    }
  }

  const runDailyBriefWorkflow = async (): Promise<void> => {
    if (activeId && isSessionStreaming(activeId)) return
    if (!selectedModel) {
      const sid = await ensureSession(activeAgent)
      appendMessage(sid, 'system', t('workbench.needModel'))
      refreshForSession(sid)
      return
    }
    if (!hasApiKey && !localEndpoint) {
      const sid = await ensureSession(activeAgent)
      appendMessage(sid, 'system', t('workbench.needApiKey'))
      refreshForSession(sid)
      return
    }
    const sessionId = await ensureSession(activeAgent)
    const steps = initWorkflowSteps('daily_brief')
    appendMessage(sessionId, 'user', t('workbench.workflow.kickoff.dailyBrief'))
    markSessionStreaming(sessionId, true)
    streamSessionRef.current = sessionId
    if (activeIdRef.current === sessionId) syncLiveStreamToUi(sessionId)
    refreshForSession(sessionId)

    try {
      const stocksStep = steps[0]!
      setWorkflowStepStatus(stocksStep.id, 'running')
      let stocksJson = ''
      try {
        let report = await window.treasureChest.getLatestStocksReport()
        if (!report) report = await window.treasureChest.generateStocksReport()
        stocksJson = JSON.stringify(
          {
            date: report.date,
            generatedAt: report.generatedAt,
            picks: (report.recommendations || []).slice(0, 8).map((r) => ({
              market: r.market,
              symbol: r.symbol,
              name: r.name,
              signal: r.signal,
              score: r.score,
              summary: r.summary,
              reasons: r.reasons?.slice(0, 3),
            })),
          },
          null,
          2,
        )
        appendMessage(
          sessionId,
          'system',
          t('workbench.workflow.prompt.stocksContext', { json: stocksJson.slice(0, 6000) }),
        )
        setWorkflowStepStatus(stocksStep.id, 'done')
      } catch {
        appendMessage(sessionId, 'system', t('workbench.workflow.stocksMissing'))
        setWorkflowStepStatus(stocksStep.id, 'done')
      }
      refreshForSession(sessionId)

      const briefStep = steps[1]!
      setWorkflowStepStatus(briefStep.id, 'running')
      const ok = await runChatRound(sessionId, {
        userContent: t('workbench.workflow.prompt.brief'),
        capabilityMode: 'write',
        useKnowledge: false,
      })
      setWorkflowStepStatus(briefStep.id, ok ? 'done' : 'error')
    } finally {
      if (streamSessionRef.current === sessionId) streamSessionRef.current = null
      clearLiveStream(sessionId)
      if (activeIdRef.current === sessionId) refreshForSession(sessionId)
    }
  }

  const runDeepResearchWorkflow = async (topic: string): Promise<void> => {
    if (activeId && isSessionStreaming(activeId)) return
    if (!selectedModel) {
      const sid = await ensureSession(activeAgent)
      appendMessage(sid, 'system', t('workbench.needModel'))
      refreshForSession(sid)
      return
    }
    if (!hasApiKey && !localEndpoint) {
      const sid = await ensureSession(activeAgent)
      appendMessage(sid, 'system', t('workbench.needApiKey'))
      refreshForSession(sid)
      return
    }
    const sessionId = await ensureSession(activeAgent)
    const steps = initWorkflowSteps('deep_research')
    appendMessage(sessionId, 'user', t('workbench.workflow.kickoff.deepResearch', { topic }))
    setArmedWorkflow(null)
    markSessionStreaming(sessionId, true)
    streamSessionRef.current = sessionId
    if (activeIdRef.current === sessionId) syncLiveStreamToUi(sessionId)
    refreshForSession(sessionId)

    try {
      const plan = steps[0]!
      setWorkflowStepStatus(plan.id, 'running')
      let ok = await runChatRound(sessionId, {
        userContent: t('workbench.workflow.prompt.plan', { topic }),
        capabilityMode: 'research',
        useKnowledge: true,
      })
      setWorkflowStepStatus(plan.id, ok ? 'done' : 'error')
      if (!ok) return

      const investigate = steps[1]!
      setWorkflowStepStatus(investigate.id, 'running')
      ok = await runChatRound(sessionId, {
        userContent: t('workbench.workflow.prompt.investigate', { topic }),
        capabilityMode: 'research',
        useKnowledge: true,
      })
      setWorkflowStepStatus(investigate.id, ok ? 'done' : 'error')
      if (!ok) return

      const report = steps[2]!
      setWorkflowStepStatus(report.id, 'running')
      ok = await runChatRound(sessionId, {
        userContent: t('workbench.workflow.prompt.report', { topic }),
        capabilityMode: 'write',
        useKnowledge: false,
      })
      setWorkflowStepStatus(report.id, ok ? 'done' : 'error')
    } finally {
      if (streamSessionRef.current === sessionId) streamSessionRef.current = null
      clearLiveStream(sessionId)
      if (activeIdRef.current === sessionId) refreshForSession(sessionId)
    }
  }

  const sendText = async (text: string): Promise<void> => {
    const content = text.trim()
    if (!content && attachments.length === 0) return
    if (armedWorkflow === 'deep_research' && content) {
      setDraft('')
      draftByAgentRef.current[String(activeAgent)] = ''
      await runDeepResearchWorkflow(content)
      return
    }
    if (!selectedModel) {
      const sessionId = await ensureSession(activeAgent)
      appendMessage(sessionId, 'system', t('workbench.needModel'))
      refreshForSession(sessionId)
      return
    }
    if (!hasApiKey && !localEndpoint) {
      const sessionId = await ensureSession(activeAgent)
      appendMessage(sessionId, 'system', t('workbench.needApiKey'))
      refreshForSession(sessionId)
      return
    }
    let mediaModel = selectedModel
    let effectiveCap = activeCap
    // If user asks to generate an image in plain chat, route like ChatGPT (don't require chip).
    if (
      !effectiveCap &&
      /(?:生成|画|绘制|做一?[张幅]|generate|draw|paint).{0,20}(?:图|图片|插画|image|photo|狗|猫|人像)/i.test(
        content,
      )
    ) {
      const routed = await resolveMediaModelOrExplain('image')
      if (routed) {
        effectiveCap = 'image'
        mediaModel = routed
      }
    } else if (effectiveCap === 'image' || effectiveCap === 'video' || effectiveCap === 'music') {
      const routed = await resolveMediaModelOrExplain(effectiveCap)
      if (!routed) return
      mediaModel = routed
    }

    const sessionId = await ensureSession(activeAgent)
    if (isSessionStreaming(sessionId)) return
    const fileLine =
      attachments.length > 0
        ? `\n${t('workbench.attachedFiles', { files: attachments.map((a) => a.name).join('、') })}`
        : ''
    appendMessage(sessionId, 'user', `${content}${fileLine}`.trim())
    setDraft('')
    draftByAgentRef.current[String(activeAgent)] = ''
    attachmentsByAgentRef.current[String(activeAgent)] = []
    setAttachments([])
    patchLiveStream(sessionId, { text: '', status: '', citations: [], toolSteps: [] })
    markSessionStreaming(sessionId, true)
    streamSessionRef.current = sessionId
    if (activeIdRef.current === sessionId) syncLiveStreamToUi(sessionId)
    setLiveSessionEvents([])
    refreshForSession(sessionId)

    const useKnowledge =
      /@知识库|@knowledge/i.test(content) ||
      activeCap === 'knowledge' ||
      Boolean(!directMode && !activeAgentDef.builtin && activeAgentDef.alwaysUseKnowledge) ||
      Boolean(
        !directMode &&
          !activeAgentDef.builtin &&
          (activeAgentDef.knowledgeCollectionIds?.length ?? 0) > 0,
      )
    const knowledgeCollectionId =
      !directMode && !activeAgentDef.builtin
        ? activeAgentDef.knowledgeCollectionIds?.[0]
        : undefined
    const toolFlags = agentChatToolFlags(activeAgentDef, directMode)
    const preferredRaw = !directMode && !activeAgentDef.builtin ? activeAgentDef.preferredModel : undefined
    const preferredDecoded = preferredRaw ? decodeChatModelRef(preferredRaw) : null
    const preferredModelId = preferredDecoded?.modelId || preferredRaw?.trim() || ''
    const chatModel = await syncChatEndpoint(
      preferredModelId && modelOptions.includes(preferredModelId) ? preferredModelId : selectedModel,
    )
    const skill =
      installedSkills.find((s) => s.id === activeSkillId) ||
      WORKBENCH_SKILLS.find((s) => s.id === activeSkillId)
    const skillPrompt = skill
      ? 'prompt' in skill && typeof (skill as InstalledSkillRow).prompt === 'string'
        ? (skill as InstalledSkillRow).prompt
        : i18n.language.toLowerCase().startsWith('en')
          ? (skill as (typeof WORKBENCH_SKILLS)[number]).promptEn
          : (skill as (typeof WORKBENCH_SKILLS)[number]).promptZh
      : undefined

    const optionPrompt =
      activeCap && CAPABILITY_OPTION_GROUPS[activeCap]
        ? buildCapabilityOptionsPrompt(activeCap, capOptions, i18n.language)
        : null
    const mergedSkillPrompt = [skillPrompt, optionPrompt].filter(Boolean).join('\n')

    try {
      if (effectiveCap === 'image') {
        patchLiveStream(sessionId, { status: t('workbench.imageGenerating') })
        const img = await window.treasureChest.generateImage({
          prompt: content,
          model: mediaModel,
          size: imageSizeFromOptions(capOptions),
          style: capOptions.imageStyle,
          quality: capOptions.imageQuality,
        })
        if (img.ok && img.url) {
          const meta = [
            capOptions.imageAspect,
            capOptions.imageQuality,
            capOptions.imageStyle,
          ]
            .filter(Boolean)
            .join(' · ')
          const usedModel = img.model?.trim() || mediaModel
          const doneLine = usedModel
            ? t('workbench.imageDoneModel', { model: usedModel })
            : t('workbench.imageDone')
          const alt = content.replace(/[\[\]]/g, '').slice(0, 40) || 'image'
          const md = `![${alt}](${img.url})\n\n${doneLine}${meta ? ` (${meta})` : ''}`
          appendAssistant(sessionId, md)
        } else {
          appendMessage(
            sessionId,
            'system',
            t('workbench.chatFailed', { error: img.error || t('workbench.chatUnknownError') }),
          )
        }
      } else if (effectiveCap === 'video') {
        patchLiveStream(sessionId, { status: t('workbench.videoGenerating') })
        const vid = await window.treasureChest.generateVideo({
          prompt: content,
          model: mediaModel,
          durationSec: Number(capOptions.videoDuration || 5),
          aspectRatio: capOptions.videoAspect,
          resolution: capOptions.videoResolution,
        })
        if (vid.ok && (vid.text || vid.url)) {
          appendAssistant(sessionId, vid.text || `[video](${vid.url})`)
        } else {
          appendMessage(
            sessionId,
            'system',
            t('workbench.chatFailed', { error: vid.error || t('workbench.chatUnknownError') }),
          )
        }
      } else if (effectiveCap === 'music') {
        patchLiveStream(sessionId, { status: t('workbench.musicGenerating') })
        const music = await window.treasureChest.generateMusic({
          prompt: content,
          model: mediaModel,
          durationSec: Number(capOptions.musicDuration || 60),
          style: capOptions.musicStyle,
          instrumental: capOptions.musicInstrumental !== 'no',
        })
        if (music.ok && (music.text || music.url)) {
          appendAssistant(sessionId, music.text || `[audio](${music.url})`)
        } else {
          appendMessage(
            sessionId,
            'system',
            t('workbench.chatFailed', { error: music.error || t('workbench.chatUnknownError') }),
          )
        }
      } else {
        patchLiveStream(sessionId, { citations: [], toolSteps: [] })
        const capabilityMode =
          activeCap && ['write', 'translate', 'research', 'skills', 'create_agent'].includes(activeCap)
            ? activeCap
            : undefined
        const res = await window.treasureChest.workbenchChatStream(
          {
            agentId: directMode ? DIRECT_CHAT_ID : String(activeAgent),
            sessionId,
            model: chatModel,
            messages: [],
            systemPrompt:
              !directMode && !activeAgentDef.builtin ? activeAgentDef.systemPrompt : undefined,
            locale: i18n.language,
            useKnowledge,
            enableWebSearch,
            knowledgeCollectionId,
            ...toolFlags,
            memoryFacts: memoryFactsForPrompt(String(activeAgent)),
            capabilityMode,
            skillPrompt: mergedSkillPrompt || undefined,
          },
          (delta) => {
            const prevText = liveStreamRef.current[sessionId]?.text ?? ''
            patchLiveStream(sessionId, { text: prevText + delta, status: '' })
          },
          (status) => {
            patchLiveStream(sessionId, { status })
          },
          (citations) => {
            patchLiveStream(sessionId, { citations })
          },
          (step) => {
            const prevSteps = liveStreamRef.current[sessionId]?.toolSteps ?? []
            const idx = prevSteps.findIndex((s) => s.id === step.id)
            const toolSteps =
              idx >= 0
                ? prevSteps.map((s, i) => (i === idx ? step : s))
                : [...prevSteps, step]
            patchLiveStream(sessionId, { toolSteps })
          },
          (request) => {
            pendingApprovalBySessionRef.current.set(sessionId, request)
            if (activeIdRef.current === sessionId) setPendingApproval(request)
          },
          (ev) => {
            if (activeIdRef.current === sessionId) appendLiveSessionEvent(ev)
          },
          (streamId) => {
            streamIdsBySessionRef.current.set(sessionId, streamId)
          },
        )
        if (res.ok && res.text?.trim()) {
          await finishHarnessTurn(sessionId)
        } else {
          appendMessage(
            sessionId,
            'system',
            t('workbench.chatFailed', { error: res.error || t('workbench.chatUnknownError') }),
          )
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendMessage(sessionId, 'system', t('workbench.chatFailed', { error: msg }))
    } finally {
      if (streamSessionRef.current === sessionId) streamSessionRef.current = null
      clearLiveStream(sessionId)
      if (activeIdRef.current === sessionId) {
        refreshForSession(sessionId)
      } else {
        setSessions(listSessions())
      }
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendText(draft)
    }
  }

  const onCapability = async (id: WorkbenchCapabilityId): Promise<void> => {
    setMoreOpen(false)
    const capMeta = WORKBENCH_CAPABILITIES.find((c) => c.id === id)
    const capName = capMeta ? t(capMeta.labelKey) : id
    if (id === 'websearch') {
      if (String(activeAgent) === 'stocks') {
        setWebSearchOn(true)
        return
      }
      setWebSearchOn((v) => !v)
      return
    }
    if (id === 'upload') {
      setActiveCap(id)
      fileRef.current?.click()
      return
    }
    if (id === 'knowledge') {
      setActiveCap(id)
      inputRef.current?.focus()
      setDraft((prev) =>
        prev.includes('@知识库') || prev.includes('@knowledge')
          ? prev
          : `${prev}${prev ? ' ' : ''}@知识库 `,
      )
      return
    }
    if (id === 'mcp') {
      setActiveCap(id)
      const sessionId = await ensureSession(activeAgent)
      appendMessage(sessionId, 'system', t('workbench.mcpHint'))
      refreshForSession(sessionId)
      return
    }
    if (id === 'skills') {
      setActiveCap('skills')
      setSkillPickerOpen(true)
      void Promise.all([
        window.treasureChest.listSkills(),
        window.treasureChest.listSkillCatalogs(),
      ]).then(([skills, catalogs]) => {
        setInstalledSkills(skills)
        setSkillCatalogs(catalogs)
      })
      return
    }
    if (id === 'image' || id === 'write' || id === 'translate' || id === 'research' || id === 'video' || id === 'music' || id === 'create_agent') {
      if (activeCap === id) {
        setActiveCap(null)
        inputRef.current?.focus()
        return
      }
      if (id === 'image' || id === 'video' || id === 'music') {
        const level = mediaLevelOf(id)
        if (level === 'no') {
          explainMediaCap(id)
          return
        }
        // Arm first; model routing is checked at send time (don't block arming on stale state).
        const routed = await resolveMediaModelOrExplain(id)
        if (!routed) return
      }
      setActiveCap(id)
      inputRef.current?.focus()
      const sessionId = await ensureSession(activeAgent)
      if (id === 'create_agent') {
        appendMessage(sessionId, 'system', t('workbench.capArmedCreateAgent'))
        refreshForSession(sessionId)
        return
      }
      appendMessage(sessionId, 'system', t('workbench.capArmed', { name: capName }))
      refreshForSession(sessionId)
      return
    }
    if (id === 'transcribe') {
      if (mediaLevelOf('transcribe') === 'no') {
        explainMediaCap('transcribe')
        return
      }
      if (mediaLevelOf('transcribe') === 'maybe') {
        explainMediaCap('transcribe')
      }
      const sessionId = await ensureSession(activeAgent)
      appendMessage(sessionId, 'system', t('workbench.transcribePickHint'))
      refreshForSession(sessionId)
      void (async () => {
        const filePath = await window.treasureChest.pickAudioFile()
        if (!filePath) {
          appendMessage(sessionId, 'system', t('workbench.transcribeCancelled'))
          refreshForSession(sessionId)
          return
        }
        markSessionStreaming(sessionId, true)
        patchLiveStream(sessionId, { status: t('workbench.transcribeGenerating') })
        streamSessionRef.current = sessionId
        if (activeIdRef.current === sessionId) syncLiveStreamToUi(sessionId)
        try {
          const res = await window.treasureChest.transcribeAudio({ filePath })
          if (res.ok && res.text) {
            appendAssistant(sessionId, res.text)
          } else {
            appendMessage(
              sessionId,
              'system',
              t('workbench.chatFailed', { error: res.error || t('workbench.chatUnknownError') }),
            )
          }
        } catch (err) {
          appendMessage(
            sessionId,
            'system',
            t('workbench.chatFailed', {
              error: err instanceof Error ? err.message : String(err),
            }),
          )
        } finally {
          if (streamSessionRef.current === sessionId) streamSessionRef.current = null
          clearLiveStream(sessionId)
          if (activeIdRef.current === sessionId) refreshForSession(sessionId)
        }
      })()
      return
    }
    const sessionId = await ensureSession(activeAgent)
    appendMessage(sessionId, 'system', t('workbench.capSoon', { name: capName }))
    refreshForSession(sessionId)
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

  const onModelChange = async (value: string): Promise<void> => {
    const parsed = decodeChatModelRef(value)
    const providerId = parsed?.providerId || activeProviderId
    const model = parsed?.modelId || value
    setActiveProviderId(providerId)
    setSelectedModel(model)
    try {
      const next = await window.treasureChest.setFortuneSettings({
        aiActiveProviderId: providerId,
        aiModel: model,
      })
      applyAiSettings(next)
      void window.treasureChest.getMediaCapabilities().then(setMediaCaps)
    } catch {
      /* ignore */
    }
  }

  const mediaLevelOf = (id: WorkbenchCapabilityId): MediaSupportLevel | null => {
    if (id !== 'image' && id !== 'video' && id !== 'music' && id !== 'transcribe') return null
    return mediaCaps?.capabilities[id as MediaCapabilityKind]?.level ?? 'maybe'
  }

  /**
   * Industry-style media routing: keep the chat model in the picker; resolve a
   * dedicated image/video/music model for the API call. Returns null + explains
   * when nothing is configured.
   */
  const resolveMediaModelOrExplain = async (
    kind: 'image' | 'video' | 'music',
  ): Promise<string | null> => {
    const modality = kind === 'music' ? 'audio' : kind
    const name = t(`workbench.cap.${kind}` as 'workbench.cap.image')

    // Always read latest settings — React state can lag after Settings edits.
    let providers = aiProviders
    let providerId = activeProviderId
    let chatModel = selectedModel
    try {
      const snap = await window.treasureChest.getSettingsSnapshot()
      const fortune = snap.fortune
      if (fortune?.aiProviders?.length) {
        providers = fortune.aiProviders
        setAiProviders(fortune.aiProviders)
      }
      if (fortune?.aiActiveProviderId) {
        providerId = fortune.aiActiveProviderId
        setActiveProviderId(fortune.aiActiveProviderId)
      }
      if (fortune?.aiModel) chatModel = fortune.aiModel
    } catch {
      /* fall back to in-memory state */
    }

    const routed = resolveMediaRouteModel(providers, providerId, chatModel, modality)
    if (routed) return routed

    const sessionId = await ensureSession(activeAgent)
    appendMessage(
      sessionId,
      'system',
      t('workbench.media.routeUnsupported', {
        name,
        model: chatModel || selectedModel || '—',
      }),
    )
    refreshForSession(sessionId)
    return null
  }

  const explainMediaCap = async (id: MediaCapabilityKind): Promise<void> => {
    const sessionId = await ensureSession(activeAgent)
    const info = mediaCaps?.capabilities[id]
    const name = t(`workbench.cap.${id}` as 'workbench.cap.image')
    const provider = mediaCaps?.providerName || mediaCaps?.baseUrl || '—'
    const format = mediaCaps?.apiFormat === 'anthropic' ? 'Anthropic' : 'OpenAI-compatible'
    if (info?.level === 'no') {
      const reason = info.reason
        ? t(`workbench.media.reason.${info.reason}` as 'workbench.media.reason.anthropic_format')
        : ''
      appendMessage(
        sessionId,
        'system',
        `${t('workbench.media.unsupportedTitle', { name })}\n\n${t('workbench.media.unsupportedBody', {
          provider,
          format,
        })}${reason ? `\n\n${reason}` : ''}\n\n→ ${t('workbench.media.goSettings')}`,
      )
    } else {
      appendMessage(
        sessionId,
        'system',
        `${t('workbench.media.maybeTitle', { name })}\n\n${t('workbench.media.maybeBody', { provider })}`,
      )
    }
    refreshForSession(sessionId)
  }

  const quickChips = useMemo(() => {
    type Chip = { id: string; label: string; action: 'send' | 'workflow_brief' | 'workflow_research' | 'create_agent' }
    if (directMode) {
      return [
        {
          id: WORKFLOW_DEFS.daily_brief.chipKey,
          label: t(WORKFLOW_DEFS.daily_brief.chipKey),
          action: 'workflow_brief' as const,
        },
        {
          id: WORKFLOW_DEFS.deep_research.chipKey,
          label: t(WORKFLOW_DEFS.deep_research.chipKey),
          action: 'workflow_research' as const,
        },
        {
          id: 'workbench.chip.direct1',
          label: t('workbench.chip.direct1'),
          action: 'send' as const,
        },
        {
          id: 'workbench.chip.createAgent',
          label: t('workbench.chip.createAgent'),
          action: 'create_agent' as const,
        },
        {
          id: 'workbench.chip.direct3',
          label: t('workbench.chip.direct3'),
          action: 'send' as const,
        },
      ] satisfies Chip[]
    }
    if (activeAgent === 'fortune') {
      return (['workbench.chip.fortune1', 'workbench.chip.fortune2', 'workbench.chip.fortune3'] as const).map(
        (key) => ({ id: key, label: t(key), action: 'send' as const }),
      )
    }
    if (activeAgent === 'stocks') {
      return (['workbench.chip.stocks1', 'workbench.chip.stocks2', 'workbench.chip.stocks3'] as const).map(
        (key) => ({ id: key, label: t(key), action: 'send' as const }),
      )
    }
    const custom = (activeAgentDef.quickPrompts ?? []).map((p) => p.trim()).filter(Boolean)
    if (custom.length) {
      return custom.map((text, i) => ({
        id: `agent-qp-${i}`,
        label: text,
        action: 'send' as const,
      }))
    }
    return (['workbench.chip.custom1', 'workbench.chip.custom2', 'workbench.chip.custom3'] as const).map(
      (key) => ({ id: key, label: t(key), action: 'send' as const }),
    )
  }, [directMode, activeAgent, activeAgentDef.quickPrompts, t])

  const onAgentCreatedFromChat = (agent: AgentDef): void => {
    setActiveCap(null)
    void navigate(`/?agent=${encodeURIComponent(String(agent.id))}`)
  }

  const renderAssistantBody = (content: string, opts?: { streaming?: boolean }): ReactNode => {
    const spec = parseAgentSpec(content)
    const display = spec
      ? content.replace(/```agent-spec\s*[\s\S]*?```/gi, '').trim()
      : content
    return (
      <>
        {display ? <MarkdownMessage content={display} streaming={opts?.streaming} /> : null}
        {spec && !opts?.streaming ? (
          <AgentSpecCard spec={spec} onCreated={onAgentCreatedFromChat} />
        ) : null}
      </>
    )
  }

  const { primary: allPrimaryCaps, overflow: baseOverflowCaps } = useMemo(
    () => splitWorkbenchCapabilities(),
    [],
  )

  const primaryCaps = allPrimaryCaps.slice(0, inlinePrimaryCount)
  const overflowCaps: WorkbenchCapability[] = [
    ...allPrimaryCaps.slice(inlinePrimaryCount),
    ...baseOverflowCaps,
  ]

  useLayoutEffect(() => {
    const bar = composerBarRef.current
    const right = composerRightRef.current
    const measure = capMeasureRef.current
    if (!bar || !right || !measure) return

    const sync = (): void => {
      const kids = Array.from(measure.children) as HTMLElement[]
      if (kids.length < 2) return
      const moreEl = kids[kids.length - 1]!
      const capEls = kids.slice(0, -1)
      const gap = 4
      const budget = Math.max(0, bar.clientWidth - right.offsetWidth - gap)
      const moreW = moreEl.offsetWidth
      // Always reserve「更多」when there are overflow-only caps, or when not all primary fit.
      let count = 0
      let used = moreW + gap
      for (const el of capEls) {
        const next = used + el.offsetWidth + gap
        if (next > budget) break
        used = next
        count += 1
      }
      // If everything including overflow-only items fits without a menu, still OK to show more
      // only when overflowCaps would be non-empty after slicing — handled in render.
      // When base overflow is empty and all primary fit, try without reserving more width.
      if (baseOverflowCaps.length === 0 && count === capEls.length) {
        let fitAll = 0
        let usedAll = 0
        for (const el of capEls) {
          const next = usedAll + el.offsetWidth + (usedAll > 0 ? gap : 0)
          if (next > budget) {
            fitAll = -1
            break
          }
          usedAll = next
          fitAll += 1
        }
        if (fitAll === capEls.length) count = capEls.length
      }
      setInlinePrimaryCount((prev) => (prev === count ? prev : count))
    }

    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(bar)
    ro.observe(right)
    window.addEventListener('resize', sync)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [baseOverflowCaps.length, i18n.language])

  const renderCapButton = (cap: WorkbenchCapability, compact = false): ReactNode => {
    const mediaLevel = mediaLevelOf(cap.id)
    const unavailable = mediaLevel === 'no'
    const uncertain = mediaLevel === 'maybe'
    const webActive = cap.id === 'websearch' ? enableWebSearch : activeCap === cap.id
    const title =
      cap.id === 'websearch'
        ? enableWebSearch
          ? t('workbench.webSearchHintOn')
          : t('workbench.webSearchHintOff')
        : unavailable
          ? t('workbench.media.unsupportedTitle', { name: t(cap.labelKey) })
          : uncertain
            ? t('workbench.media.maybeTitle', { name: t(cap.labelKey) })
            : cap.status === 'soon'
              ? t('workbench.capSoonHint', { name: t(cap.labelKey) })
              : t(cap.labelKey)
    return (
      <button
        key={cap.id}
        type="button"
        className={`${styles.capItem} ${compact ? styles.capItemMenu : ''} ${
          webActive ? styles.capItemActive : ''
        } ${unavailable ? styles.capItemUnavailable : ''} ${uncertain ? styles.capItemMaybe : ''}`.trim()}
        onClick={() => onCapability(cap.id)}
        title={title}
        aria-disabled={unavailable || undefined}
      >
        <span className={styles.capIcon}>{capabilityIcon(cap.id)}</span>
        <span>{t(cap.labelKey)}</span>
        {unavailable ? <span className={styles.capBadge}>{t('workbench.media.badge.no')}</span> : null}
        {uncertain ? <span className={styles.capBadgeMaybe}>{t('workbench.media.badge.maybe')}</span> : null}
      </button>
    )
  }

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
              <div className={styles.panelTopActions}>
                <button
                  type="button"
                  className={styles.iconGhost}
                  title={t('workbench.newSession')}
                  aria-label={t('workbench.newSession')}
                  onClick={onNewSession}
                >
                  <IconPlus />
                </button>
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
            </div>

            <label className={styles.searchWrap}>
              <IconSearch />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('workbench.searchSessions')}
              />
            </label>

            <div className={styles.sessionList}>
              {visibleSessions.length === 0 ? (
                <button type="button" className={styles.sessionItem} onClick={onNewSession}>
                  <span className={styles.sessionTitle}>{t('workbench.startSession')}</span>
                </button>
              ) : (
                visibleSessions.map((session) => (
                  <div key={session.id} className={styles.sessionRow}>
                    <button
                      type="button"
                      className={`${styles.sessionItem} ${
                        session.id === activeId ? styles.sessionItemActive : ''
                      }`}
                      onClick={() => onSelectSession(session.id)}
                    >
                      <AgentAvatar
                        agent={activeAgentDef}
                        size="sm"
                        fallback="sparkles"
                        className={styles.sessionAvatar}
                      />
                      <span className={styles.sessionTitle}>{session.title}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.iconGhost}
                      title={t('workbench.forkSession')}
                      aria-label={t('workbench.forkSession')}
                      onClick={() => onForkSession(session.id)}
                    >
                      ⎇
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
            <button
              type="button"
              className={styles.expandRailBtn}
              title={t('workbench.newSession')}
              aria-label={t('workbench.newSession')}
              onClick={onNewSession}
            >
              <IconPlus />
            </button>
          </div>
        )}
      </aside>

      <section className={styles.chatShell}>
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
              <AgentAvatar agent={activeAgentDef} size="md" fallback="sparkles" className={styles.headAvatar} />
              <strong>{activeAgentName}</strong>
              <span className={styles.crumbSep}>›</span>
              <span>{activeSession?.title ?? t('workbench.newSession')}</span>
            </div>
          </div>
          <div className={styles.headActions}>
            <button
              type="button"
              className={`${styles.chipLink} ${trajectoryOpen ? styles.chipLinkActive : ''}`}
              title={t('workbench.trajectory')}
              onClick={() => {
                setTrajectoryOpen((v) => !v)
                if (!trajectoryOpen) {
                  setMemoryOpen(false)
                  setArtifactsOpen(false)
                  setTerminalOpen(false)
                }
              }}
            >
              {t('workbench.trajectory')}
            </button>
            <button
              type="button"
              className={`${styles.chipLink} ${terminalOpen ? styles.chipLinkActive : ''}`}
              title={t('workbench.terminal')}
              onClick={() => {
                setTerminalOpen((v) => !v)
                if (!terminalOpen) {
                  setMemoryOpen(false)
                  setArtifactsOpen(false)
                  setTrajectoryOpen(false)
                }
              }}
            >
              {t('workbench.terminal')}
            </button>
            <button
              type="button"
              className={`${styles.chipLink} ${memoryOpen ? styles.chipLinkActive : ''}`}
              title={t('workbench.memory')}
              onClick={() => {
                setMemoryOpen((v) => !v)
                if (!memoryOpen) {
                  setArtifactsOpen(false)
                  setTrajectoryOpen(false)
                  setTerminalOpen(false)
                }
              }}
            >
              {t('workbench.memory')}
            </button>
            <button
              type="button"
              className={`${styles.chipLink} ${artifactsOpen ? styles.chipLinkActive : ''}`}
              title={t('workbench.artifacts')}
              onClick={() => {
                setArtifactsOpen((v) => !v)
                if (!artifactsOpen) {
                  setMemoryOpen(false)
                  setTrajectoryOpen(false)
                  setTerminalOpen(false)
                }
              }}
            >
              {t('workbench.artifacts')}
              {artifacts.length > 0 ? ` (${artifacts.length})` : ''}
            </button>
            <Link className={styles.chipLink} to="/settings">
              <IconKey />
              {t('workbench.modelSettings')}
            </Link>
          </div>
        </header>

        <div className={styles.messages}>
          {messages.length === 0 && !activeStreaming ? (
            <div className={styles.empty}>
              <div className={styles.emptyMark}>{agentIcon(activeAgentDef)}</div>
              <h1 className={styles.emptyTitle}>{activeAgentName}</h1>
              <p className={styles.emptySub}>
                {directMode
                  ? t('workbench.welcomeDirect')
                  : t('workbench.welcome', { agent: activeAgentName })}
              </p>
              <div className={styles.chips}>
                {quickChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className={styles.chip}
                    onClick={() => {
                      if (chip.action === 'workflow_brief') {
                        void runDailyBriefWorkflow()
                        return
                      }
                      if (chip.action === 'workflow_research') {
                        setArmedWorkflow('deep_research')
                        setActiveCap('research')
                        void ensureSession(activeAgent).then((sid) => {
                          appendMessage(sid, 'system', t('workbench.workflow.armedResearch'))
                          refreshForSession(sid)
                          inputRef.current?.focus()
                        })
                        return
                      }
                      if (chip.action === 'create_agent') {
                        setActiveCap('create_agent')
                        void ensureSession(activeAgent).then((sid) => {
                          appendMessage(sid, 'system', t('workbench.capArmedCreateAgent'))
                          refreshForSession(sid)
                          setDraft(t('workbench.chip.createAgentDraft'))
                          inputRef.current?.focus()
                        })
                        return
                      }
                      void sendText(chip.label)
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.msgList}>
              {workflowSteps.length > 0 ? (
                <WorkflowStepsCard title={workflowTitle} steps={workflowSteps} />
              ) : null}
              {messages.map((msg) => {
                if (msg.role === 'system') {
                  return (
                    <div key={msg.id} className={styles.bubbleRow}>
                      <div className={`${styles.bubble} ${styles.bubbleSystem}`}>{msg.content}</div>
                    </div>
                  )
                }
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className={`${styles.bubbleRow} ${styles.bubbleRowUser}`}>
                      <div className={`${styles.bubble} ${styles.bubbleUser}`}>{msg.content}</div>
                      <UserAvatar size="md" className={styles.msgAvatar} label={t('workbench.you')} />
                    </div>
                  )
                }
                return (
                  <div key={msg.id} className={`${styles.bubbleRow} ${styles.bubbleRowAssistant}`}>
                    <AgentAvatar
                      agent={activeAgentDef}
                      size="md"
                      fallback="sparkles"
                      className={styles.msgAvatar}
                    />
                    <div className={styles.assistantMessage}>
                      {renderAssistantBody(msg.content)}
                      {msg.citations?.length ? (
                        <div className={styles.citations}>
                          <div className={styles.citationsTitle}>{t('workbench.citations')}</div>
                          {msg.citations.slice(0, 6).map((c) => (
                            <details key={c.chunkId} className={styles.citationItem}>
                              <summary>
                                {c.title}
                                <span>#{c.ordinal + 1}</span>
                              </summary>
                              <p>{c.text}</p>
                            </details>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
              {activeStreaming && streamSessionId === activeId ? (
                <div className={`${styles.bubbleRow} ${styles.bubbleRowAssistant}`}>
                  <AgentAvatar
                    agent={activeAgentDef}
                    size="md"
                    fallback="sparkles"
                    className={styles.msgAvatar}
                  />
                  <div className={styles.assistantMessage}>
                    {streamText ? (
                      renderAssistantBody(streamText, { streaming: true })
                    ) : (
                      <ThinkingIndicator
                        label={
                          streamStatus ||
                          (streamToolSteps.length > 0
                            ? t('workbench.tools.running', { count: streamToolSteps.length })
                            : t('workbench.thinking'))
                        }
                      />
                    )}
                    {streamCitations.length > 0 && streamText ? (
                      <div className={styles.citations}>
                        <div className={styles.citationsTitle}>{t('workbench.citations')}</div>
                        {streamCitations.slice(0, 4).map((c) => (
                          <div key={c.chunkId} className={styles.citationItem}>
                            <strong>{c.title}</strong>
                            <span>#{c.ordinal + 1}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <p className={styles.disclaimer}>{t('workbench.disclaimer')}</p>
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className={styles.composerWrap}>
          <div className={styles.composer}>
          {skillPickerOpen ? (
            <div className={styles.skillPicker}>
              <div className={styles.skillPickerHead}>
                <strong>{t('workbench.skillPickerTitle')}</strong>
                <button
                  type="button"
                  className={styles.ghostMini}
                  onClick={() => setSkillPickerOpen(false)}
                >
                  {t('knowledge.cancel')}
                </button>
              </div>
              <div className={styles.skillGrid}>
                {(installedSkills.length
                  ? installedSkills.map((skill) => ({
                      id: skill.id,
                      label: skill.name,
                      desc: skill.description,
                    }))
                  : WORKBENCH_SKILLS.map((skill) => ({
                      id: skill.id,
                      label: t(skill.labelKey),
                      desc: '',
                    }))
                ).map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    className={`${styles.skillCard} ${
                      activeSkillId === skill.id ? styles.skillCardActive : ''
                    }`}
                    title={skill.desc}
                    onClick={() => {
                      setActiveSkillId(skill.id)
                      setActiveCap('skills')
                      setSkillPickerOpen(false)
                      inputRef.current?.focus()
                    }}
                  >
                    {skill.label}
                  </button>
                ))}
              </div>
              <div className={styles.skillInstall}>
                <Link
                  className={styles.ghostMini}
                  to="/settings"
                  state={{ section: 'skills' }}
                  onClick={() => setSkillPickerOpen(false)}
                >
                  {t('workbench.skillManageInSettings')}
                </Link>
              </div>
              {skillCatalogs.length ? (
                <div className={styles.skillCatalogs}>
                  {skillCatalogs.map((c) => (
                    <a key={c.id} href={c.url} target="_blank" rel="noreferrer">
                      {c.name}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {activeCap &&
          ['write', 'translate', 'research', 'skills', 'image', 'video', 'music', 'create_agent'].includes(activeCap) ? (
            <div className={styles.modePanel}>
              <div className={styles.modePanelHead}>
                <div className={styles.modePanelTitle}>
                  <span className={styles.modePanelIcon}>{capabilityIcon(activeCap)}</span>
                  <strong>
                    {t(`workbench.cap.${activeCap}` as 'workbench.cap.image')}
                    {activeCap === 'skills' && activeSkillId
                      ? ` · ${
                          installedSkills.find((s) => s.id === activeSkillId)?.name ||
                          t(
                            (WORKBENCH_SKILLS.find((s) => s.id === activeSkillId)?.labelKey ||
                              'workbench.cap.skills') as 'workbench.cap.skills',
                          )
                        }`
                      : ''}
                  </strong>
                </div>
                <button
                  type="button"
                  className={styles.modePanelClose}
                  onClick={() => {
                    setActiveCap(null)
                    setActiveSkillId(null)
                  }}
                  title={t('workbench.mode.clear')}
                >
                  {t('workbench.mode.clear')} ×
                </button>
              </div>
              {(CAPABILITY_OPTION_GROUPS[activeCap] ?? []).map((group) => (
                <div key={group.id} className={styles.modeOptRow}>
                  <span className={styles.modeOptLabel}>{t(group.labelKey)}</span>
                  <div className={styles.modeOptChips} role="group" aria-label={t(group.labelKey)}>
                    {group.choices.map((choice) => {
                      const selected = (capOptions[group.id] ?? DEFAULT_CAP_OPTIONS[group.id]) === choice.value
                      return (
                        <button
                          key={choice.value}
                          type="button"
                          className={`${styles.modeOptChip} ${selected ? styles.modeOptChipActive : ''}`}
                          aria-pressed={selected}
                          onClick={() =>
                            setCapOptions((prev) => ({
                              ...prev,
                              [group.id as CapOptionGroupId]: choice.value,
                            }))
                          }
                        >
                          {t(choice.labelKey)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
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
              onChange={(e) => {
                const value = e.target.value
                setDraft(value)
                draftByAgentRef.current[String(activeAgent)] = value
              }}
              onKeyDown={onKeyDown}
              placeholder={
                activeCap === 'image'
                  ? t('workbench.placeholder.image')
                  : activeCap === 'video'
                    ? t('workbench.placeholder.video')
                    : activeCap === 'music'
                      ? t('workbench.placeholder.music')
                      : activeCap === 'translate'
                        ? t('workbench.placeholder.translate')
                        : activeCap === 'write'
                          ? t('workbench.placeholder.write')
                          : activeCap === 'research'
                            ? t('workbench.placeholder.research')
                            : activeCap === 'create_agent'
                              ? t('workbench.placeholder.createAgent')
                              : t('workbench.inputPlaceholder')
              }
              rows={2}
            />
            <div
              className={styles.composerBar}
              role="toolbar"
              aria-label={t('workbench.capabilities')}
              ref={composerBarRef}
            >
              <div className={styles.capMeasure} ref={capMeasureRef} aria-hidden>
                {allPrimaryCaps.map((cap) => (
                  <span key={cap.id} className={styles.capItem}>
                    <span className={styles.capIcon}>{capabilityIcon(cap.id)}</span>
                    <span>{t(cap.labelKey)}</span>
                  </span>
                ))}
                <span className={styles.capItem}>
                  <span className={styles.capIcon}>
                    <IconGrid />
                  </span>
                  <span>{t('workbench.cap.more')}</span>
                </span>
              </div>
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
              <div className={styles.composerRight} ref={composerRightRef}>
                {modelGroups.length > 0 ? (
                  <label className={styles.modelSelectWrap}>
                    <select
                      className={styles.modelSelect}
                      value={
                        activeProviderId && selectedModel
                          ? encodeChatModelRef(activeProviderId, selectedModel)
                          : ''
                      }
                      onChange={(e) => void onModelChange(e.target.value)}
                      title={t('workbench.selectModel')}
                    >
                      {modelGroups.map((group) => (
                        <optgroup key={group.id} label={group.name}>
                          {group.models.map((m) => (
                            <option key={`${group.id}::${m}`} value={encodeChatModelRef(group.id, m)}>
                              {m}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                ) : (
                  <Link className={styles.modelPill} to="/settings">
                    {t('workbench.configureModel')}
                  </Link>
                )}
                {modelGroups.length > 0 && !hasApiKey && !localEndpoint ? (
                  <Link className={styles.keyWarn} to="/settings">
                    {t('workbench.missingApiKey')}
                  </Link>
                ) : null}
                {localEndpoint ? (
                  <span className={styles.localTag} title={aiBaseUrl}>
                    {t('workbench.localModel')}
                  </span>
                ) : null}
                <button
                  type="button"
                  className={activeStreaming ? styles.stopBtn : styles.sendBtn}
                  disabled={!activeStreaming && !draft.trim() && attachments.length === 0}
                  onClick={() => (activeStreaming ? onStopGeneration() : void sendText(draft))}
                  aria-label={activeStreaming ? t('workbench.stop') : t('workbench.send')}
                >
                  {activeStreaming ? <IconClose /> : <IconSend />}
                </button>
              </div>
            </div>
          </div>
          <p className={styles.hint}>{t('workbench.inputHint')}</p>
        </div>
      </section>
      <ArtifactsPanel
        open={artifactsOpen}
        artifacts={artifacts}
        activeId={activeArtifactId}
        onSelect={setActiveArtifactId}
        onClose={() => setArtifactsOpen(false)}
        onDelete={(id) => {
          deleteArtifact(id)
          const next = listArtifacts(activeId ?? undefined)
          setArtifacts(next)
          setActiveArtifactId(next[0]?.id ?? null)
        }}
      />
      <MemoryPanel
        open={memoryOpen}
        agentId={String(activeAgent)}
        agentName={activeAgentName}
        onClose={() => setMemoryOpen(false)}
      />
      <TrajectoryPanel
        open={trajectoryOpen}
        sessionId={activeId}
        refreshKey={trajectoryTick}
        liveEvents={liveSessionEvents}
        onOpenChildSession={openChildSession}
        onForkAtSeq={onForkAtSeq}
        onClose={() => setTrajectoryOpen(false)}
      />
      <TerminalPanel
        open={terminalOpen}
        sessionId={activeId}
        refreshKey={terminalTick}
        liveEvents={liveSessionEvents}
        onClose={() => setTerminalOpen(false)}
      />
      </section>
      {pendingApproval ? (
        <ToolApprovalModal
          request={pendingApproval}
          onResolve={(approved) => {
            const req = pendingApproval
            setPendingApproval(null)
            if (activeId) pendingApprovalBySessionRef.current.delete(activeId)
            void window.treasureChest.resolveToolApproval({
              streamId: req.streamId,
              toolCallId: req.toolCallId,
              approved,
            })
          }}
        />
      ) : null}
    </div>
  )
}
