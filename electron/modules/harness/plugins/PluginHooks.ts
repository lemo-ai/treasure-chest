import type { SessionEventType } from '@shared'
import { logger } from '../../../utils/logger'
import { getLoadedPluginHooks, type HarnessHookName } from './PluginLoader'
import { buildPluginContext, type PluginRuntimeContext } from './PluginContext'

export type { HarnessHookName }

export interface PreStepHookContext {
  sessionId: string
  turnIndex: number
  stepIndex: number
  agentId: string
}

export interface PreStepHookResult {
  injectSystem?: string
  skipStep?: boolean
}

export interface TurnStoppingHookContext {
  sessionId: string
  turnIndex: number
  reason: string
  finalText?: string
  agentId: string
}

export interface TurnStoppingHookResult {
  /** When true, append a follow-up user message and continue the turn. */
  continueTurn?: boolean
  message?: string
}

export interface InjectHookContext {
  sessionId: string
  turnIndex: number
  agentId: string
  section: string
}

export interface InjectHookResult {
  content?: string
}

export interface ToolExecuteHookContext {
  sessionId: string
  turnIndex: number
  stepIndex: number
  agentId: string
  toolName: string
  toolCallId: string
  argsJson: string
}

export interface ToolPreExecuteHookResult {
  skip?: boolean
  skipReason?: string
  argsJson?: string
}

export interface ToolPostExecuteHookContext extends ToolExecuteHookContext {
  output: string
  failed: boolean
}

export interface ToolPostExecuteHookResult {
  output?: string
}

async function runHook<TCtx extends { sessionId: string; agentId: string; turnIndex: number; stepIndex?: number }, TResult>(
  hookName: HarnessHookName,
  ctx: TCtx,
  merge: (acc: TResult, next: Partial<TResult>) => TResult,
  initial: TResult,
): Promise<TResult> {
  let result = initial
  const pluginCtx: PluginRuntimeContext = buildPluginContext({
    sessionId: ctx.sessionId,
    agentId: ctx.agentId,
    turnIndex: ctx.turnIndex,
    stepIndex: ctx.stepIndex ?? 0,
  })
  for (const hook of getLoadedPluginHooks(hookName)) {
    try {
      const out = (await hook.handler({ ...ctx, ctx: pluginCtx })) as Partial<TResult> | null | undefined
      if (out && typeof out === 'object') result = merge(result, out)
    } catch (err) {
      logger.warn(`harness plugin hook ${hookName} failed (${hook.pluginId})`, err)
    }
  }
  return result
}

export async function runPreStepHooks(ctx: PreStepHookContext): Promise<PreStepHookResult> {
  return runHook<PreStepHookContext, PreStepHookResult>(
    'agent/pre-step',
    ctx,
    (acc, next) => ({
      injectSystem: next.injectSystem ?? acc.injectSystem,
      skipStep: next.skipStep ?? acc.skipStep,
    }),
    {},
  )
}

export async function runTurnStoppingHooks(
  ctx: TurnStoppingHookContext,
): Promise<TurnStoppingHookResult> {
  return runHook<TurnStoppingHookContext, TurnStoppingHookResult>(
    'turn/stopping',
    ctx,
    (acc, next) => ({
      continueTurn: next.continueTurn ?? acc.continueTurn,
      message: next.message ?? acc.message,
    }),
    {},
  )
}

export async function runInjectHooks(ctx: InjectHookContext): Promise<InjectHookResult> {
  return runHook<InjectHookContext, InjectHookResult>(
    'agent/inject',
    ctx,
    (acc, next) => ({ content: next.content ?? acc.content }),
    {},
  )
}

export async function runToolPreExecuteHooks(
  ctx: ToolExecuteHookContext,
): Promise<ToolPreExecuteHookResult> {
  return runHook<ToolExecuteHookContext, ToolPreExecuteHookResult>(
    'tools/pre-execute',
    ctx,
    (acc, next) => ({
      skip: next.skip ?? acc.skip,
      skipReason: next.skipReason ?? acc.skipReason,
      argsJson: next.argsJson ?? acc.argsJson,
    }),
    {},
  )
}

export async function runToolPostExecuteHooks(
  ctx: ToolPostExecuteHookContext,
): Promise<ToolPostExecuteHookResult> {
  return runHook<ToolPostExecuteHookContext, ToolPostExecuteHookResult>(
    'tools/post-execute',
    ctx,
    (acc, next) => ({ output: next.output ?? acc.output }),
    {},
  )
}

/** Event types forwarded to renderer during live streams. */
export const LIVE_SESSION_EVENT_TYPES = new Set<SessionEventType>([
  'turn/start',
  'turn/end',
  'step/start',
  'step/end',
  'assistant/chunk',
  'assistant/message',
  'tool/call',
  'tool/result',
  'goal/set',
  'goal/update',
  'subagent/start',
  'subagent/end',
  'system/inject',
  'shell/chunk',
])
