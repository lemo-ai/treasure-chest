import type { AgentId } from '@renderer/features/agents/lib/agentRegistry'
import type { HarnessMessage, HarnessStoreSnapshot } from '@shared'

export type WorkbenchAgentId = AgentId

export type WorkbenchSession = HarnessStoreSnapshot['sessions'][number]
export type WorkbenchMessage = HarnessMessage

const STORAGE_KEY = 'qiankun.workbench.v1'

interface LegacyStore {
  sessions: WorkbenchSession[]
  activeSessionId: string | null
  messagesBySession: Record<string, WorkbenchMessage[]>
}

let cache: HarnessStoreSnapshot | null = null
let hydratePromise: Promise<void> | null = null

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function readLegacy(): LegacyStore | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LegacyStore
    if (!parsed || !Array.isArray(parsed.sessions)) return null
    return parsed
  } catch {
    return null
  }
}

function emptySnapshot(): HarnessStoreSnapshot {
  return {
    sessions: [],
    activeSessionId: null,
    activeSessionIdByAgent: {},
    messagesBySession: {},
  }
}

function ensureCache(): HarnessStoreSnapshot {
  if (!cache) return emptySnapshot()
  if (!cache.activeSessionIdByAgent) cache.activeSessionIdByAgent = {}
  return cache
}

/** Load harness store from main process; migrates legacy localStorage once. */
export async function hydrateSessionStore(): Promise<void> {
  if (cache) return
  if (hydratePromise) return hydratePromise
  hydratePromise = (async () => {
    const legacy = readLegacy()
    if (legacy?.sessions.length) {
      await window.treasureChest.harnessMigrateLocal({
        sessions: legacy.sessions.map((s) => ({
          id: s.id,
          agentId: String(s.agentId),
          title: s.title,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })),
        activeSessionId: legacy.activeSessionId,
        messagesBySession: legacy.messagesBySession,
      })
      localStorage.removeItem(STORAGE_KEY)
    }
    cache = await window.treasureChest.harnessGetStore()
    if (!cache.activeSessionIdByAgent) cache.activeSessionIdByAgent = {}
  })()
  await hydratePromise
}

async function persistActive(id: string | null, agentId?: string): Promise<void> {
  await window.treasureChest.harnessSetActiveSession(id, agentId)
}

export function listSessions(agentId?: WorkbenchAgentId): WorkbenchSession[] {
  const store = ensureCache()
  const list = agentId ? store.sessions.filter((s) => s.agentId === agentId) : store.sessions
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Global last-active (compat). Prefer getActiveSessionIdForAgent. */
export function getActiveSessionId(): string | null {
  return ensureCache().activeSessionId
}

export function getActiveSessionIdForAgent(agentId: string): string | null {
  const store = ensureCache()
  const id = store.activeSessionIdByAgent?.[agentId]
  return typeof id === 'string' ? id : null
}

/** Set active session for an agent (isolated). Also updates global pointer. */
export function setActiveSessionId(id: string | null, agentId?: string): void {
  const store = ensureCache()
  let resolvedAgent = agentId
  if (!resolvedAgent && id) {
    resolvedAgent = store.sessions.find((s) => s.id === id)?.agentId
  }
  if (resolvedAgent) {
    store.activeSessionIdByAgent = {
      ...(store.activeSessionIdByAgent ?? {}),
      [resolvedAgent]: id,
    }
  }
  store.activeSessionId = id
  void persistActive(id, resolvedAgent)
}

export async function forkSession(sourceSessionId: string, boundarySeq?: number): Promise<WorkbenchSession | null> {
  const events = await window.treasureChest.harnessListEvents(sourceSessionId)
  const boundary = boundarySeq ?? events.at(-1)?.seq
  const forked = await window.treasureChest.harnessForkSession({
    sourceSessionId,
    boundarySeq: boundary,
  })
  if (!forked) return null
  const store = ensureCache()
  store.sessions = [forked, ...store.sessions.filter((s) => s.id !== forked.id)]
  store.messagesBySession[forked.id] = await reloadMessages(forked.id)
  setActiveSessionId(forked.id, forked.agentId)
  return forked
}

export function getSession(id: string): WorkbenchSession | undefined {
  return ensureCache().sessions.find((s) => s.id === id)
}

export async function createSession(agentId: WorkbenchAgentId, title: string): Promise<WorkbenchSession> {
  const id = uid('ses')
  const session = await window.treasureChest.harnessCreateSession(String(agentId), title, id)
  const store = ensureCache()
  store.sessions = [session, ...store.sessions.filter((s) => s.id !== session.id)]
  store.messagesBySession[session.id] = store.messagesBySession[session.id] ?? []
  setActiveSessionId(session.id, String(agentId))
  return session
}

export function renameSession(id: string, title: string): void {
  const store = ensureCache()
  const hit = store.sessions.find((s) => s.id === id)
  if (!hit) return
  hit.title = title
  hit.updatedAt = new Date().toISOString()
  void window.treasureChest.harnessRenameSession(id, title)
}

export async function deleteSession(id: string): Promise<boolean> {
  const store = ensureCache()
  const removed = store.sessions.find((s) => s.id === id)
  store.sessions = store.sessions.filter((s) => s.id !== id)
  delete store.messagesBySession[id]

  const agentId = removed?.agentId
  const wasActiveForAgent = agentId
    ? store.activeSessionIdByAgent?.[agentId] === id
    : false
  const wasGlobalActive = store.activeSessionId === id

  if (wasActiveForAgent && agentId) {
    const nextSameAgent = store.sessions.find((s) => s.agentId === agentId)
    setActiveSessionId(nextSameAgent?.id ?? null, agentId)
  } else if (wasGlobalActive) {
    const nextSameAgent = agentId
      ? store.sessions.find((s) => s.agentId === agentId)
      : undefined
    setActiveSessionId(nextSameAgent?.id ?? store.sessions[0]?.id ?? null, agentId)
  }

  const ok = await window.treasureChest.harnessDeleteSession(id)
  if (!ok) {
    await reloadHarnessStore()
  }
  return ok
}

export function listMessages(sessionId: string): WorkbenchMessage[] {
  return ensureCache().messagesBySession[sessionId] ?? []
}

export async function reloadMessages(sessionId: string): Promise<WorkbenchMessage[]> {
  const msgs = await window.treasureChest.harnessListMessages(sessionId)
  ensureCache().messagesBySession[sessionId] = msgs
  return msgs
}

export function appendMessage(
  sessionId: string,
  role: WorkbenchMessage['role'],
  content: string,
  citations?: WorkbenchMessage['citations'],
  toolSteps?: WorkbenchMessage['toolSteps'],
  opts?: { retryable?: boolean },
): WorkbenchMessage {
  const store = ensureCache()
  const now = new Date().toISOString()

  if (role === 'user') {
    void window.treasureChest.harnessAppendUserMessage(sessionId, content)
    const msg: WorkbenchMessage = {
      id: `msg_${Date.now().toString(36)}`,
      role: 'user',
      content,
      createdAt: now,
    }
    const list = store.messagesBySession[sessionId] ?? []
    list.push(msg)
    store.messagesBySession[sessionId] = list
    const session = store.sessions.find((s) => s.id === sessionId)
    if (session) {
      session.updatedAt = now
      if (session.title === '新会话' || session.title === 'New chat') {
        session.title = content.trim().slice(0, 24) || session.title
        void window.treasureChest.harnessRenameSession(sessionId, session.title)
      }
    }
    return msg
  }

  if (role === 'system') {
    const persistContent = opts?.retryable ? `RETRYABLE::${content}` : content
    void window.treasureChest.harnessAppendSystemMessage(sessionId, persistContent)
    const msg: WorkbenchMessage = {
      id: `msg_${Date.now().toString(36)}`,
      role: 'system',
      content,
      createdAt: now,
      ...(opts?.retryable ? { retryable: true } : {}),
    }
    const list = store.messagesBySession[sessionId] ?? []
    list.push(msg)
    store.messagesBySession[sessionId] = list
    return msg
  }

  const msg: WorkbenchMessage = {
    id: `msg_${Date.now().toString(36)}`,
    role: 'assistant',
    content,
    createdAt: now,
    ...(citations?.length ? { citations } : {}),
    ...(toolSteps?.length ? { toolSteps } : {}),
  }
  const list = store.messagesBySession[sessionId] ?? []
  list.push(msg)
  store.messagesBySession[sessionId] = list
  const session = store.sessions.find((s) => s.id === sessionId)
  if (session) session.updatedAt = now
  return msg
}

/** Sync messages from harness event log after agent turn completes. */
export async function syncFromHarness(sessionId: string): Promise<WorkbenchMessage[]> {
  return reloadMessages(sessionId)
}

/** Reload full harness snapshot from main (e.g. after async session title). */
export async function reloadHarnessStore(): Promise<HarnessStoreSnapshot> {
  cache = await window.treasureChest.harnessGetStore()
  if (!cache.activeSessionIdByAgent) cache.activeSessionIdByAgent = {}
  return cache
}
