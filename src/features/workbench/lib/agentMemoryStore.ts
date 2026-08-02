/** Per-agent durable facts shown across chat sessions. */

export interface AgentMemoryFact {
  id: string
  agentId: string
  content: string
  source: 'manual' | 'user' | 'assistant'
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'qiankun.agentMemory.v1'
const MAX_FACTS_PER_AGENT = 40
const MAX_FACT_LEN = 280

function uid(): string {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function readAll(): AgentMemoryFact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { facts?: AgentMemoryFact[] }
    return Array.isArray(parsed.facts) ? parsed.facts : []
  } catch {
    return []
  }
}

function writeAll(facts: AgentMemoryFact[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ facts: facts.slice(0, 500) }))
}

export function listMemoryFacts(agentId: string): AgentMemoryFact[] {
  const id = (agentId || 'direct').trim() || 'direct'
  return readAll()
    .filter((f) => f.agentId === id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function addMemoryFact(
  agentId: string,
  content: string,
  source: AgentMemoryFact['source'] = 'manual',
): AgentMemoryFact {
  const text = content.trim().slice(0, MAX_FACT_LEN)
  if (!text) throw new Error('empty memory')
  const id = (agentId || 'direct').trim() || 'direct'
  const now = new Date().toISOString()
  const fact: AgentMemoryFact = {
    id: uid(),
    agentId: id,
    content: text,
    source,
    createdAt: now,
    updatedAt: now,
  }
  const others = readAll().filter((f) => !(f.agentId === id && f.content === text))
  const scoped = others.filter((f) => f.agentId === id)
  const rest = others.filter((f) => f.agentId !== id)
  writeAll([fact, ...scoped, ...rest].slice(0, MAX_FACTS_PER_AGENT + rest.length))
  return fact
}

export function updateMemoryFact(id: string, content: string): AgentMemoryFact | null {
  const text = content.trim().slice(0, MAX_FACT_LEN)
  if (!text) return null
  const all = readAll()
  const hit = all.find((f) => f.id === id)
  if (!hit) return null
  hit.content = text
  hit.updatedAt = new Date().toISOString()
  writeAll(all)
  return hit
}

export function deleteMemoryFact(id: string): boolean {
  const all = readAll()
  const next = all.filter((f) => f.id !== id)
  if (next.length === all.length) return false
  writeAll(next)
  return true
}

export function clearAgentMemory(agentId: string): void {
  const id = (agentId || 'direct').trim() || 'direct'
  writeAll(readAll().filter((f) => f.agentId !== id))
}

/** Strings ready for LlmChatRequest.memoryFacts (newest first, capped). */
export function memoryFactsForPrompt(agentId: string, limit = 20): string[] {
  return listMemoryFacts(agentId)
    .slice(0, limit)
    .map((f) => f.content)
}
