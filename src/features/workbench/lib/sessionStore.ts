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

function ensureCache(): HarnessStoreSnapshot {
  if (!cache) {
    return { sessions: [], activeSessionId: null, messagesBySession: {} }
  }
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
  })()
  await hydratePromise
}

async function persistActive(id: string | null): Promise<void> {
  await window.treasureChest.harnessSetActiveSession(id)
}

export function listSessions(agentId?: WorkbenchAgentId): WorkbenchSession[] {
  const store = ensureCache()
  const list = agentId ? store.sessions.filter((s) => s.agentId === agentId) : store.sessions
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getActiveSessionId(): string | null {
  return ensureCache().activeSessionId
}

export function setActiveSessionId(id: string | null): void {
  const store = ensureCache()
  store.activeSessionId = id
  void persistActive(id)
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
  store.activeSessionId = forked.id
  await persistActive(forked.id)
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
  store.activeSessionId = session.id
  await persistActive(session.id)
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

export function deleteSession(id: string): void {
  const store = ensureCache()
  store.sessions = store.sessions.filter((s) => s.id !== id)
  delete store.messagesBySession[id]
  if (store.activeSessionId === id) {
    store.activeSessionId = store.sessions[0]?.id ?? null
    void persistActive(store.activeSessionId)
  }
  void window.treasureChest.harnessDeleteSession(id)
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
    void window.treasureChest.harnessAppendSystemMessage(sessionId, content)
    const msg: WorkbenchMessage = {
      id: `msg_${Date.now().toString(36)}`,
      role: 'system',
      content,
      createdAt: now,
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
  return cache
}
