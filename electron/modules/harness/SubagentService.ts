import type { FortuneSettings, LlmChatRequest, SessionEvent } from '@shared'
import type { AgentLoopCallbacks } from './AgentLoop'
import { runAgentTurn } from './AgentLoop'
import { resolveHarnessConfig } from './cordis/CordisConfig'
import { appendEvent, appendUserMessage, createSession } from './SessionRepo'
import { getDb } from '../../db/Database'

export interface SubagentRunContext {
  parentSessionId: string
  parentAgentId: string
  depth: number
  maxDepth: number
  settings: FortuneSettings
  locale: string
  streamId?: string
  parentReq?: Pick<
    LlmChatRequest,
    'enableCodingTools' | 'enablePluginTools' | 'enableHarnessTools' | 'enableSpawnSubagent' | 'enableMcpTools' | 'enabledMcpServerIds'
  >
  onSessionEvent?: (event: SessionEvent) => void
}

export async function runSubagent(
  task: string,
  agentId: string | undefined,
  ctx: SubagentRunContext,
): Promise<{ ok: boolean; text?: string; error?: string; childSessionId: string }> {
  if (ctx.depth >= ctx.maxDepth) {
    return { ok: false, error: 'Subagent depth limit reached.', childSessionId: '' }
  }

  const child = createSession(agentId || ctx.parentAgentId, `Sub: ${task.trim().slice(0, 32)}`)
  getDb()
    .prepare(`UPDATE agent_sessions SET forked_from = ? WHERE id = ?`)
    .run(ctx.parentSessionId, child.id)
  child.forkedFrom = ctx.parentSessionId
  appendEvent(ctx.parentSessionId, 'subagent/start', {
    childSessionId: child.id,
    task: task.trim(),
    agentId: agentId || ctx.parentAgentId,
  })

  appendUserMessage(child.id, task.trim())

  const req: LlmChatRequest = {
    agentId: agentId || ctx.parentAgentId,
    sessionId: child.id,
    messages: [],
    locale: ctx.locale,
    streamId: ctx.streamId,
    subagentDepth: ctx.depth + 1,
    enableCodingTools: ctx.parentReq?.enableCodingTools,
    enablePluginTools: ctx.parentReq?.enablePluginTools,
    enableHarnessTools: ctx.parentReq?.enableHarnessTools,
    enableSpawnSubagent: ctx.parentReq?.enableSpawnSubagent,
    enableMcpTools: ctx.parentReq?.enableMcpTools,
    enabledMcpServerIds: ctx.parentReq?.enabledMcpServerIds,
  }

  const callbacks: AgentLoopCallbacks = {
    onSessionEvent: ctx.onSessionEvent,
  }

  try {
    const result = await runAgentTurn(req, ctx.settings, callbacks, resolveHarnessConfig())
    const preview = (result.text || result.error || '').slice(0, 240)
    appendEvent(ctx.parentSessionId, 'subagent/end', {
      childSessionId: child.id,
      status: result.ok ? 'complete' : 'error',
      resultPreview: preview,
    })
    return {
      ok: result.ok,
      text: result.text,
      error: result.error,
      childSessionId: child.id,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    appendEvent(ctx.parentSessionId, 'subagent/end', {
      childSessionId: child.id,
      status: 'error',
      resultPreview: msg.slice(0, 240),
    })
    return { ok: false, error: msg, childSessionId: child.id }
  }
}
