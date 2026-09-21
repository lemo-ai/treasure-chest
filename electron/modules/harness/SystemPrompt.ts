import type { FortuneSettings, LlmChatRequest } from '@shared'
import { isDirectChatAgentId } from '@shared'
import { wantsKnowledge } from './ToolRegistry'
import { goalsPromptSection } from './GoalsStore'
import { runInjectHooks } from './plugins/PluginHooks'
import { getConfiguredSandboxRoot } from './coding/Sandbox'

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
  lottery: {
    // Fallback only when chat omits systemPrompt; primary persona lives in agentRegistry prefs.
    zh: [
      '你是「袖里乾坤」工作台中的体彩分析助手（预装配置可在设置中修改）。',
      '绑定 Settings 数据源后用 list_data_sources / query_data_source；网页用 crawl_url。可启用技能 sports-lottery-datasource。仅供研究，不构成购彩建议。',
    ].join('\n'),
    en: [
      'You are Qiankun’s sports-lottery assistant (editable preset).',
      'Bind Settings data sources, then use list_data_sources / query_data_source; crawl pages with crawl_url. Enable skill sports-lottery-datasource. Research only — not betting advice.',
    ].join('\n'),
  },
}

function todayLocalYmd(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function codingPolicy(isEn: boolean, workspaceRoot: string | null): string {
  const root = workspaceRoot?.trim()
  if (!root) {
    return isEn
      ? 'Coding tools are available, but no project folder is open. Ask the user to click Project → Open and choose a folder before reading or editing files.'
      : '已启用编码工具，但尚未打开项目目录。请先让用户点击「项目 → 打开」选择文件夹，再读写文件。'
  }
  return isEn
    ? [
        `Active coding project: ${root}`,
        'Coding tools are available (read_file, write_file, str_replace_file, list_dir, search_files, grep_content, apply_patch, git_*, run_shell, diagnostics).',
        'All paths are relative to this project root. Prefer read/search before edit; use str_replace_file for surgical edits; run_shell for builds/tests.',
        'Do not invent file contents — read first. After edits, briefly summarize what changed.',
      ].join('\n')
    : [
        `当前编码项目：${root}`,
        '已启用编码工具（read_file、write_file、str_replace_file、list_dir、search_files、grep_content、apply_patch、git_*、run_shell、diagnostics）。',
        '路径均相对于该项目根目录。先读/搜再改；小改用 str_replace_file；构建/测试用 run_shell。',
        '不要臆造文件内容——先 read。改完简要说明变更。',
      ].join('\n')
}

function liveDataPolicy(isEn: boolean): string {
  const today = todayLocalYmd()
  return isEn
    ? [
        `Today's local date is ${today}. Your training cutoff is NOT current time.`,
        'For news, listing/IPO status, stock prices, weather, or any fact that can change: call tools FIRST (search_web, search_stock, get_stock_quote, fetch_url, crawl_url). You may call several in parallel.',
        'If tools conflict with memory, trust tools. Empty search ≠ unlisted/does-not-exist — retry or fetch_url / crawl_url a result link.',
        'Cite source titles. Do not invent tickers or prices. No guaranteed return forecasts.',
        'When the user wants an image, video, or music/song: call generate_image / generate_video / generate_music. Paste the tool’s markdown field verbatim so media renders. Never invent media URLs.',
      ].join('\n')
    : [
        `今天本地日期是 ${today}。你的训练截止日期不等于今天。`,
        '新闻、是否上市、股价、天气等会变的事实：必须先调工具（search_web、search_stock、get_stock_quote、fetch_url、crawl_url），可并行调用。',
        '工具结果与记忆冲突时以工具为准。检索为空只表示本次失败，不是「未上市/不存在」。',
        '回答时点出来源标题。禁止编造代码或价格。禁止保证收益的趋势预测。',
        '用户要生成图片、视频或音乐/歌曲时：调用 generate_image / generate_video / generate_music，并把工具返回的 markdown 原样贴进回复以便播放/展示。禁止编造媒体链接。',
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
        ? 'Answer the user directly. You are a workbench assistant that can chat, use tools, and edit code in the coding sandbox when asked.'
        : '直接回答用户。你是工作台助手：可对话、调用工具，并在用户需要时在编码沙箱中读写与修改代码。',
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
  if (toolNames.includes('read_file') || toolNames.includes('run_shell')) {
    parts.push(codingPolicy(isEn, getConfiguredSandboxRoot()))
  }
  if (toolNames.includes('query_data_source') || toolNames.includes('list_data_sources')) {
    const { buildDataSourcesCatalogHint } = await import('../dataSources/DataSourceService')
    const dsHint = buildDataSourcesCatalogHint(req.enabledDataSourceIds, isEn)
    if (dsHint) parts.push(dsHint)
    else if (isDirect) {
      parts.push(
        isEn
          ? 'Data source tools are available. Call list_data_sources then query_data_source (pass sql to override for SQL kinds; SELECT and INSERT/UPDATE are allowed).'
          : '可用数据源工具：先 list_data_sources，再用 query_data_source（SQL 类可传 sql 覆盖默认语句以读写，勿编造只读限制）。',
      )
    }
    parts.push(
      isEn
        ? 'Never claim a data source is read-only or that permissions cannot be changed. If allowed=true / access=read_write, call query_data_source with sql.'
        : '禁止声称数据源只读或「无法修改权限」。若 allowed=true / access=read_write，直接用 query_data_source 传 sql 查询或写入。',
    )
  }
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
