import type { FortuneSettings, LlmChatRequest } from '@shared'
import { wantsKnowledge } from './ToolRegistry'
import { goalsPromptSection } from './GoalsStore'
import { runInjectHooks } from './plugins/PluginHooks'

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

function memoryHint(req: LlmChatRequest, isEn: boolean): string {
  const facts = (req.memoryFacts ?? [])
    .map((f) => f.trim())
    .filter(Boolean)
    .slice(0, 20)
  if (!facts.length) return ''
  const body = facts.map((f) => `- ${f}`).join('\n')
  return isEn
    ? `Persistent user memory (cross-session; honor unless the user overrides):\n${body}`
    : `跨会话长期记忆（除非用户改口，请遵守）：\n${body}`
}

export interface PromptSection {
  id: string
  content: string
}

/** Assemble system prompt from ordered sections (dsh system-prompt inspired). */
export async function assembleSystemPrompt(
  req: LlmChatRequest,
  toolNames: string[],
  sessionId?: string,
  turnIndex = 0,
): Promise<string | null> {
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

  const parts: string[] = []

  if (!agentId || agentId === 'direct' || agentId === 'none') {
    parts.push(
      isEn
        ? 'Answer the user directly and helpfully. Do not role-play as a fortune or stock specialist unless the user asks.'
        : '直接、清楚地回答用户问题。除非用户明确要求，否则不要扮演运势或股票等垂直领域助手。',
    )
  } else {
    const custom = req.systemPrompt?.trim()
    if (custom) {
      parts.push(
        isEn
          ? 'You are a custom local agent in Qiankun workbench.'
          : '你是「袖里乾坤」工作台中的自定义智能体。',
        custom,
        isEn
          ? 'Stay helpful and concise. Do not invent tool results you cannot access.'
          : '回答务实简洁；不要编造你无法访问的工具结果。',
      )
    } else {
      const builtin = BUILTIN_SYSTEM[agentId]
      if (builtin) parts.push(isEn ? builtin.en : builtin.zh)
      else {
        parts.push(
          isEn
            ? 'You are a helpful local assistant in Qiankun workbench.'
            : '你是「袖里乾坤」工作台助手，请用清晰务实的中文回答。',
        )
      }
    }
  }

  parts.push(modeHint, knowledgeHint, memoryHint(req, isEn), toolHint)
  if (sessionId) {
    const goals = goalsPromptSection(sessionId)
    if (goals) parts.push(goals)
    const inject = await runInjectHooks({
      sessionId,
      turnIndex,
      agentId: req.agentId || 'direct',
      section: 'system',
    })
    if (inject.content?.trim()) parts.push(inject.content.trim())
  }
  const text = parts.filter(Boolean).join('\n\n')
  return text || null
}

export function settingsToLlmEndpoint(settings: FortuneSettings): {
  baseUrl: string
  apiKey: string
  apiFormat: 'openai' | 'anthropic'
  model: string
  providerName: string
} {
  return {
    baseUrl: settings.aiBaseUrl,
    apiKey: settings.aiApiKey,
    apiFormat: settings.aiApiFormat === 'anthropic' ? 'anthropic' : 'openai',
    model: settings.aiModel,
    providerName: settings.aiProviderName,
  }
}
