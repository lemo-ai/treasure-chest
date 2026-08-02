import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  IconBook,
  IconChatBubble,
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
  DIRECT_CHAT_DEF,
  DIRECT_CHAT_ID,
  agentDisplayName,
  getAgent,
  isDirectChatId,
  type AgentDef,
  type AgentId,
} from '@renderer/features/agents/lib/agentRegistry'
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
import type {
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
  getActiveSessionId,
  listMessages,
  listSessions,
  setActiveSessionId,
  type WorkbenchMessage,
  type WorkbenchSession,
} from '../lib/sessionStore'
import { MarkdownMessage } from '../components/MarkdownMessage'
import { ToolStepsCard } from '../components/ToolStepsCard'
import { ArtifactsPanel } from '../components/ArtifactsPanel'
import { MemoryPanel } from '../components/MemoryPanel'
import { ToolApprovalModal } from '../components/ToolApprovalModal'
import {
  clearSessionArtifacts,
  deleteArtifact,
  extractArtifactsFromContent,
  listArtifacts,
  type WorkbenchArtifact,
} from '../lib/artifactStore'
import { memoryFactsForPrompt } from '../lib/agentMemoryStore'
import type { ToolApprovalRequest } from '@shared'
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

function agentIcon(agent: AgentDef): React.JSX.Element {
  if (isDirectChatId(String(agent.id))) return <IconChatBubble />
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
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [panelOpen, setPanelOpen] = useState(readPanelOpen)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeAgent, setActiveAgent] = useState<AgentId>(DIRECT_CHAT_ID)
  const [sessions, setSessions] = useState<WorkbenchSession[]>([])
  const [messages, setMessages] = useState<WorkbenchMessage[]>([])
  const [draft, setDraft] = useState('')
  const [activeCap, setActiveCap] = useState<WorkbenchCapabilityId | null>(null)
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null)
  const [skillPickerOpen, setSkillPickerOpen] = useState(false)
  const [streamCitations, setStreamCitations] = useState<KnowledgeCitation[]>([])
  const [streamToolSteps, setStreamToolSteps] = useState<LlmToolStep[]>([])
  const [artifactsOpen, setArtifactsOpen] = useState(false)
  const [artifacts, setArtifacts] = useState<WorkbenchArtifact[]>([])
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [pendingApproval, setPendingApproval] = useState<ToolApprovalRequest | null>(null)
  const [installedSkills, setInstalledSkills] = useState<InstalledSkillRow[]>([])
  const [skillInstallRef, setSkillInstallRef] = useState('')
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
  const [selectedModel, setSelectedModel] = useState('')
  const [aiBaseUrl, setAiBaseUrl] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [mediaCaps, setMediaCaps] = useState<MediaCapabilitiesSnapshot | null>(null)
  const [capOptions, setCapOptions] = useState<CapOptionValues>({ ...DEFAULT_CAP_OPTIONS })
  const [sending, setSending] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [streamStatus, setStreamStatus] = useState('')
  const [streamSessionId, setStreamSessionId] = useState<string | null>(null)
  const streamSessionRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const refresh = (preferSessionId?: string | null, forAgent?: AgentId): void => {
    const agentId = forAgent ?? activeAgent
    const all = listSessions()
    setSessions(all)
    const scoped = all.filter((s) => s.agentId === agentId)
    const preferred =
      preferSessionId && scoped.some((s) => s.id === preferSessionId)
        ? preferSessionId
        : null
    const current = getActiveSessionId()
    const keepCurrent = current && scoped.some((s) => s.id === current) ? current : null
    const nextId = preferred ?? keepCurrent ?? scoped[0]?.id ?? null
    setActiveId(nextId)
    if (nextId) {
      setActiveSessionId(nextId)
      setMessages(listMessages(nextId))
      const arts = listArtifacts(nextId)
      setArtifacts(arts)
      setActiveArtifactId((prev) => (prev && arts.some((a) => a.id === prev) ? prev : arts[0]?.id ?? null))
    } else {
      setMessages([])
      setArtifacts([])
      setActiveArtifactId(null)
    }
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

  useEffect(() => {
    const applyAiSettings = (fortune: {
      aiModels?: string[]
      aiModel?: string
      aiApiKey?: string
      aiBaseUrl?: string
    } | undefined): void => {
      const models = (fortune?.aiModels ?? []).map((m) => m.trim()).filter(Boolean)
      setModelOptions(models)
      const selected =
        fortune?.aiModel && models.includes(fortune.aiModel)
          ? fortune.aiModel
          : (models[0] ?? '')
      setSelectedModel(selected)
      setAiBaseUrl(fortune?.aiBaseUrl || '')
      setHasApiKey(Boolean(fortune?.aiApiKey?.trim()))
    }

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
    const agentId = searchParams.get('agent')
    const next: AgentId =
      !agentId || isDirectChatId(agentId)
        ? DIRECT_CHAT_ID
        : getAgent(agentId)
          ? agentId
          : DIRECT_CHAT_ID
    setActiveAgent(next)
    refresh(null, next)
  }, [searchParams])

  useEffect(() => {
    const agent = getAgent(activeAgent)
    if (
      agent &&
      !agent.builtin &&
      agent.preferredModel &&
      modelOptions.includes(agent.preferredModel)
    ) {
      setSelectedModel(agent.preferredModel)
    }
  }, [activeAgent, modelOptions])

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_KEY, panelOpen ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [panelOpen])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, activeId, sending, streamText])

  const togglePanel = (): void => setPanelOpen((v) => !v)

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  )

  const activeAgentDef = getAgent(activeAgent) ?? DIRECT_CHAT_DEF
  const directMode = isDirectChatId(String(activeAgent))
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

  const ensureSession = (agentId: AgentId): string => {
    if (activeSession && activeSession.agentId === agentId) return activeSession.id
    const title = i18n.language.startsWith('zh') ? '新会话' : 'New chat'
    const created = createSession(agentId, title)
    refresh(created.id, agentId)
    return created.id
  }

  const onNewSession = (): void => {
    const title = i18n.language.startsWith('zh') ? '新会话' : 'New chat'
    const created = createSession(activeAgent, title)
    refresh(created.id, activeAgent)
    inputRef.current?.focus()
  }

  const onSelectSession = (id: string): void => {
    setActiveSessionId(id)
    refresh(id, activeAgent)
  }

  const onDeleteSession = (id: string): void => {
    clearSessionArtifacts(id)
    deleteSession(id)
    refresh(null, activeAgent)
  }

  const localEndpoint = isLocalLlmBaseUrl(aiBaseUrl)

  const sendText = async (text: string): Promise<void> => {
    const content = text.trim()
    if ((!content && attachments.length === 0) || sending) return
    if (!selectedModel) {
      const sessionId = ensureSession(activeAgent)
      appendMessage(sessionId, 'system', t('workbench.needModel'))
      refresh(sessionId)
      return
    }
    if (!hasApiKey && !localEndpoint) {
      const sessionId = ensureSession(activeAgent)
      appendMessage(sessionId, 'system', t('workbench.needApiKey'))
      refresh(sessionId)
      return
    }

    const sessionId = ensureSession(activeAgent)
    const fileLine =
      attachments.length > 0
        ? `\n${t('workbench.attachedFiles', { files: attachments.map((a) => a.name).join('、') })}`
        : ''
    appendMessage(sessionId, 'user', `${content}${fileLine}`.trim())
    setDraft('')
    setAttachments([])
    setSending(true)
    setStreamText('')
    setStreamStatus('')
    streamSessionRef.current = sessionId
    setStreamSessionId(sessionId)
    refresh(sessionId)

    const history = listMessages(sessionId)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

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
    const enabledMcpServerIds =
      !directMode && !activeAgentDef.builtin ? activeAgentDef.enabledMcpServerIds : undefined
    const chatModel =
      !directMode &&
      !activeAgentDef.builtin &&
      activeAgentDef.preferredModel &&
      modelOptions.includes(activeAgentDef.preferredModel)
        ? activeAgentDef.preferredModel
        : selectedModel
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
      if (activeCap === 'image') {
        setStreamStatus(t('workbench.imageGenerating'))
        const img = await window.treasureChest.generateImage({
          prompt: content,
          size: imageSizeFromOptions(capOptions),
          style: capOptions.imageStyle,
          quality: capOptions.imageQuality,
        })
        if (streamSessionRef.current === sessionId) {
          if (img.ok && img.url) {
            const meta = [
              capOptions.imageAspect,
              capOptions.imageQuality,
              capOptions.imageStyle,
            ]
              .filter(Boolean)
              .join(' · ')
            const md = `![${content.slice(0, 40)}](${img.url})\n\n${t('workbench.imageDone')}${
              meta ? ` (${meta})` : ''
            }`
            appendAssistant(sessionId, md)
          } else {
            appendMessage(
              sessionId,
              'system',
              t('workbench.chatFailed', { error: img.error || t('workbench.chatUnknownError') }),
            )
          }
        }
      } else if (activeCap === 'video') {
        setStreamStatus(t('workbench.videoGenerating'))
        const vid = await window.treasureChest.generateVideo({
          prompt: content,
          durationSec: Number(capOptions.videoDuration || 5),
          aspectRatio: capOptions.videoAspect,
          resolution: capOptions.videoResolution,
        })
        if (streamSessionRef.current === sessionId) {
          if (vid.ok && (vid.text || vid.url)) {
            appendAssistant(sessionId, vid.text || `[video](${vid.url})`)
          } else {
            appendMessage(
              sessionId,
              'system',
              t('workbench.chatFailed', { error: vid.error || t('workbench.chatUnknownError') }),
            )
          }
        }
      } else if (activeCap === 'music') {
        setStreamStatus(t('workbench.musicGenerating'))
        const music = await window.treasureChest.generateMusic({
          prompt: content,
          durationSec: Number(capOptions.musicDuration || 60),
          style: capOptions.musicStyle,
          instrumental: capOptions.musicInstrumental !== 'no',
        })
        if (streamSessionRef.current === sessionId) {
          if (music.ok && (music.text || music.url)) {
            appendAssistant(sessionId, music.text || `[audio](${music.url})`)
          } else {
            appendMessage(
              sessionId,
              'system',
              t('workbench.chatFailed', { error: music.error || t('workbench.chatUnknownError') }),
            )
          }
        }
      } else {
        setStreamCitations([])
        setStreamToolSteps([])
        const capabilityMode =
          activeCap && ['write', 'translate', 'research', 'skills'].includes(activeCap)
            ? activeCap
            : undefined
        const res = await window.treasureChest.workbenchChatStream(
          {
            agentId: directMode ? DIRECT_CHAT_ID : String(activeAgent),
            model: chatModel,
            messages: history,
            systemPrompt:
              !directMode && !activeAgentDef.builtin ? activeAgentDef.systemPrompt : undefined,
            locale: i18n.language,
            useKnowledge,
            knowledgeCollectionId,
            enabledMcpServerIds,
            memoryFacts: memoryFactsForPrompt(String(activeAgent)),
            capabilityMode,
            skillPrompt: mergedSkillPrompt || undefined,
          },
          (delta) => {
            if (streamSessionRef.current !== sessionId) return
            setStreamStatus('')
            setStreamText((prev) => prev + delta)
          },
          (status) => {
            if (streamSessionRef.current !== sessionId) return
            setStreamStatus(status)
          },
          (citations) => {
            if (streamSessionRef.current !== sessionId) return
            setStreamCitations(citations)
          },
          (step) => {
            if (streamSessionRef.current !== sessionId) return
            setStreamToolSteps((prev) => {
              const idx = prev.findIndex((s) => s.id === step.id)
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = step
                return next
              }
              return [...prev, step]
            })
          },
          (request) => {
            if (streamSessionRef.current !== sessionId) return
            setPendingApproval(request)
          },
        )
        if (streamSessionRef.current === sessionId) {
          if (res.ok && res.text?.trim()) {
            appendAssistant(sessionId, res.text.trim(), res.citations, res.toolSteps)
          } else {
            appendMessage(
              sessionId,
              'system',
              t('workbench.chatFailed', { error: res.error || t('workbench.chatUnknownError') }),
            )
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (streamSessionRef.current === sessionId) {
        appendMessage(sessionId, 'system', t('workbench.chatFailed', { error: msg }))
      }
    } finally {
      if (streamSessionRef.current === sessionId) {
        streamSessionRef.current = null
        setStreamSessionId(null)
        setStreamText('')
        setStreamStatus('')
        setStreamCitations([])
        setStreamToolSteps([])
        setSending(false)
        refresh(sessionId)
      } else {
        setSending(false)
        setStreamText('')
        setStreamStatus('')
        setStreamCitations([])
        setStreamToolSteps([])
        setStreamSessionId(null)
      }
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendText(draft)
    }
  }

  const onCapability = (id: WorkbenchCapabilityId): void => {
    setMoreOpen(false)
    const capMeta = WORKBENCH_CAPABILITIES.find((c) => c.id === id)
    const capName = capMeta ? t(capMeta.labelKey) : id
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
      const sessionId = ensureSession(activeAgent)
      appendMessage(sessionId, 'system', t('workbench.mcpHint'))
      refresh(sessionId)
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
    if (id === 'image' || id === 'write' || id === 'translate' || id === 'research' || id === 'video' || id === 'music') {
      if (id === 'image' || id === 'video' || id === 'music') {
        const level = mediaLevelOf(id)
        if (level === 'no') {
          explainMediaCap(id)
          return
        }
        if (level === 'maybe') {
          explainMediaCap(id)
        }
      }
      setActiveCap((prev) => (prev === id ? null : id))
      inputRef.current?.focus()
      const sessionId = ensureSession(activeAgent)
      if (mediaLevelOf(id) !== 'maybe') {
        appendMessage(sessionId, 'system', t('workbench.capArmed', { name: capName }))
        refresh(sessionId)
      }
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
      const sessionId = ensureSession(activeAgent)
      appendMessage(sessionId, 'system', t('workbench.transcribePickHint'))
      refresh(sessionId)
      void (async () => {
        const filePath = await window.treasureChest.pickAudioFile()
        if (!filePath) {
          appendMessage(sessionId, 'system', t('workbench.transcribeCancelled'))
          refresh(sessionId)
          return
        }
        setSending(true)
        setStreamStatus(t('workbench.transcribeGenerating'))
        streamSessionRef.current = sessionId
        setStreamSessionId(sessionId)
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
          streamSessionRef.current = null
          setStreamSessionId(null)
          setStreamStatus('')
          setSending(false)
          refresh(sessionId)
        }
      })()
      return
    }
    const sessionId = ensureSession(activeAgent)
    appendMessage(sessionId, 'system', t('workbench.capSoon', { name: capName }))
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
      void window.treasureChest.getMediaCapabilities().then(setMediaCaps)
    } catch {
      /* ignore */
    }
  }

  const mediaLevelOf = (id: WorkbenchCapabilityId): MediaSupportLevel | null => {
    if (id !== 'image' && id !== 'video' && id !== 'music' && id !== 'transcribe') return null
    return mediaCaps?.capabilities[id as MediaCapabilityKind]?.level ?? 'maybe'
  }

  const explainMediaCap = (id: MediaCapabilityKind): void => {
    const sessionId = ensureSession(activeAgent)
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
    refresh(sessionId)
  }

  const quickPrompts = directMode
    ? ['workbench.chip.direct1', 'workbench.chip.direct2', 'workbench.chip.direct3']
    : activeAgent === 'fortune'
      ? ['workbench.chip.fortune1', 'workbench.chip.fortune2', 'workbench.chip.fortune3']
      : activeAgent === 'stocks'
        ? ['workbench.chip.stocks1', 'workbench.chip.stocks2', 'workbench.chip.stocks3']
        : ['workbench.chip.custom1', 'workbench.chip.custom2', 'workbench.chip.custom3']

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
    const title = unavailable
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
          activeCap === cap.id ? styles.capItemActive : ''
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
              <strong>{activeAgentName}</strong>
              <span className={styles.crumbSep}>›</span>
              <span>{activeSession?.title ?? t('workbench.newSession')}</span>
            </div>
          </div>
          <div className={styles.headActions}>
            <button
              type="button"
              className={`${styles.chipLink} ${memoryOpen ? styles.chipLinkActive : ''}`}
              title={t('workbench.memory')}
              onClick={() => {
                setMemoryOpen((v) => !v)
                if (!memoryOpen) setArtifactsOpen(false)
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
                if (!artifactsOpen) setMemoryOpen(false)
              }}
            >
              {t('workbench.artifacts')}
              {artifacts.length > 0 ? ` (${artifacts.length})` : ''}
            </button>
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
          {messages.length === 0 && !sending ? (
            <div className={styles.empty}>
              <div className={styles.emptyMark}>{agentIcon(activeAgentDef)}</div>
              <h1 className={styles.emptyTitle}>{activeAgentName}</h1>
              <p className={styles.emptySub}>
                {directMode
                  ? t('workbench.welcomeDirect')
                  : t('workbench.welcome', { agent: activeAgentName })}
              </p>
              <div className={styles.chips}>
                {quickPrompts.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={styles.chip}
                    onClick={() => void sendText(t(key))}
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
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className={`${styles.bubbleRow} ${styles.bubbleRowUser}`}>
                      <div className={`${styles.bubble} ${styles.bubbleUser}`}>{msg.content}</div>
                    </div>
                  )
                }
                return (
                  <div key={msg.id} className={`${styles.bubbleRow} ${styles.bubbleRowAssistant}`}>
                    <div className={styles.assistantMessage}>
                      {msg.toolSteps?.length ? <ToolStepsCard steps={msg.toolSteps} /> : null}
                      <MarkdownMessage content={msg.content} />
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
              {sending && streamSessionId === activeId ? (
                <div className={`${styles.bubbleRow} ${styles.bubbleRowAssistant}`}>
                  <div
                    className={`${styles.assistantMessage} ${
                      streamText ? '' : styles.bubbleThinking
                    }`}
                  >
                    {streamToolSteps.length > 0 ? (
                      <ToolStepsCard steps={streamToolSteps} defaultOpen />
                    ) : null}
                    {streamText ? (
                      <MarkdownMessage content={streamText} streaming />
                    ) : streamToolSteps.length === 0 ? (
                      streamStatus || t('workbench.thinking')
                    ) : streamStatus ? (
                      <div className={styles.streamStatusHint}>{streamStatus}</div>
                    ) : null}
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
                <input
                  value={skillInstallRef}
                  onChange={(e) => setSkillInstallRef(e.target.value)}
                  placeholder={t('workbench.skillInstallPlaceholder')}
                />
                <button
                  type="button"
                  className={styles.ghostMini}
                  disabled={!skillInstallRef.trim()}
                  onClick={() => {
                    void (async () => {
                      try {
                        await window.treasureChest.installSkillFromGithub(skillInstallRef.trim())
                        const skills = await window.treasureChest.listSkills()
                        setInstalledSkills(skills)
                        setSkillInstallRef('')
                      } catch (err) {
                        const sessionId = ensureSession(activeAgent)
                        appendMessage(
                          sessionId,
                          'system',
                          t('workbench.skillInstallFailed', {
                            error: err instanceof Error ? err.message : String(err),
                          }),
                        )
                        refresh(sessionId)
                      }
                    })()
                  }}
                >
                  {t('workbench.skillInstall')}
                </button>
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
          ['write', 'translate', 'research', 'skills', 'image', 'video', 'music'].includes(activeCap) ? (
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
              onChange={(e) => setDraft(e.target.value)}
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
                {modelOptions.length > 0 && !hasApiKey && !localEndpoint ? (
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
                  className={styles.sendBtn}
                  disabled={sending || (!draft.trim() && attachments.length === 0)}
                  onClick={() => void sendText(draft)}
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
      </section>
      {pendingApproval ? (
        <ToolApprovalModal
          request={pendingApproval}
          onResolve={(approved) => {
            const req = pendingApproval
            setPendingApproval(null)
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
