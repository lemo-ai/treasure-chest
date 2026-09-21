import type { LlmTokenUsage, UsageDayBucket, UsagePricing, UsageSessionBucket, UsageSnapshot } from '@shared'
import { getDb } from '../../db/Database'
import { getSetting, setSetting } from '../../db/AppSettingsRepo'

export type { UsageDayBucket, UsagePricing, UsageSessionBucket, UsageSnapshot }

const PRICING_KEY = 'usage.pricing'
const DAYS_KEY = 'usage.days.v1'
const SESSIONS_KEY = 'usage.sessions.v1'

function todayYmd(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function emptyDay(day: string): UsageDayBucket {
  return { day, promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 0, estimatedCalls: 0 }
}

export function getUsagePricing(): UsagePricing {
  const raw = getSetting<Partial<UsagePricing>>(PRICING_KEY, {})
  return {
    promptPerMillion: Number(raw?.promptPerMillion) > 0 ? Number(raw.promptPerMillion) : 0,
    completionPerMillion: Number(raw?.completionPerMillion) > 0 ? Number(raw.completionPerMillion) : 0,
  }
}

export function setUsagePricing(next: Partial<UsagePricing>): UsagePricing {
  const cur = getUsagePricing()
  const merged: UsagePricing = {
    promptPerMillion:
      next.promptPerMillion !== undefined ? Math.max(0, Number(next.promptPerMillion) || 0) : cur.promptPerMillion,
    completionPerMillion:
      next.completionPerMillion !== undefined
        ? Math.max(0, Number(next.completionPerMillion) || 0)
        : cur.completionPerMillion,
  }
  setSetting(PRICING_KEY, merged)
  return merged
}

function readDays(): UsageDayBucket[] {
  const raw = getSetting<UsageDayBucket[]>(DAYS_KEY, [])
  return Array.isArray(raw) ? raw : []
}

function writeDays(days: UsageDayBucket[]): void {
  setSetting(DAYS_KEY, days.slice(0, 90))
}

function readSessions(): UsageSessionBucket[] {
  const raw = getSetting<UsageSessionBucket[]>(SESSIONS_KEY, [])
  return Array.isArray(raw) ? raw : []
}

function writeSessions(sessions: UsageSessionBucket[]): void {
  setSetting(SESSIONS_KEY, sessions.slice(0, 200))
}

export function recordTokenUsage(input: {
  sessionId?: string | null
  usage?: LlmTokenUsage | null
  model?: string
}): void {
  const usage = input.usage
  if (!usage) return
  const prompt = Math.max(0, Math.floor(usage.promptTokens || 0))
  const completion = Math.max(0, Math.floor(usage.completionTokens || 0))
  const total = Math.max(0, Math.floor(usage.totalTokens || prompt + completion))
  if (prompt + completion + total <= 0) return

  const day = todayYmd()
  const days = readDays()
  let bucket = days.find((d) => d.day === day)
  if (!bucket) {
    bucket = emptyDay(day)
    days.unshift(bucket)
  }
  bucket.promptTokens += prompt
  bucket.completionTokens += completion
  bucket.totalTokens += total
  bucket.calls += 1
  if (usage.estimated) bucket.estimatedCalls += 1
  writeDays(days)

  const sid = input.sessionId?.trim()
  if (sid) {
    const sessions = readSessions()
    let ses = sessions.find((s) => s.sessionId === sid)
    if (!ses) {
      ses = {
        sessionId: sid,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        calls: 0,
        updatedAt: new Date().toISOString(),
      }
      sessions.unshift(ses)
    }
    ses.promptTokens += prompt
    ses.completionTokens += completion
    ses.totalTokens += total
    ses.calls += 1
    ses.updatedAt = new Date().toISOString()
    sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    writeSessions(sessions)
  }

  // Touch DB so backup/settings dumps stay consistent
  void getDb()
}

export function getUsageSnapshot(): UsageSnapshot {
  const days = readDays()
  const today = days.find((d) => d.day === todayYmd()) ?? emptyDay(todayYmd())
  return {
    today,
    days,
    sessions: readSessions().slice(0, 40),
    pricing: getUsagePricing(),
  }
}

export function clearUsageStats(): void {
  setSetting(DAYS_KEY, [])
  setSetting(SESSIONS_KEY, [])
}

export function estimateUsageCostUsd(
  promptTokens: number,
  completionTokens: number,
  pricing = getUsagePricing(),
): number | null {
  if (pricing.promptPerMillion <= 0 && pricing.completionPerMillion <= 0) return null
  const cost =
    (promptTokens / 1_000_000) * pricing.promptPerMillion +
    (completionTokens / 1_000_000) * pricing.completionPerMillion
  return Math.round(cost * 1e6) / 1e6
}

export function exportUsageCsv(): string {
  const snap = getUsageSnapshot()
  const lines = ['day,prompt_tokens,completion_tokens,total_tokens,calls,estimated_calls']
  for (const d of snap.days) {
    lines.push(
      `${d.day},${d.promptTokens},${d.completionTokens},${d.totalTokens},${d.calls},${d.estimatedCalls}`,
    )
  }
  return lines.join('\n') + '\n'
}

export function getCodingGlobalRules(): string {
  return String(getSetting<string>('coding.globalRules', '') || '')
}

export function setCodingGlobalRules(text: string): string {
  const next = String(text || '').slice(0, 20_000)
  setSetting('coding.globalRules', next)
  return next
}

/** Rough fallback when provider omits usage. */
export function estimateTokensFromText(promptChars: number, completionChars: number): LlmTokenUsage {
  const promptTokens = Math.max(1, Math.ceil(promptChars / 4))
  const completionTokens = Math.max(0, Math.ceil(completionChars / 4))
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimated: true,
  }
}
