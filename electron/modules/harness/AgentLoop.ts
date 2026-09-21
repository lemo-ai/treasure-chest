import type {
  FortuneSettings,
  HarnessConfig,
  KnowledgeCitation,
  LlmChatRequest,
  LlmChatResponse,
  LlmToolStep,
  SessionEvent,
  SessionEventPayload,
  SessionEventType,
  ToolApprovalRequest,
} from '@shared'
import { DEFAULT_HARNESS_CONFIG, HARNESS_ABSOLUTE_MAX_STEPS, isDirectChatAgentId } from '@shared'
import { callLlmChat, callLlmChatStream } from '../llm/LlmClient'
import { recordTokenUsage } from '../usage/UsageStore'
import { appendEvent, listEvents } from './SessionRepo'
import { ToolRegistry, eventsToChatMessages, wantsKnowledge, wantsWebSearch } from './ToolRegistry'
import { assembleSystemPrompt, settingsToLlmEndpoint } from './SystemPrompt'
import { maybeCompactSession } from './Compaction'
import { previewJson } from '../llm/tools/builtinTools'
import { listGoals } from './GoalsStore'
import { resolveAgentToolPolicy } from './AgentToolPolicy'
import { scheduleSessionTitleGeneration } from './SessionTitle'
import {
  runPreStepHooks,
  runTurnStoppingHooks,
  runToolPreExecuteHooks,
  runToolPostExecuteHooks,
} from './plugins/PluginHooks'
import { getCordisStack } from './cordis/CordisLoader'
import {
  endTurnRun,
  isTurnCancelled,
  registerTurnRun,
  TurnCancelledError,
  waitIfPaused,
} from './TurnRunRegistry'

const activeChunkPending = new Map<string, { text: string }>()

/** If the model forgot to paste media markdown from tools, append it. */
function withEnsuredMediaMarkdown(text: string, snippets: string[]): string {
  if (!snippets.length) return text
  const missing = snippets.filter((md) => {
    const url =
      md.match(/\((https?:\/\/[^)\s]+|data:[^)\s]+)\)/)?.[1] || md.match(/src="([^"]+)"/)?.[1]
    if (url) return !text.includes(url)
    return !text.includes(md.slice(0, Math.min(48, md.length)))
  })
  if (!missing.length) return text
  return [text.trim(), ...missing].filter(Boolean).join('\n\n')
}

type ApprovalHandler = (request: ToolApprovalRequest) => Promise<boolean>

export interface AgentLoopCallbacks {
  onStatus?: (text: string) => void
  onDelta?: (text: string) => void
  onCitations?: (citations: KnowledgeCitation[]) => void
  onToolStep?: (step: LlmToolStep) => void
  onApproval?: ApprovalHandler
  onSessionEvent?: (event: SessionEvent) => void
}

export interface AgentLoopResult extends LlmChatResponse {
  toolSteps: LlmToolStep[]
}

function countTurns(events: ReturnType<typeof listEvents>): number {
  return events.filter((e) => e.type === 'turn/start').length
}

function effectiveMaxSteps(config: HarnessConfig): number {
  if (config.maxStepsPerTurn <= 0) return HARNESS_ABSOLUTE_MAX_STEPS
  return Math.min(config.maxStepsPerTurn, HARNESS_ABSOLUTE_MAX_STEPS)
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (isTurnCancelled(signal)) throw new TurnCancelledError()
}

async function checkpointPause(streamId: string | undefined, signal?: AbortSignal): Promise<void> {
  await waitIfPaused(streamId, signal)
  throwIfCancelled(signal)
}

function flushAssistantChunk(
  sessionId: string,
  pending: { text: string },
  callbacks: AgentLoopCallbacks,
): void {
  if (!pending.text) return
  const ev = appendEvent(sessionId, 'assistant/chunk', { delta: pending.text })
  callbacks.onSessionEvent?.(ev)
  pending.text = ''
}

async function maybeContinueForActiveGoals(
  result: AgentLoopResult,
  ctx: {
    sessionId?: string
    req: LlmChatRequest
    settings: FortuneSettings
    callbacks: AgentLoopCallbacks
    config: HarnessConfig
    abortSignal?: AbortSignal
    goalContinuationDepth: number
  },
): Promise<AgentLoopResult> {
  const { sessionId, req, settings, callbacks, config, abortSignal, goalContinuationDepth } = ctx
  if (
    !sessionId ||
    !result.ok ||
    isTurnCancelled(abortSignal) ||
    goalContinuationDepth >= config.maxGoalContinuations ||
    isDirectChatAgentId(req.agentId)
  ) {
    return result
  }
  if (!listGoals(sessionId, false).length) return result

  appendEvent(sessionId, 'user/message', {
    content:
      '[system] Active session goals remain. Continue with the next concrete step and call update_goal when a goal is finished.',
  })

  const next = await runAgentTurnInner(
    req,
    settings,
    callbacks,
    config,
    abortSignal,
    goalContinuationDepth + 1,
  )
  return {
    ...next,
    text: next.text || result.text,
    toolSteps: [...result.toolSteps, ...next.toolSteps],
    citations: [...(result.citations ?? []), ...(next.citations ?? [])],
  }
}

/**
 * Turn/step agent driver (DeepSeek Harness agent-loop inspired).
 * One user message opens a turn; each model request is a step; tools may chain steps.
 */
export async function runAgentTurn(
  req: LlmChatRequest,
  settings: FortuneSettings,
  callbacks: AgentLoopCallbacks = {},
  config: HarnessConfig = DEFAULT_HARNESS_CONFIG,
): Promise<AgentLoopResult> {
  const streamId = req.streamId?.trim()
  const abortSignal = streamId ? registerTurnRun(streamId) : undefined
  const sessionId = req.sessionId?.trim()
  try {
  return await runAgentTurnInner(req, settings, callbacks, config, abortSignal)
  } catch (err) {
    if (err instanceof TurnCancelledError) {
      const turnIndex = sessionId ? countTurns(listEvents(sessionId)) - 1 : 0
      if (sessionId) {
        const pending = activeChunkPending.get(sessionId)
        if (pending?.text) flushAssistantChunk(sessionId, pending, callbacks)
        activeChunkPending.delete(sessionId)
        if (turnIndex >= 0) {
          const ev = appendEvent(sessionId, 'turn/end', { turnIndex, reason: 'cancelled' })
          callbacks.onSessionEvent?.(ev)
        }
      }
      return {
        ok: false,
        error: 'cancelled',
        providerName: settingsToLlmEndpoint(settings).providerName,
        toolSteps: [],
      }
    }
    throw err
  } finally {
    if (streamId) endTurnRun(streamId)
  }
}

async function runAgentTurnInner(
  req: LlmChatRequest,
  settings: FortuneSettings,
  callbacks: AgentLoopCallbacks,
  config: HarnessConfig,
  abortSignal?: AbortSignal,
  goalContinuationDepth = 0,
): Promise<AgentLoopResult> {
  const sessionId = req.sessionId?.trim()
  const agentId = req.agentId || 'direct'
  const directChat = isDirectChatAgentId(agentId)
  const endpoint = settingsToLlmEndpoint(settings)
  const model = (req.model?.trim() || endpoint.model).trim()
  const locale = req.locale ?? 'zh-CN'
  const isEn = locale.toLowerCase().startsWith('en')
  const toolSteps: LlmToolStep[] = []
  const citations: KnowledgeCitation[] = []
  let turnUsage: import('@shared').LlmTokenUsage | undefined

  const addUsage = (u?: import('@shared').LlmTokenUsage): void => {
    if (!u) return
    if (!turnUsage) {
      turnUsage = { ...u }
      return
    }
    turnUsage = {
      promptTokens: turnUsage.promptTokens + u.promptTokens,
      completionTokens: turnUsage.completionTokens + u.completionTokens,
      totalTokens: turnUsage.totalTokens + u.totalTokens,
      estimated: Boolean(turnUsage.estimated || u.estimated),
    }
  }

  const toolPolicy = resolveAgentToolPolicy(req.agentId || 'direct', {
    // Global harness kill-switch; undefined request flag keeps agent policy default.
    enableCodingTools: config.enableCodingTools === false ? false : req.enableCodingTools,
    enableHarnessTools: req.enableHarnessTools,
    enablePluginTools: req.enablePluginTools ?? getCordisStack().enablePluginTools,
    enableSpawnSubagent: req.enableSpawnSubagent,
    enableMcpTools: req.enableMcpTools,
  })

  const parentReq: Pick<
    LlmChatRequest,
    | 'enableCodingTools'
    | 'enablePluginTools'
    | 'enableHarnessTools'
    | 'enableSpawnSubagent'
    | 'enableMcpTools'
    | 'enabledMcpServerIds'
    | 'enableDataSourceTools'
    | 'enabledDataSourceIds'
  > = {
    enableCodingTools: req.enableCodingTools,
    enablePluginTools: req.enablePluginTools ?? getCordisStack().enablePluginTools,
    enableHarnessTools: req.enableHarnessTools,
    enableSpawnSubagent: req.enableSpawnSubagent,
    enableMcpTools: req.enableMcpTools,
    enabledMcpServerIds: req.enabledMcpServerIds,
    enableDataSourceTools: req.enableDataSourceTools,
    enabledDataSourceIds: req.enabledDataSourceIds,
  }

  const registry = new ToolRegistry()
  const tools = await registry.load({
    agentId: req.agentId || 'direct',
    useKnowledge: wantsKnowledge(req),
    useWebSearch: wantsWebSearch(req),
    enabledMcpServerIds: req.enabledMcpServerIds,
    sessionId: sessionId || undefined,
    streamId: req.streamId,
    subagentDepth: req.subagentDepth ?? 0,
    settings,
    enableCodingTools: toolPolicy.enableCodingTools,
    enableHarnessTools: toolPolicy.enableHarnessTools,
    enablePluginTools: toolPolicy.enablePluginTools,
    enableSpawnSubagent: toolPolicy.enableSpawnSubagent,
    enableMcpTools: toolPolicy.enableMcpTools,
    enableDataSourceTools: req.enableDataSourceTools,
    enabledDataSourceIds: req.enabledDataSourceIds,
    maxSubagentDepth: config.maxSubagentDepth,
    parentReq,
  })
  const toolNames = tools.map((t) => t.function.name)
  const canUseTools = tools.length > 0

  let events = sessionId ? listEvents(sessionId) : []
  if (sessionId) {
    events = await maybeCompactSession(sessionId, config, { ...endpoint, model })
    const hasUser = events.some((e) => e.type === 'user/message')
    if (!hasUser) {
      return {
        ok: false,
        error: 'Session has no user message.',
        providerName: endpoint.providerName,
        toolSteps: [],
      }
    }
  } else {
    const history = req.messages.filter((m) => m.content.trim())
    if (history.length === 0) {
      return {
        ok: false,
        error: 'Empty message.',
        providerName: endpoint.providerName,
        toolSteps: [],
      }
    }
    for (const m of history) {
      events = [
        ...events,
        {
          id: 'ephemeral',
          sessionId: 'ephemeral',
          seq: events.length + 1,
          type: m.role === 'user' ? 'user/message' : 'assistant/message',
          payload: { content: m.content },
          createdAt: new Date().toISOString(),
        } as (typeof events)[number],
      ]
    }
  }

  const turnIndex = sessionId ? countTurns(events) : 0
  const system = await assembleSystemPrompt(req, toolNames, sessionId || undefined, turnIndex)
  const record = (type: SessionEventType, payload: SessionEventPayload): SessionEvent | null => {
    if (!sessionId) return null
    const ev = appendEvent(sessionId, type, payload)
    callbacks.onSessionEvent?.(ev)
    return ev
  }

  if (sessionId) {
    record('turn/start', { turnIndex })
    if (turnIndex === 0) scheduleSessionTitleGeneration(sessionId, settings, locale)
  }

  callbacks.onStatus?.(isEn ? 'Thinking…' : '思考中…')

  let messages = eventsToChatMessages(events, system, config.maxContextMessages)
  let stepIndex = 0
  let finalText = ''
  let lastModel = model
  let lastProvider = endpoint.providerName

  const persistUsage = (): void => {
    if (!turnUsage) return
    recordTokenUsage({ sessionId, usage: turnUsage, model: lastModel })
  }
  const maxSteps = effectiveMaxSteps(config)
  const mediaMarkdownSnippets: string[] = []
  const chunkPending = { text: '' }
  if (sessionId) activeChunkPending.set(sessionId, chunkPending)
  const streamDelta = (delta: string): void => {
    if (sessionId && delta) {
      chunkPending.text += delta
      if (chunkPending.text.length >= 24) flushAssistantChunk(sessionId, chunkPending, callbacks)
    }
    callbacks.onDelta?.(delta)
  }

  try {
  for (stepIndex = 0; stepIndex < maxSteps; stepIndex++) {
    await checkpointPause(req.streamId, abortSignal)
    if (sessionId) {
      record('step/start', { turnIndex, stepIndex })
      if (!directChat) {
        const pre = await runPreStepHooks({ sessionId, turnIndex, stepIndex, agentId })
        if (pre.injectSystem?.trim()) {
          record('system/inject', { section: 'pre-step', content: pre.injectSystem.trim() })
          messages = eventsToChatMessages(listEvents(sessionId), system, config.maxContextMessages)
        }
        if (pre.skipStep) {
          record('step/end', { turnIndex, stepIndex })
          continue
        }
      }
    }

    const llmOptions = {
      ...endpoint,
      model,
      messages,
      tools: canUseTools ? tools : undefined,
      temperature: 0.7,
      maxTokens: 2048,
      timeoutMs: 120_000,
      signal: abortSignal,
      tag: `harness-${req.agentId || 'direct'}-t${turnIndex}-s${stepIndex}`,
    }
    const result = callbacks.onDelta
      ? await callLlmChatStream(llmOptions, streamDelta)
      : await callLlmChat(llmOptions)

    await checkpointPause(req.streamId, abortSignal)

    lastModel = result.model ?? model
    lastProvider = result.providerName ?? endpoint.providerName
    addUsage(result.usage)

    if (!result.ok) {
      if (isTurnCancelled(abortSignal)) throw new TurnCancelledError()
      if (sessionId) {
        record('step/end', { turnIndex, stepIndex })
        record('turn/end', { turnIndex, reason: 'error' })
      }
      return { ...result, citations, toolSteps }
    }

    const calls = result.toolCalls ?? []
    if (!calls.length) {
      const rawText = result.text?.trim() ?? ''
      finalText = withEnsuredMediaMarkdown(rawText, mediaMarkdownSnippets)
      if (finalText.length > rawText.length) {
        streamDelta(finalText.slice(rawText.length))
      }
      if (sessionId) flushAssistantChunk(sessionId, chunkPending, callbacks)
      if (sessionId && finalText) {
        if (!directChat) {
          const stop = await runTurnStoppingHooks({
            sessionId,
            turnIndex,
            reason: 'complete',
            finalText,
            agentId,
          })
          if (stop.continueTurn && stop.message?.trim()) {
            record('user/message', { content: stop.message.trim() })
            messages = eventsToChatMessages(listEvents(sessionId), system, config.maxContextMessages)
            record('step/end', { turnIndex, stepIndex })
            continue
          }
        }
        record('assistant/message', {
          content: finalText,
          model: lastModel,
          providerName: lastProvider,
          citations: citations.length ? citations : undefined,
          toolSteps: toolSteps.length ? toolSteps : undefined,
        })
      }
      if (sessionId) {
        record('step/end', { turnIndex, stepIndex })
        record('turn/end', { turnIndex, reason: 'complete' })
      }
      persistUsage()
      return maybeContinueForActiveGoals(
        {
          ok: true,
          text: finalText,
          model: lastModel,
          providerName: lastProvider,
          citations,
          toolSteps,
          usage: turnUsage,
        },
        {
          sessionId,
          req,
          settings,
          callbacks,
          config,
          abortSignal,
          goalContinuationDepth,
        },
      )
    }

    if (sessionId) {
      flushAssistantChunk(sessionId, chunkPending, callbacks)
      for (const call of calls) {
        record('tool/call', {
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments || '{}',
        })
      }
    }

    messages.push({
      role: 'assistant',
      content: result.text?.trim() || null,
      tool_calls: calls,
    })

    let oweAnotherStep = false

    for (const call of calls) {
      const name = call.function.name
      let argsJson = call.function.arguments || '{}'
      callbacks.onStatus?.(registry.statusLabel(name, locale))

      const stepId = call.id || `tool_${Date.now().toString(36)}_${toolSteps.length}`
      const decision = registry.classify(name, argsJson)
      const label = registry.displayName(name, locale)
      const argsPreview = registry.previewArgs(argsJson)

      if (sessionId) {
        const pre = await runToolPreExecuteHooks({
          sessionId,
          turnIndex,
          stepIndex,
          agentId,
          toolName: name,
          toolCallId: stepId,
          argsJson,
        })
        if (pre.skip) {
          const skipped: LlmToolStep = {
            id: stepId,
            name,
            label,
            status: 'denied',
            argsPreview,
            error: pre.skipReason || 'skipped_by_plugin',
          }
          toolSteps.push(skipped)
          callbacks.onToolStep?.(skipped)
          const output = JSON.stringify({
            error: pre.skipReason || 'Tool skipped by plugin hook.',
          })
          record('tool/result', {
            id: stepId,
            name,
            content: output,
            status: 'denied',
          })
          messages.push({ role: 'tool', tool_call_id: call.id, name, content: output })
          continue
        }
        if (pre.argsJson) argsJson = pre.argsJson
      }

      if (decision.tier === 'block') {
        const blockedOutput = JSON.stringify({
          error: 'Tool blocked by policy (payment/transfer class operations are not allowed).',
          reason: decision.reason,
        })
        const blocked: LlmToolStep = {
          id: stepId,
          name,
          label,
          status: 'denied',
          argsPreview,
          error: decision.reason,
          resultPreview: blockedOutput.slice(0, 220),
        }
        toolSteps.push(blocked)
        callbacks.onToolStep?.(blocked)
        if (sessionId) {
          record('tool/result', {
            id: stepId,
            name,
            content: blockedOutput,
            status: 'denied',
          })
        }
        messages.push({ role: 'tool', tool_call_id: call.id, name, content: blockedOutput })
        continue
      }

      if (decision.tier === 'confirm') {
        const { isSessionToolAllowed } = await import('../llm/ToolApprovalCache')
        let approved = isSessionToolAllowed(sessionId, name)
        if (!approved) {
          const pending: LlmToolStep = {
            id: stepId,
            name,
            label,
            status: 'pending',
            argsPreview,
          }
          toolSteps.push(pending)
          callbacks.onToolStep?.(pending)
          callbacks.onStatus?.(isEn ? `Waiting for approval: ${label}…` : `等待审批：${label}…`)

          if (callbacks.onApproval && req.streamId) {
            let fileDiffs: import('@shared').ToolApprovalRequest['fileDiffs']
            try {
              const { isFileEditTool, previewFileEdits } = await import('./coding/FileDiffPreview')
              if (isFileEditTool(name)) {
                let parsed: Record<string, unknown> = {}
                try {
                  parsed = JSON.parse(argsJson || '{}') as Record<string, unknown>
                } catch {
                  parsed = {}
                }
                fileDiffs = previewFileEdits(name, parsed)
              }
            } catch {
              fileDiffs = undefined
            }
            approved = await callbacks.onApproval({
              streamId: req.streamId,
              toolCallId: stepId,
              name,
              label,
              argsPreview,
              risk: 'confirm',
              reason: decision.reason,
              sessionId,
              fileDiffs,
            })
          }
          await checkpointPause(req.streamId, abortSignal)

          if (!approved) {
            const denied: LlmToolStep = { ...pending, status: 'denied', error: 'user_denied' }
            const idx = toolSteps.findIndex((s) => s.id === stepId)
            if (idx >= 0) toolSteps[idx] = denied
            callbacks.onToolStep?.(denied)
            const output = JSON.stringify({
              error: 'User denied this sensitive tool call.',
              reason: decision.reason,
            })
            if (sessionId) {
              record('tool/result', {
                id: stepId,
                name,
                content: output,
                status: 'denied',
              })
            }
            messages.push({ role: 'tool', tool_call_id: call.id, name, content: output })
            continue
          }
        }
      }

      await checkpointPause(req.streamId, abortSignal)

      const running: LlmToolStep = {
        id: stepId,
        name,
        label,
        status: 'running',
        argsPreview,
      }
      const runIdx = toolSteps.findIndex((s) => s.id === stepId)
      if (runIdx >= 0) toolSteps[runIdx] = running
      else toolSteps.push(running)
      callbacks.onToolStep?.(running)

      const tool = registry.get(name)
      let output: string
      let failed = false
      try {
        if (!tool) {
          output = JSON.stringify({ error: `unknown tool: ${name}` })
          failed = true
        } else {
          const exec = await tool.execute(argsJson, {
            locale,
            knowledgeCollectionId: req.knowledgeCollectionId,
            sessionId: sessionId || undefined,
            agentId: req.agentId || 'direct',
            streamId: req.streamId,
            subagentDepth: req.subagentDepth ?? 0,
            settings,
            enableCodingTools: config.enableCodingTools,
            toolCallId: stepId,
            onSessionEvent: callbacks.onSessionEvent,
            maxSubagentDepth: config.maxSubagentDepth,
            parentReq,
            turnIndex,
            stepIndex,
          })
          output = exec.output
          failed = exec.failed
          if (
            !failed &&
            (name === 'generate_image' || name === 'generate_video' || name === 'generate_music')
          ) {
            try {
              const parsed = JSON.parse(output) as { markdown?: string }
              const md = parsed.markdown?.trim()
              if (md) mediaMarkdownSnippets.push(md)
            } catch {
              /* ignore */
            }
          }
          if (sessionId) {
            const post = await runToolPostExecuteHooks({
              sessionId,
              turnIndex,
              stepIndex,
              agentId,
              toolName: name,
              toolCallId: stepId,
              argsJson,
              output,
              failed,
            })
            if (post.output) output = post.output
          }
          if (exec.citations?.length) {
            for (const c of exec.citations) {
              if (!citations.some((x) => x.chunkId === c.chunkId)) citations.push(c)
            }
            callbacks.onCitations?.(citations)
          }
        }
      } catch (err) {
        failed = true
        output = JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        })
      }

      const finished: LlmToolStep = {
        ...running,
        status: failed ? 'error' : 'done',
        resultPreview: previewJson(output, 220),
        error: failed ? previewJson(output, 120) : undefined,
      }
      const finIdx = toolSteps.findIndex((s) => s.id === stepId)
      if (finIdx >= 0) toolSteps[finIdx] = finished
      callbacks.onToolStep?.(finished)

      if (sessionId) {
        record('tool/result', {
          id: stepId,
          name,
          content: output,
          status: failed ? 'error' : 'done',
        })
      }
      messages.push({ role: 'tool', tool_call_id: call.id, name, content: output })
      oweAnotherStep = true
    }

    if (sessionId) record('step/end', { turnIndex, stepIndex })

    if (!oweAnotherStep) break
  }

  if (sessionId) {
    record('turn/end', {
      turnIndex,
      reason: stepIndex >= maxSteps ? 'max_steps' : 'complete',
    })
  }

  callbacks.onStatus?.(isEn ? 'Writing reply…' : '正在生成回复…')
  await checkpointPause(req.streamId, abortSignal)

  const streamed = callbacks.onDelta
    ? await callLlmChatStream(
        {
          ...endpoint,
          model,
          messages,
          temperature: 0.7,
          maxTokens: 2048,
          timeoutMs: 120_000,
          signal: abortSignal,
          tag: `harness-stream-${req.agentId || 'direct'}`,
        },
        streamDelta,
      )
    : await callLlmChat({
        ...endpoint,
        model,
        messages,
        temperature: 0.7,
        maxTokens: 2048,
        timeoutMs: 120_000,
        signal: abortSignal,
        tag: `harness-final-${req.agentId || 'direct'}`,
      })

  await checkpointPause(req.streamId, abortSignal)
  if (!streamed.ok && isTurnCancelled(abortSignal)) throw new TurnCancelledError()
  if (sessionId) flushAssistantChunk(sessionId, chunkPending, callbacks)
  addUsage(streamed.usage)

  if (streamed.ok && (streamed.text?.trim() || mediaMarkdownSnippets.length)) {
    const rawText = streamed.text?.trim() ?? ''
    finalText = withEnsuredMediaMarkdown(rawText, mediaMarkdownSnippets)
    if (finalText.length > rawText.length) {
      streamDelta(finalText.slice(rawText.length))
    }
    if (sessionId) {
      if (!directChat) {
        const stop = await runTurnStoppingHooks({
          sessionId,
          turnIndex,
          reason: stepIndex >= maxSteps ? 'max_steps' : 'complete',
          finalText,
          agentId,
        })
        if (stop.continueTurn && stop.message?.trim()) {
          record('user/message', { content: stop.message.trim() })
          return runAgentTurnInner(req, settings, callbacks, config, abortSignal, goalContinuationDepth)
        }
      }
      record('assistant/message', {
        content: finalText,
        model: streamed.model ?? lastModel,
        providerName: streamed.providerName ?? lastProvider,
        citations: citations.length ? citations : undefined,
        toolSteps: toolSteps.length ? toolSteps : undefined,
      })
    }
  }

  persistUsage()
  return maybeContinueForActiveGoals(
    {
      ...streamed,
      text: finalText || streamed.text,
      citations,
      toolSteps,
      usage: turnUsage ?? streamed.usage,
    },
    {
      sessionId,
      req,
      settings,
      callbacks,
      config,
      abortSignal,
      goalContinuationDepth,
    },
  )
  } finally {
    if (sessionId) activeChunkPending.delete(sessionId)
  }
}
