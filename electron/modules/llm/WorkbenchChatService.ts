import type { FortuneSettings, LlmChatMessage, LlmChatRequest, LlmChatResponse } from '@shared'
import { callLlmChat, callLlmChatStream, settingsToLlmEndpoint } from './LlmClient'

const BUILTIN_SYSTEM: Record<string, { zh: string; en: string }> = {
  fortune: {
    zh: [
      '你是「袖里乾坤」内置智能体「今日运势」。',
      '用清晰、务实的中文回答用户关于运势、卦象、日干支与行事建议的问题。',
      '不要编造精确到分钟的宿命断言；不要提供医疗或投资保证。',
      '若信息不足，先说明假设再给建议。',
    ].join('\n'),
    en: [
      'You are Qiankun’s built-in “Daily Fortune” agent.',
      'Answer clearly about hexagrams, day master, and practical daily guidance.',
      'Do not claim absolute destiny. Avoid medical or financial guarantees.',
      'If context is missing, state assumptions first.',
    ].join('\n'),
  },
  stocks: {
    zh: [
      '你是「袖里乾坤」内置智能体「股票参谋」。',
      '帮助用户理解行情、资讯与荐股报告逻辑，给出可核对的分析思路。',
      '不做保证收益的承诺；提醒风险与信息时效。',
      '若缺少具体标的或报告数据，先询问或说明局限。',
    ].join('\n'),
    en: [
      'You are Qiankun’s built-in “Stock Advisor” agent.',
      'Help users reason about quotes, news, and report logic with checkable steps.',
      'Never promise returns; call out risk and data freshness.',
      'If symbols or report context are missing, ask or state limits.',
    ].join('\n'),
  },
}

function resolveSystemPrompt(req: LlmChatRequest): string | null {
  const locale = (req.locale ?? 'zh-CN').toLowerCase()
  const isEn = locale.startsWith('en')
  const agentId = (req.agentId ?? '').trim()

  // Direct model chat: no domain persona — omit system or keep a tiny guardrail.
  if (!agentId || agentId === 'direct' || agentId === 'none') {
    return isEn
      ? 'Answer the user directly and helpfully. Do not role-play as a fortune or stock specialist unless the user asks.'
      : '直接、清楚地回答用户问题。除非用户明确要求，否则不要扮演运势或股票等垂直领域助手。'
  }

  const custom = req.systemPrompt?.trim()
  if (custom) {
    return [
      isEn
        ? 'You are a custom local agent in Qiankun workbench.'
        : '你是「袖里乾坤」工作台中的自定义智能体。',
      custom,
      isEn
        ? 'Stay helpful and concise. Do not invent tool results you cannot access.'
        : '回答务实简洁；不要编造你无法访问的工具结果。',
    ].join('\n')
  }
  const builtin = BUILTIN_SYSTEM[agentId]
  if (builtin) return isEn ? builtin.en : builtin.zh
  return isEn
    ? 'You are a helpful local assistant in Qiankun workbench.'
    : '你是「袖里乾坤」工作台助手，请用清晰务实的中文回答。'
}

/** Keep recent turns to control context size. */
function trimHistory(
  messages: LlmChatRequest['messages'],
  limit = 24,
): LlmChatRequest['messages'] {
  if (messages.length <= limit) return messages
  return messages.slice(-limit)
}

function prepareChat(
  req: LlmChatRequest,
  settings: FortuneSettings,
):
  | {
      ok: true
      messages: LlmChatMessage[]
      model: string
      endpoint: ReturnType<typeof settingsToLlmEndpoint>
    }
  | { ok: false; response: LlmChatResponse } {
  const endpoint = settingsToLlmEndpoint(settings)
  const model = (req.model?.trim() || endpoint.model).trim()
  const history = trimHistory(req.messages).filter((m) => m.content.trim())
  if (history.length === 0) {
    return {
      ok: false,
      response: { ok: false, error: 'Empty message.', providerName: endpoint.providerName },
    }
  }

  const system = resolveSystemPrompt(req)
  const messages: LlmChatMessage[] = [
    ...(system ? [{ role: 'system' as const, content: system }] : []),
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ]
  return { ok: true, messages, model, endpoint }
}

export async function runWorkbenchChat(
  req: LlmChatRequest,
  settings: FortuneSettings,
): Promise<LlmChatResponse> {
  const prepared = prepareChat(req, settings)
  if (!prepared.ok) return prepared.response

  return callLlmChat({
    ...prepared.endpoint,
    model: prepared.model,
    messages: prepared.messages,
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
): Promise<LlmChatResponse> {
  const prepared = prepareChat(req, settings)
  if (!prepared.ok) return prepared.response

  return callLlmChatStream(
    {
      ...prepared.endpoint,
      model: prepared.model,
      messages: prepared.messages,
      temperature: 0.7,
      maxTokens: 2048,
      timeoutMs: 120_000,
      tag: `workbench-stream-${req.agentId || 'direct'}`,
    },
    onDelta,
  )
}
