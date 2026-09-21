import type {
  HarnessMessage,
  KnowledgeCitation,
  LlmToolStep,
  SessionEvent,
} from '@shared'

/** Prefix persisted in harness system rows so reload keeps retry UI. */
export const RETRYABLE_SYSTEM_PREFIX = 'RETRYABLE::'

function msgId(sessionId: string, seq: number): string {
  return `msg_${sessionId}_${seq}`
}

function stripRetryable(content: string): { content: string; retryable: boolean } {
  if (content.startsWith(RETRYABLE_SYSTEM_PREFIX)) {
    return { content: content.slice(RETRYABLE_SYSTEM_PREFIX.length), retryable: true }
  }
  return { content, retryable: false }
}

/** Project durable session events into UI messages. */
export function deriveMessagesFromEvents(events: SessionEvent[]): HarnessMessage[] {
  const messages: HarnessMessage[] = []
  let turnToolSteps: LlmToolStep[] = []
  let turnCitations: KnowledgeCitation[] = []
  let chunkBuffer = ''
  let compactionSummary: string | null = null
  let compactionThrough = 0

  for (const event of events) {
    if (event.type === 'compaction/summary') {
      const p = event.payload as { summary: string; throughSeq: number }
      compactionSummary = p.summary
      compactionThrough = p.throughSeq
      continue
    }

    if (event.seq <= compactionThrough) continue

    switch (event.type) {
      case 'user/message': {
        if (chunkBuffer) {
          messages.push({
            id: msgId(event.sessionId, event.seq - 1),
            role: 'assistant',
            content: chunkBuffer,
            createdAt: event.createdAt,
          })
          chunkBuffer = ''
        }
        turnToolSteps = []
        turnCitations = []
        const p = event.payload as { content: string }
        const role = p.content.startsWith('[system] ') ? 'system' : 'user'
        let content = role === 'system' ? p.content.slice('[system] '.length) : p.content
        let retryable = false
        if (role === 'system') {
          const stripped = stripRetryable(content)
          content = stripped.content
          retryable = stripped.retryable
        }
        messages.push({
          id: msgId(event.sessionId, event.seq),
          role,
          content,
          createdAt: event.createdAt,
          ...(retryable ? { retryable: true } : {}),
        })
        break
      }
      case 'tool/call': {
        const p = event.payload as { id: string; name: string; arguments: string }
        turnToolSteps.push({
          id: p.id,
          name: p.name,
          label: p.name,
          status: 'running',
          argsPreview: truncate(p.arguments, 180),
        })
        break
      }
      case 'tool/result': {
        const p = event.payload as {
          id: string
          name: string
          content: string
          status: 'done' | 'error' | 'denied'
        }
        const idx = turnToolSteps.findIndex((s) => s.id === p.id)
        const step: LlmToolStep = {
          id: p.id,
          name: p.name,
          label: p.name,
          status: p.status === 'denied' ? 'denied' : p.status === 'error' ? 'error' : 'done',
          resultPreview: truncate(p.content, 220),
          error: p.status !== 'done' ? truncate(p.content, 120) : undefined,
        }
        if (idx >= 0) turnToolSteps[idx] = { ...turnToolSteps[idx], ...step }
        else turnToolSteps.push(step)
        break
      }
      case 'assistant/chunk': {
        const p = event.payload as { delta: string }
        chunkBuffer += p.delta ?? ''
        break
      }
      case 'assistant/message': {
        chunkBuffer = ''
        const p = event.payload as {
          content: string
          citations?: KnowledgeCitation[]
          toolSteps?: LlmToolStep[]
        }
        const steps = p.toolSteps?.length ? p.toolSteps : [...turnToolSteps]
        const cites = p.citations?.length ? p.citations : [...turnCitations]
        messages.push({
          id: msgId(event.sessionId, event.seq),
          role: 'assistant',
          content: p.content,
          createdAt: event.createdAt,
          ...(cites.length ? { citations: cites } : {}),
          ...(steps.length ? { toolSteps: steps } : {}),
        })
        turnToolSteps = []
        turnCitations = []
        break
      }
      case 'subagent/start': {
        const p = event.payload as {
          task: string
          childSessionId: string
          agentId?: string
        }
        messages.push({
          id: msgId(event.sessionId, event.seq),
          role: 'system',
          content: `Subagent started (${p.childSessionId}): ${p.task}`,
          createdAt: event.createdAt,
          subagent: {
            phase: 'start',
            childSessionId: p.childSessionId,
            task: p.task,
            agentId: p.agentId,
          },
        })
        break
      }
      case 'subagent/end': {
        const p = event.payload as {
          status: string
          resultPreview?: string
          childSessionId: string
        }
        messages.push({
          id: msgId(event.sessionId, event.seq),
          role: 'system',
          content: `Subagent ${p.status} (${p.childSessionId})${p.resultPreview ? `: ${p.resultPreview}` : ''}`,
          createdAt: event.createdAt,
          subagent: {
            phase: 'end',
            childSessionId: p.childSessionId,
            status: p.status,
            resultPreview: p.resultPreview,
          },
        })
        break
      }
      case 'goal/set': {
        const p = event.payload as { title: string; goalId: string }
        messages.push({
          id: msgId(event.sessionId, event.seq),
          role: 'system',
          content: `Goal set: ${p.title}`,
          createdAt: event.createdAt,
          goal: { phase: 'set', goalId: p.goalId, title: p.title },
        })
        break
      }
      case 'goal/update': {
        const p = event.payload as { goalId: string; status: string }
        messages.push({
          id: msgId(event.sessionId, event.seq),
          role: 'system',
          content: `Goal ${p.goalId} → ${p.status}`,
          createdAt: event.createdAt,
          goal: { phase: 'update', goalId: p.goalId, status: p.status },
        })
        break
      }
      case 'system/inject': {
        const p = event.payload as { section: string; content: string }
        messages.push({
          id: msgId(event.sessionId, event.seq),
          role: 'system',
          content: p.content,
          createdAt: event.createdAt,
        })
        break
      }
      default:
        break
    }
  }

  if (chunkBuffer) {
    const last = events.at(-1)
    messages.push({
      id: msgId(events[0]?.sessionId ?? 'x', last?.seq ?? 0),
      role: 'assistant',
      content: chunkBuffer,
      createdAt: last?.createdAt ?? new Date().toISOString(),
    })
    chunkBuffer = ''
  }

  if (compactionSummary) {
    messages.unshift({
      id: `compact_${events[0]?.sessionId ?? 'x'}`,
      role: 'system',
      content: compactionSummary,
      createdAt: events.find((e) => e.type === 'compaction/summary')?.createdAt ?? new Date().toISOString(),
    })
  }

  return messages
}

function truncate(raw: string, max: number): string {
  const text = raw.trim()
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}
