/** Renderer memory facade — durable facts via main process (0.6.0). */

import type { MemoryFact, MemorySettings } from '@shared'

export type { MemoryFact }

/** @deprecated use MemoryFact — kept for call-site compatibility */
export type AgentMemoryFact = MemoryFact & { agentId?: string }

const LEGACY_KEY = 'qiankun.agentMemory.v1'
const MIGRATED_FLAG = 'qiankun.agentMemory.migrated.v2'

let cache: MemoryFact[] = []
let settingsCache: MemorySettings = { injectEnabled: true }
let ready = false

function agentScope(agentId: string): string {
  return `agent:${(agentId || 'direct').trim() || 'direct'}`
}

function projectScope(projectId: string): string {
  return `project:${projectId.trim()}`
}

async function migrateLegacyIfNeeded(): Promise<void> {
  if (localStorage.getItem(MIGRATED_FLAG) === '1') return
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as {
        facts?: Array<{
          id?: string
          agentId: string
          content: string
          source?: string
          createdAt?: string
          updatedAt?: string
        }>
      }
      const facts = Array.isArray(parsed.facts) ? parsed.facts : []
      if (facts.length) {
        await window.treasureChest.memoryMigrateLocal(facts)
      }
      localStorage.removeItem(LEGACY_KEY)
    }
  } catch {
    /* ignore */
  }
  localStorage.setItem(MIGRATED_FLAG, '1')
}

export async function hydrateMemory(opts?: {
  agentId?: string
  projectId?: string
}): Promise<MemoryFact[]> {
  await migrateLegacyIfNeeded()
  settingsCache = await window.treasureChest.memoryGetSettings()
  cache = await window.treasureChest.memoryList({
    includeGlobal: true,
    agentId: opts?.agentId,
    projectId: opts?.projectId,
    limit: 120,
  })
  ready = true
  return cache
}

export function listMemoryFacts(agentId?: string, projectId?: string): MemoryFact[] {
  if (!ready) return cache
  return cache.filter((f) => {
    if (f.scope === 'global') return true
    if (agentId && f.scope === agentScope(agentId)) return true
    if (projectId && f.scope === projectScope(projectId)) return true
    return false
  })
}

export async function addMemoryFact(
  content: string,
  scope: string = 'global',
  source: MemoryFact['source'] = 'manual',
): Promise<MemoryFact> {
  const fact = await window.treasureChest.memoryAdd({ scope, content, source })
  cache = [fact, ...cache.filter((f) => !(f.scope === fact.scope && f.content === fact.content))]
  return fact
}

/** Compat: agent-scoped add used by older MemoryPanel */
export async function addAgentMemoryFact(
  agentId: string,
  content: string,
  source: MemoryFact['source'] = 'manual',
): Promise<MemoryFact> {
  return addMemoryFact(content, agentScope(agentId), source)
}

export async function updateMemoryFact(id: string, content: string): Promise<MemoryFact | null> {
  const fact = await window.treasureChest.memoryUpdate(id, content)
  if (!fact) return null
  cache = cache.map((f) => (f.id === id ? fact : f))
  return fact
}

export async function deleteMemoryFact(id: string): Promise<boolean> {
  const ok = await window.treasureChest.memoryRemove(id)
  if (ok) cache = cache.filter((f) => f.id !== id)
  return ok
}

export async function clearAgentMemory(agentId: string): Promise<void> {
  await window.treasureChest.memoryClearScope(agentScope(agentId))
  cache = cache.filter((f) => f.scope !== agentScope(agentId))
}

export function getMemoryInjectEnabled(): boolean {
  return settingsCache.injectEnabled !== false
}

export async function setMemoryInjectEnabled(enabled: boolean): Promise<void> {
  settingsCache = await window.treasureChest.memorySetSettings({ injectEnabled: enabled })
}

/** Strings ready for LlmChatRequest.memoryFacts (newest first, capped). */
export function memoryFactsForPrompt(
  agentId?: string,
  projectId?: string,
  limit = 20,
): string[] {
  if (!getMemoryInjectEnabled()) return []
  return listMemoryFacts(agentId, projectId)
    .slice(0, limit)
    .map((f) => f.content)
}

export { agentScope as memoryAgentScope, projectScope as memoryProjectScope }
