import type { HarnessConfig, SessionEvent } from '@shared'
import { callLlmChat } from '../llm/LlmClient'
import { appendEvent, listEvents } from './SessionRepo'
import { logger } from '../../utils/logger'

/** Count user+assistant messages in the event log (excluding compaction). */
export function countDialogueTurns(events: SessionEvent[]): number {
  let n = 0
  for (const e of events) {
    if (e.type === 'user/message') {
      const p = e.payload as { content: string }
      if (!p.content.startsWith('[system] ')) n++
    }
    if (e.type === 'assistant/message') n++
  }
  return n
}

/**
 * When dialogue exceeds threshold, summarize older events into compaction/summary.
 * Returns updated events list.
 */
export async function maybeCompactSession(
  sessionId: string,
  config: HarnessConfig,
  llm: {
    baseUrl: string
    apiKey: string
    apiFormat: 'openai' | 'anthropic'
    model: string
    providerName: string
  },
): Promise<SessionEvent[]> {
  const events = listEvents(sessionId)
  const turns = countDialogueTurns(events)
  if (turns <= config.compactionThreshold) return events

  const lastCompaction = [...events].reverse().find((e) => e.type === 'compaction/summary')
  const throughSeq = lastCompaction
    ? (lastCompaction.payload as { throughSeq: number }).throughSeq
    : 0

  const toSummarize = events.filter(
    (e) =>
      e.seq > throughSeq &&
      (e.type === 'user/message' || e.type === 'assistant/message') &&
      !(e.type === 'user/message' && (e.payload as { content: string }).content.startsWith('[system] ')),
  )

  if (toSummarize.length < 8) return events

  const keepFrom = toSummarize[Math.floor(toSummarize.length / 2)]?.seq ?? throughSeq
  const slice = events.filter((e) => e.seq > throughSeq && e.seq < keepFrom)
  if (slice.length < 4) return events

  const transcript = slice
    .map((e) => {
      if (e.type === 'user/message') return `User: ${(e.payload as { content: string }).content}`
      if (e.type === 'assistant/message') return `Assistant: ${(e.payload as { content: string }).content}`
      return null
    })
    .filter(Boolean)
    .join('\n')

  try {
    const result = await callLlmChat({
      ...llm,
      messages: [
        {
          role: 'user',
          content: `Summarize this conversation segment for future context. Keep facts, decisions, and open tasks. Be concise.\n\n${transcript}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 800,
      timeoutMs: 60_000,
      tag: `harness-compact-${sessionId}`,
    })
    if (!result.ok || !result.text?.trim()) return events

    appendEvent(sessionId, 'compaction/summary', {
      summary: result.text.trim(),
      throughSeq: keepFrom - 1,
    })
  } catch (err) {
    logger.warn('session compaction failed', err)
  }

  return listEvents(sessionId)
}
