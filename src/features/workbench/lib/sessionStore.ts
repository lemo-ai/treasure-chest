import type { AgentId } from '@renderer/features/agents/lib/agentRegistry'

export type WorkbenchAgentId = AgentId

export interface WorkbenchSession {
  id: string
  agentId: WorkbenchAgentId
  title: string
  updatedAt: string
}

export interface WorkbenchMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  citations?: Array<{
    documentId: string
    title: string
    chunkId: string
    ordinal: number
    text: string
    score: number
  }>
}

const STORAGE_KEY = 'qiankun.workbench.v1'

interface WorkbenchStore {
  sessions: WorkbenchSession[]
  activeSessionId: string | null
  messagesBySession: Record<string, WorkbenchMessage[]>
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function emptyStore(): WorkbenchStore {
  return { sessions: [], activeSessionId: null, messagesBySession: {} }
}

function readStore(): WorkbenchStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as WorkbenchStore
    if (!parsed || !Array.isArray(parsed.sessions)) return emptyStore()
    return {
      sessions: parsed.sessions,
      activeSessionId: parsed.activeSessionId ?? null,
      messagesBySession: parsed.messagesBySession ?? {},
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: WorkbenchStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function listSessions(agentId?: WorkbenchAgentId): WorkbenchSession[] {
  const store = readStore()
  const list = agentId ? store.sessions.filter((s) => s.agentId === agentId) : store.sessions
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getActiveSessionId(): string | null {
  return readStore().activeSessionId
}

export function setActiveSessionId(id: string | null): void {
  const store = readStore()
  store.activeSessionId = id
  writeStore(store)
}

export function getSession(id: string): WorkbenchSession | undefined {
  return readStore().sessions.find((s) => s.id === id)
}

export function createSession(agentId: WorkbenchAgentId, title: string): WorkbenchSession {
  const store = readStore()
  const session: WorkbenchSession = {
    id: uid('ses'),
    agentId,
    title,
    updatedAt: new Date().toISOString(),
  }
  store.sessions.unshift(session)
  store.messagesBySession[session.id] = []
  store.activeSessionId = session.id
  writeStore(store)
  return session
}

export function renameSession(id: string, title: string): void {
  const store = readStore()
  const hit = store.sessions.find((s) => s.id === id)
  if (!hit) return
  hit.title = title
  hit.updatedAt = new Date().toISOString()
  writeStore(store)
}

export function deleteSession(id: string): void {
  const store = readStore()
  store.sessions = store.sessions.filter((s) => s.id !== id)
  delete store.messagesBySession[id]
  if (store.activeSessionId === id) {
    store.activeSessionId = store.sessions[0]?.id ?? null
  }
  writeStore(store)
}

export function listMessages(sessionId: string): WorkbenchMessage[] {
  return readStore().messagesBySession[sessionId] ?? []
}

export function appendMessage(
  sessionId: string,
  role: WorkbenchMessage['role'],
  content: string,
  citations?: WorkbenchMessage['citations'],
): WorkbenchMessage {
  const store = readStore()
  const msg: WorkbenchMessage = {
    id: uid('msg'),
    role,
    content,
    createdAt: new Date().toISOString(),
    ...(citations?.length ? { citations } : {}),
  }
  const list = store.messagesBySession[sessionId] ?? []
  list.push(msg)
  store.messagesBySession[sessionId] = list
  const session = store.sessions.find((s) => s.id === sessionId)
  if (session) {
    session.updatedAt = msg.createdAt
    if (role === 'user' && (session.title === '新会话' || session.title === 'New chat')) {
      session.title = content.trim().slice(0, 24) || session.title
    }
  }
  writeStore(store)
  return msg
}
