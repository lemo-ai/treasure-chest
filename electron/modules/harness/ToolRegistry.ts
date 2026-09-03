import type { LlmChatMessage, LlmChatRequest, LlmToolSpec, SessionEvent, FortuneSettings } from '@shared'
import { DEFAULT_HARNESS_CONFIG } from '@shared'
import { listMcpToolsAsSpecs, callMcpTool } from '../mcp/McpHub'
import { builtinToolsForAgent, previewJson, toolDisplayName, toolStatusLabel } from '../llm/tools/builtinTools'
import { executeBuiltinTool } from '../llm/tools/executeBuiltin'
import { classifyToolSensitivity } from '../llm/toolSensitivity'
import { logger } from '../../utils/logger'
import { appendEvent } from './SessionRepo'
import { codingToolSpecs, harnessAgentToolSpecs } from './coding/codingTools'
import { executeCodingTool } from './coding/executeCoding'
import { executeHarnessTool } from './executeHarnessTools'
import { getHarnessPluginTools } from './plugins/PluginLoader'
import { buildPluginContext } from './plugins/PluginContext'
import { resolveAgentToolPolicy } from './AgentToolPolicy'

export type ToolExecuteResult = {
  output: string
  failed: boolean
  citations?: import('@shared').KnowledgeCitation[]
}

export interface RegisteredTool {
  spec: LlmToolSpec
  source: 'builtin' | 'mcp' | 'coding' | 'harness' | 'plugin'
  execute(argsJson: string, ctx: ToolExecCtx): Promise<ToolExecuteResult>
}

export interface ToolExecCtx {
  locale: string
  knowledgeCollectionId?: string
  sessionId?: string
  agentId?: string
  streamId?: string
  subagentDepth?: number
  settings?: FortuneSettings
  enableCodingTools?: boolean
  toolCallId?: string
  onSessionEvent?: (event: SessionEvent) => void
  maxSubagentDepth?: number
  parentReq?: Pick<
    LlmChatRequest,
    'enableCodingTools' | 'enablePluginTools' | 'enableHarnessTools' | 'enableSpawnSubagent' | 'enableMcpTools' | 'enabledMcpServerIds'
  >
  turnIndex?: number
  stepIndex?: number
}

export interface ToolRegistryOptions {
  agentId: string
  useKnowledge?: boolean
  useWebSearch?: boolean
  enabledMcpServerIds?: string[]
  sessionId?: string
  streamId?: string
  subagentDepth?: number
  settings?: FortuneSettings
  enableCodingTools?: boolean
  enableHarnessTools?: boolean
  enablePluginTools?: boolean
  enableSpawnSubagent?: boolean
  enableMcpTools?: boolean
  maxSubagentDepth?: number
  parentReq?: Pick<
    LlmChatRequest,
    'enableCodingTools' | 'enablePluginTools' | 'enableHarnessTools' | 'enableSpawnSubagent' | 'enableMcpTools' | 'enabledMcpServerIds'
  >
}

function mcpServerIdFromToolName(name: string): string | null {
  if (!name.startsWith('mcp__')) return null
  const rest = name.slice('mcp__'.length)
  const idx = rest.indexOf('__')
  if (idx <= 0) return null
  return rest.slice(0, idx)
}

function extractKnowledgeCitations(output: string): import('@shared').KnowledgeCitation[] {
  try {
    const parsed = JSON.parse(output) as {
      hits?: Array<{
        documentId: string
        title: string
        chunkId: string
        ordinal: number
        text: string
        score: number
      }>
    }
    return (parsed.hits ?? []).map((hit) => ({
      documentId: hit.documentId,
      title: hit.title,
      chunkId: hit.chunkId,
      ordinal: hit.ordinal,
      text: hit.text,
      score: hit.score,
    }))
  } catch {
    return []
  }
}

/** Unified tool registry: builtin + MCP with guarded execution. */
export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>()

  async load(opts: ToolRegistryOptions): Promise<LlmToolSpec[]> {
    this.tools.clear()
    const policy = resolveAgentToolPolicy(opts.agentId, {
      enableCodingTools: opts.enableCodingTools,
      enableHarnessTools: opts.enableHarnessTools,
      enablePluginTools: opts.enablePluginTools,
      enableSpawnSubagent: opts.enableSpawnSubagent,
      enableMcpTools: opts.enableMcpTools,
    })
    const builtin = builtinToolsForAgent(opts.agentId, {
      useKnowledge: opts.useKnowledge,
      useWebSearch: opts.useWebSearch,
    })
    for (const spec of builtin) {
      const name = spec.function.name
      this.tools.set(name, {
        spec,
        source: 'builtin',
        execute: async (argsJson, ctx) => {
          let patched = argsJson
          if (name === 'search_knowledge' && ctx.knowledgeCollectionId) {
            try {
              const parsed = JSON.parse(argsJson || '{}') as Record<string, unknown>
              if (!parsed.collectionId) {
                parsed.collectionId = ctx.knowledgeCollectionId
                patched = JSON.stringify(parsed)
              }
            } catch {
              /* keep */
            }
          }
          const output = await executeBuiltinTool(name, patched, { locale: ctx.locale })
          let failed = false
          try {
            const parsed = JSON.parse(output) as { error?: string }
            if (parsed?.error) failed = true
          } catch {
            /* plain text ok */
          }
          const citations = name === 'search_knowledge' ? extractKnowledgeCitations(output) : []
          return { output, failed, citations }
        },
      })
    }

    if (policy.enableMcpTools) {
      try {
        const mcpTools = await listMcpToolsAsSpecs()
        const allow = (opts.enabledMcpServerIds ?? []).map((id) => id.trim()).filter(Boolean)
        const filtered =
          allow.length === 0
            ? mcpTools
            : mcpTools.filter((t) => {
                const serverId = mcpServerIdFromToolName(t.function.name)
                return serverId != null && allow.includes(serverId)
              })
        for (const spec of filtered) {
          const name = spec.function.name
          if (this.tools.has(name)) continue
          this.tools.set(name, {
            spec,
            source: 'mcp',
            execute: async (argsJson) => {
              const output = await callMcpTool(name, argsJson)
              let failed = false
              try {
                const parsed = JSON.parse(output) as { error?: string }
                if (parsed?.error) failed = true
              } catch {
                /* ok */
              }
              return { output, failed }
            },
          })
        }
      } catch (err) {
        logger.warn('tool registry mcp load failed', err)
      }
    }

    if (policy.enableCodingTools) {
      for (const spec of codingToolSpecs) {
        const name = spec.function.name
        this.tools.set(name, {
          spec,
          source: 'coding',
          execute: async (argsJson, ctx) => {
            const output = await executeCodingTool(name, argsJson, {
              sessionId: ctx.sessionId,
              toolCallId: ctx.toolCallId,
              onShellChunk: (payload) => {
                if (!ctx.sessionId) return
                const ev = appendEvent(ctx.sessionId, 'shell/chunk', payload)
                ctx.onSessionEvent?.(ev)
              },
            })
            let failed = false
            try {
              const parsed = JSON.parse(output) as { error?: string }
              if (parsed?.error) failed = true
            } catch {
              /* ok */
            }
            return { output, failed }
          },
        })
      }
    }

    if (policy.enableHarnessTools && opts.sessionId) {
      const depth = opts.subagentDepth ?? 0
      const maxDepth = opts.maxSubagentDepth ?? DEFAULT_HARNESS_CONFIG.maxSubagentDepth
      for (const spec of harnessAgentToolSpecs) {
        const name = spec.function.name
        if (name === 'spawn_subagent' && (!policy.enableSpawnSubagent || depth >= maxDepth)) continue
        this.tools.set(name, {
          spec,
          source: 'harness',
          execute: async (argsJson, ctx) => {
            if (!ctx.settings) {
              return { output: JSON.stringify({ error: 'settings missing' }), failed: true }
            }
            const output = await executeHarnessTool(name, argsJson, {
              sessionId: ctx.sessionId,
              agentId: ctx.agentId || opts.agentId,
              locale: ctx.locale,
              streamId: ctx.streamId,
              subagentDepth: ctx.subagentDepth ?? 0,
              maxSubagentDepth: ctx.maxSubagentDepth ?? maxDepth,
              settings: ctx.settings,
              parentReq: ctx.parentReq ?? opts.parentReq,
              onSessionEvent: ctx.onSessionEvent,
            })
            let failed = false
            try {
              const parsed = JSON.parse(output) as { error?: string; ok?: boolean }
              if (parsed?.error || parsed?.ok === false) failed = true
            } catch {
              /* ok */
            }
            return { output, failed }
          },
        })
      }
    }

    if (policy.enablePluginTools) {
      try {
        const pluginTools = await getHarnessPluginTools()
        for (const pt of pluginTools) {
          const name = pt.spec.function.name
          if (this.tools.has(name)) continue
          this.tools.set(name, {
            spec: pt.spec,
            source: 'plugin',
            execute: async (argsJson, ctx) => {
              let args: Record<string, unknown> = {}
              try {
                args = argsJson.trim() ? (JSON.parse(argsJson) as Record<string, unknown>) : {}
              } catch {
                return { output: JSON.stringify({ error: 'invalid arguments JSON' }), failed: true }
              }
              const pluginCtx = buildPluginContext({
                sessionId: ctx.sessionId || opts.sessionId || '',
                agentId: ctx.agentId || opts.agentId,
                turnIndex: ctx.turnIndex ?? 0,
                stepIndex: ctx.stepIndex ?? 0,
                settings: ctx.settings,
              })
              const output = await pt.execute(args, pluginCtx)
              let failed = false
              try {
                const parsed = JSON.parse(output) as { error?: string }
                if (parsed?.error) failed = true
              } catch {
                /* ok */
              }
              return { output, failed }
            },
          })
        }
      } catch (err) {
        logger.warn('tool registry plugin load failed', err)
      }
    }

    return [...this.tools.values()].map((t) => t.spec)
  }

  listSpecs(): LlmToolSpec[] {
    return [...this.tools.values()].map((t) => t.spec)
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name)
  }

  classify(name: string, argsJson: string) {
    return classifyToolSensitivity(name, argsJson)
  }

  displayName(name: string, locale: string): string {
    return toolDisplayName(name, locale)
  }

  statusLabel(name: string, locale: string): string {
    return toolStatusLabel(name, locale)
  }

  previewArgs(argsJson: string): string {
    return previewJson(argsJson)
  }
}

export function wantsKnowledge(req: LlmChatRequest): boolean {
  if (req.useKnowledge) return true
  return req.messages.some((m) => /@知识库|@knowledge/i.test(m.content))
}

/** ChatGPT-style live lookup; stocks agent always on; explicit false = pure model. */
export function wantsWebSearch(req: LlmChatRequest): boolean {
  const id = (req.agentId || 'direct').trim()
  if (id === 'stocks') return true
  if (req.capabilityMode === 'research') return true
  if (req.enableWebSearch === false) return false
  if (req.enableWebSearch === true) return true
  return id !== 'fortune'
}

/** Build model-visible history from session events. */
export function eventsToChatMessages(
  events: SessionEvent[],
  system: string | null,
  maxMessages: number,
): LlmChatMessage[] {
  const rows: LlmChatMessage[] = []
  if (system) rows.push({ role: 'system', content: system })

  let compactionThrough = 0
  let compactionNote = ''
  for (const e of events) {
    if (e.type === 'compaction/summary') {
      const p = e.payload as { summary: string; throughSeq: number }
      compactionNote = p.summary
      compactionThrough = p.throughSeq
    }
  }
  if (compactionNote) {
    rows.push({
      role: 'system',
      content: `Earlier conversation summary:\n${compactionNote}`,
    })
  }

  const llmRows: LlmChatMessage[] = []
  for (const e of events) {
    if (e.seq <= compactionThrough) continue
    switch (e.type) {
      case 'user/message': {
        const p = e.payload as { content: string }
        if (p.content.startsWith('[system] ')) break
        llmRows.push({ role: 'user', content: p.content })
        break
      }
      case 'assistant/message': {
        const p = e.payload as { content: string }
        llmRows.push({ role: 'assistant', content: p.content })
        break
      }
      case 'tool/call': {
        const p = e.payload as { id: string; name: string; arguments: string }
        const last = llmRows.at(-1)
        const call = {
          id: p.id,
          type: 'function' as const,
          function: { name: p.name, arguments: p.arguments },
        }
        if (last?.role === 'assistant' && last.tool_calls?.length) {
          last.tool_calls.push(call)
        } else {
          llmRows.push({ role: 'assistant', content: null, tool_calls: [call] })
        }
        break
      }
      case 'tool/result': {
        const p = e.payload as { id: string; name: string; content: string }
        llmRows.push({
          role: 'tool',
          tool_call_id: p.id,
          name: p.name,
          content: p.content,
        })
        break
      }
      default:
        break
    }
  }

  const trimmed = llmRows.length > maxMessages ? llmRows.slice(-maxMessages) : llmRows
  return [...rows, ...trimmed]
}
