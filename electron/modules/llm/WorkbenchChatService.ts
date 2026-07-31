import type {
  FortuneSettings,
  LlmChatMessage,
  LlmChatRequest,
  LlmChatResponse,
  LlmToolSpec,
} from '@shared'
import { callLlmChat, callLlmChatStream, settingsToLlmEndpoint } from './LlmClient'
import { builtinToolsForAgent, toolStatusLabel } from './tools/builtinTools'
import { executeBuiltinTool } from './tools/executeBuiltin'
import { listMcpToolsAsSpecs, callMcpTool } from '../mcp/McpHub'
import { logger } from '../../utils/logger'

const BUILTIN_SYSTEM: Record<string, { zh: string; en: string }> = {
  fortune: {
    zh: [
      '你是「袖里乾坤」内置智能体「今日运势」。',
      '用清晰、务实的中文回答用户关于运势、卦象、日干支与行事建议的问题。',
      '需要当日运势/卦象数据时，先调用 get_daily_fortune，再基于工具结果回答；不要编造档案不存在时的精确卦象。',
      '不要编造精确到分钟的宿命断言；不要提供医疗或投资保证。',
    ].join('\n'),
    en: [
      'You are Qiankun’s built-in “Daily Fortune” agent.',
      'Answer clearly about hexagrams, day master, and practical daily guidance.',
      'Call get_daily_fortune when you need today’s local fortune data; do not invent a hexagram without it.',
      'Do not claim absolute destiny. Avoid medical or financial guarantees.',
    ].join('\n'),
  },
  stocks: {
    zh: [
      '你是「袖里乾坤」内置智能体「股票参谋」。',
      '帮助用户理解行情、资讯与荐股报告逻辑，给出可核对的分析思路。',
      '需要行情时调用 get_stock_quote；需要本地荐股报告时调用 get_latest_stocks_report。',
      '不做保证收益的承诺；提醒风险与信息时效。',
    ].join('\n'),
    en: [
      'You are Qiankun’s built-in “Stock Advisor” agent.',
      'Help users reason about quotes, news, and report logic with checkable steps.',
      'Use get_stock_quote for prices and get_latest_stocks_report for the local report.',
      'Never promise returns; call out risk and data freshness.',
    ].join('\n'),
  },
}

function resolveSystemPrompt(req: LlmChatRequest, toolNames: string[]): string | null {
  const locale = (req.locale ?? 'zh-CN').toLowerCase()
  const isEn = locale.startsWith('en')
  const agentId = (req.agentId ?? '').trim()
  const toolHint = toolNames.length
    ? isEn
      ? `Available tools: ${toolNames.join(', ')}. Prefer tools for live/local data instead of guessing.`
      : `可用工具：${toolNames.join('、')}。涉及实时或本地数据时请优先调用工具，不要臆造。`
    : ''

  const modeHint = (() => {
    const mode = (req.capabilityMode || '').trim()
    if (!mode) return ''
    const skill = req.skillPrompt?.trim()
    const map: Record<string, { zh: string; en: string }> = {
      write: {
        zh: '当前模式：帮我写作。起草/改写/润色，结构清晰可直接使用。',
        en: 'Mode: writing assistant. Draft/rewrite/polish clearly and usable.',
      },
      translate: {
        zh: '当前模式：翻译。准确翻译，保留专有名词；默认只输出译文。',
        en: 'Mode: translation. Translate accurately; default to translation only.',
      },
      research: {
        zh: '当前模式：深入研究。分步骤论证；有知识库工具时先检索再总结，并标明来源标题。',
        en: 'Mode: deep research. Prefer knowledge tools and cite source titles.',
      },
      skills: {
        zh: '当前模式：技能助手。严格按技能模板输出。',
        en: 'Mode: skills. Follow the skill template strictly.',
      },
    }
    const pack = map[mode]
    if (!pack) return skill || ''
    return [isEn ? pack.en : pack.zh, skill].filter(Boolean).join('\n')
  })()

  const knowledgeHint = wantsKnowledge(req)
    ? isEn
      ? 'The user referenced the knowledge base. Call search_knowledge before answering factual questions about uploaded docs. After using hits, mention document titles you relied on.'
      : '用户引用了知识库。回答上传文档相关事实前请先调用 search_knowledge；引用时注明文档标题。'
    : ''

  if (!agentId || agentId === 'direct' || agentId === 'none') {
    return [
      isEn
        ? 'Answer the user directly and helpfully. Do not role-play as a fortune or stock specialist unless the user asks.'
        : '直接、清楚地回答用户问题。除非用户明确要求，否则不要扮演运势或股票等垂直领域助手。',
      modeHint,
      knowledgeHint,
      toolHint,
    ]
      .filter(Boolean)
      .join('\n')
  }

  const custom = req.systemPrompt?.trim()
  if (custom) {
    return [
      isEn
        ? 'You are a custom local agent in Qiankun workbench.'
        : '你是「袖里乾坤」工作台中的自定义智能体。',
      custom,
      modeHint,
      knowledgeHint,
      toolHint,
      isEn
        ? 'Stay helpful and concise. Do not invent tool results you cannot access.'
        : '回答务实简洁；不要编造你无法访问的工具结果。',
    ].join('\n')
  }
  const builtin = BUILTIN_SYSTEM[agentId]
  if (builtin) {
    return [isEn ? builtin.en : builtin.zh, modeHint, knowledgeHint, toolHint]
      .filter(Boolean)
      .join('\n')
  }
  return [
    isEn
      ? 'You are a helpful local assistant in Qiankun workbench.'
      : '你是「袖里乾坤」工作台助手，请用清晰务实的中文回答。',
    modeHint,
    knowledgeHint,
    toolHint,
  ]
    .filter(Boolean)
    .join('\n')
}

function trimHistory(
  messages: LlmChatRequest['messages'],
  limit = 24,
): LlmChatRequest['messages'] {
  if (messages.length <= limit) return messages
  return messages.slice(-limit)
}

function wantsKnowledge(req: LlmChatRequest): boolean {
  if (req.useKnowledge) return true
  return req.messages.some((m) => /@知识库|@knowledge/i.test(m.content))
}

async function resolveTools(req: LlmChatRequest): Promise<LlmToolSpec[]> {
  const builtin = builtinToolsForAgent(req.agentId || 'direct', {
    useKnowledge: wantsKnowledge(req),
  })
  try {
    const mcpTools = await listMcpToolsAsSpecs()
    const names = new Set(builtin.map((t) => t.function.name))
    return [...builtin, ...mcpTools.filter((t) => !names.has(t.function.name))]
  } catch (err) {
    logger.warn('mcp tool list failed', err)
    return builtin
  }
}

async function runToolLoop(
  req: LlmChatRequest,
  settings: FortuneSettings,
  onStatus?: (text: string) => void,
  onCitations?: (citations: import('@shared').KnowledgeCitation[]) => void,
): Promise<LlmChatResponse & { messages: LlmChatMessage[] }> {
  const endpoint = settingsToLlmEndpoint(settings)
  const model = (req.model?.trim() || endpoint.model).trim()
  const locale = req.locale ?? 'zh-CN'
  const history = trimHistory(req.messages).filter((m) => m.content.trim())
  if (history.length === 0) {
    return {
      ok: false,
      error: 'Empty message.',
      providerName: endpoint.providerName,
      messages: [],
    }
  }

  const tools = await resolveTools(req)
  const toolNames = tools.map((t) => t.function.name)
  const system = resolveSystemPrompt(req, toolNames)
  const messages: LlmChatMessage[] = [
    ...(system ? [{ role: 'system' as const, content: system }] : []),
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ]

  const maxRounds = 4
  const canUseTools = endpoint.apiFormat !== 'anthropic' && tools.length > 0
  const citations: import('@shared').KnowledgeCitation[] = []

  for (let round = 0; round < maxRounds; round++) {
    const result = await callLlmChat({
      ...endpoint,
      model,
      messages,
      tools: canUseTools ? tools : undefined,
      temperature: 0.7,
      maxTokens: 2048,
      timeoutMs: 120_000,
      tag: `workbench-tools-${req.agentId || 'direct'}-r${round}`,
    })

    if (!result.ok) {
      return { ...result, messages, citations }
    }

    const calls = result.toolCalls ?? []
    if (!calls.length) {
      return { ...result, messages, citations }
    }

    messages.push({
      role: 'assistant',
      content: result.text?.trim() || null,
      tool_calls: calls,
    })

    for (const call of calls) {
      const name = call.function.name
      onStatus?.(toolStatusLabel(name, locale))
      let argsJson = call.function.arguments || '{}'
      if (name === 'search_knowledge' && req.knowledgeCollectionId) {
        try {
          const parsed = JSON.parse(argsJson || '{}') as Record<string, unknown>
          if (!parsed.collectionId) {
            parsed.collectionId = req.knowledgeCollectionId
            argsJson = JSON.stringify(parsed)
          }
        } catch {
          /* keep original */
        }
      }
      let output: string
      if (name.startsWith('mcp__')) {
        output = await callMcpTool(name, argsJson)
      } else {
        output = await executeBuiltinTool(name, argsJson, { locale })
      }
      if (name === 'search_knowledge') {
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
          for (const hit of parsed.hits || []) {
            citations.push({
              documentId: hit.documentId,
              title: hit.title,
              chunkId: hit.chunkId,
              ordinal: hit.ordinal,
              text: hit.text,
              score: hit.score,
            })
          }
          if (citations.length) onCitations?.(citations)
        } catch {
          /* ignore */
        }
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name,
        content: output,
      })
    }
  }

  return {
    ok: false,
    error: 'Tool loop exceeded max rounds.',
    providerName: endpoint.providerName,
    model,
    messages,
    citations,
  }
}

export async function runWorkbenchChat(
  req: LlmChatRequest,
  settings: FortuneSettings,
): Promise<LlmChatResponse> {
  const looped = await runToolLoop(req, settings)
  if (!looped.ok) return looped
  if (looped.text?.trim()) return looped

  // Final pass without tools if last tool round produced no text
  const endpoint = settingsToLlmEndpoint(settings)
  const model = (req.model?.trim() || endpoint.model).trim()
  return callLlmChat({
    ...endpoint,
    model,
    messages: looped.messages,
    temperature: 0.7,
    maxTokens: 2048,
    timeoutMs: 120_000,
    tag: `workbench-${req.agentId || 'direct'}`,
  })
}

export async function runWorkbenchChatStream(
  req: LlmChatRequest,
  settings: FortuneSettings,
  onDelta: (text: string) => void,
  onStatus?: (text: string) => void,
  onCitations?: (citations: import('@shared').KnowledgeCitation[]) => void,
): Promise<LlmChatResponse> {
  const endpoint = settingsToLlmEndpoint(settings)
  const model = (req.model?.trim() || endpoint.model).trim()

  onStatus?.(
    (req.locale ?? '').toLowerCase().startsWith('en') ? 'Thinking…' : '思考中…',
  )

  const looped = await runToolLoop(req, settings, onStatus, onCitations)
  if (!looped.ok && !looped.messages.length) return looped

  if (looped.ok && looped.text?.trim() && !(looped.toolCalls?.length)) {
    onDelta(looped.text.trim())
    return looped
  }

  if (!looped.ok && looped.messages.length === 0) return looped

  onStatus?.(
    (req.locale ?? '').toLowerCase().startsWith('en') ? 'Writing reply…' : '正在生成回复…',
  )

  const streamed = await callLlmChatStream(
    {
      ...endpoint,
      model,
      messages: looped.messages.length
        ? looped.messages
        : [{ role: 'user', content: req.messages.at(-1)?.content || '' }],
      temperature: 0.7,
      maxTokens: 2048,
      timeoutMs: 120_000,
      tag: `workbench-stream-${req.agentId || 'direct'}`,
    },
    onDelta,
  )
  return { ...streamed, citations: looped.citations }
}
