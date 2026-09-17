import type { FortuneSettings, LlmChatRequest } from '@shared'
import { isDirectChatAgentId } from '@shared'
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
      '需要行情时调用 get_stock_quote；不知道代码时并行调用 search_stock + search_web。需要文章细节时 fetch_url。',
      '上市与否、涨跌数字只采工具。search_stock 无结果要再搜，不能直接说未上市。不编造精确未来涨跌。',
    ].join('\n'),
    en: [
      'You are Qiankun’s built-in “Stock Advisor” agent.',
      'Help users reason about quotes, news, and report logic with checkable steps.',
      'Use get_stock_quote for prices. Unknown ticker: call search_stock and search_web in parallel. Use fetch_url for article bodies.',
      'Listing status and prices come from tools only. Empty lookup is not “unlisted”. No promised return forecasts.',
    ].join('\n'),
  },
}

function todayLocalYmd(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function liveDataPolicy(isEn: boolean): string {
  const today = todayLocalYmd()
  return isEn
    ? [
        `Today's local date is ${today}. Your training cutoff is NOT current time.`,
        'For news, listing/IPO status, stock prices, weather, or any fact that can change: call tools FIRST (search_web, search_stock, get_stock_quote, fetch_url). You may call several in parallel.',
        'If tools conflict with memory, trust tools. Empty search ≠ unlisted/does-not-exist — retry or fetch_url a result link.',
        'Cite source titles. Do not invent tickers or prices. No guaranteed return forecasts.',
      ].join('\n')
    : [
        `今天本地日期是 ${today}。你的训练截止日期不等于今天。`,
        '新闻、是否上市、股价、天气等会变的事实：必须先调工具（search_web、search_stock、get_stock_quote、fetch_url），可并行调用。',
        '工具结果与记忆冲突时以工具为准。检索为空只表示本次失败，不是「未上市/不存在」。',
        '回答时点出来源标题。禁止编造代码或价格。禁止保证收益的趋势预测。',
      ].join('\n')
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
      create_agent: {
        zh: `当前模式：帮用户创建智能体。澄清需求后，输出一个 \`\`\`agent-spec JSON 代码块（字段 name/description/systemPrompt/tone）。tone 为 brand|accent|highlight。用户会在界面点创建。`,
        en: `Mode: create agent. After clarifying, output one \`\`\`agent-spec JSON block (name/description/systemPrompt/tone). tone: brand|accent|highlight. User confirms in UI.`,
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
  const isDirect = isDirectChatAgentId(agentId)

  if (isDirect) {
    parts.push(
      isEn
        ? 'Answer the user directly. You are not a domain specialist unless asked.'
        : '直接回答用户。除非用户要求，否则不要扮演垂直领域助手。',
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

  if (toolNames.length) parts.push(liveDataPolicy(isEn))
  parts.push(modeHint, knowledgeHint, memoryHint(req, isEn), toolHint)
  if (sessionId && !isDirect) {
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
