import type { AgentGoalStatus, FortuneSettings, LlmChatRequest, SessionEvent } from '@shared'
import { listGoals, setGoal, updateGoal } from './GoalsStore'

export interface HarnessToolRuntime {
  sessionId?: string
  agentId: string
  locale: string
  streamId?: string
  subagentDepth: number
  maxSubagentDepth: number
  settings: FortuneSettings
  parentReq?: Pick<
    LlmChatRequest,
    'enableCodingTools' | 'enablePluginTools' | 'enableHarnessTools' | 'enableSpawnSubagent' | 'enableMcpTools' | 'enabledMcpServerIds'
  >
  onSessionEvent?: (event: SessionEvent) => void
}

function parseArgs(argsJson: string): Record<string, unknown> {
  return argsJson.trim() ? (JSON.parse(argsJson) as Record<string, unknown>) : {}
}

export async function executeHarnessTool(
  name: string,
  argsJson: string,
  rt: HarnessToolRuntime,
): Promise<string> {
  const sessionId = rt.sessionId?.trim()
  if (!sessionId) {
    return JSON.stringify({ error: 'Harness tools require an active session.' })
  }

  let args: Record<string, unknown>
  try {
    args = parseArgs(argsJson)
  } catch {
    return JSON.stringify({ error: 'invalid arguments JSON' })
  }

  switch (name) {
    case 'set_goal': {
      const title = String(args.title || '').trim()
      if (!title) return JSON.stringify({ error: 'title required' })
      const goal = setGoal(sessionId, title, String(args.detail || ''))
      return JSON.stringify({ ok: true, goal })
    }
    case 'update_goal': {
      const goalId = String(args.goalId || '').trim()
      const status = String(args.status || '') as AgentGoalStatus
      if (!goalId || !status) return JSON.stringify({ error: 'goalId and status required' })
      const goal = updateGoal(sessionId, goalId, status, String(args.detail || ''))
      if (!goal) return JSON.stringify({ error: 'goal not found' })
      return JSON.stringify({ ok: true, goal })
    }
    case 'list_goals':
      return JSON.stringify({ goals: listGoals(sessionId, true) })
    case 'spawn_subagent': {
      const task = String(args.task || '').trim()
      if (!task) return JSON.stringify({ error: 'task required' })
      const agentId = String(args.agentId || '').trim() || undefined
      const { runSubagent } = await import('./SubagentService')
      const result = await runSubagent(task, agentId, {
        parentSessionId: sessionId,
        parentAgentId: rt.agentId,
        depth: rt.subagentDepth,
        maxDepth: rt.maxSubagentDepth,
        settings: rt.settings,
        locale: rt.locale,
        streamId: rt.streamId,
        parentReq: rt.parentReq,
        onSessionEvent: rt.onSessionEvent,
      })
      return JSON.stringify({
        ok: result.ok,
        childSessionId: result.childSessionId,
        result: result.text,
        error: result.error,
      })
    }
    default:
      return JSON.stringify({ error: `unknown harness tool: ${name}` })
  }
}

export const HARNESS_TOOL_NAMES = ['set_goal', 'update_goal', 'list_goals', 'spawn_subagent'] as const
