import type { LlmToolSpec } from '@shared'

const weatherTool: LlmToolSpec = {
  type: 'function',
  function: {
    name: 'get_weather',
    description:
      'Get current weather and a short forecast for a city using Open-Meteo (no API key). Use for questions about temperature, rain, or conditions.',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name, e.g. 北京 / Beijing / Shanghai' },
      },
      required: ['city'],
    },
  },
}

const fortuneTool: LlmToolSpec = {
  type: 'function',
  function: {
    name: 'get_daily_fortune',
    description:
      'Compute today’s local fortune/hexagram for the saved birth profile. Call when the user asks about 运势、卦象、今日宜忌.',
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Optional YYYY-MM-DD; defaults to today (local).',
        },
      },
    },
  },
}

const quoteTool: LlmToolSpec = {
  type: 'function',
  function: {
    name: 'get_stock_quote',
    description:
      'Fetch a stock quote snapshot (last close and range returns) for a CN or US symbol.',
    parameters: {
      type: 'object',
      properties: {
        market: { type: 'string', enum: ['CN', 'US'], description: 'Market' },
        symbol: { type: 'string', description: 'Ticker, e.g. 600519 or AAPL' },
      },
      required: ['market', 'symbol'],
    },
  },
}

const reportTool: LlmToolSpec = {
  type: 'function',
  function: {
    name: 'get_latest_stocks_report',
    description:
      'Load the latest local stocks recommendation report (watchlist/scanner). Prefer this before inventing picks.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
}

const knowledgeTool: LlmToolSpec = {
  type: 'function',
  function: {
    name: 'search_knowledge',
    description:
      'Search the local knowledge base (FTS / vector / hybrid) and return relevant chunks with document titles. Use when the user asks about uploaded docs or @知识库 / @knowledge.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max chunks (default 5)' },
        collectionId: { type: 'string', description: 'Optional collection id to scope search' },
      },
      required: ['query'],
    },
  },
}

export function builtinToolsForAgent(
  agentId: string,
  opts?: { useKnowledge?: boolean },
): LlmToolSpec[] {
  const id = (agentId || 'direct').trim()
  const tools: LlmToolSpec[] = [weatherTool]

  if (id === 'fortune') tools.push(fortuneTool)
  if (id === 'stocks') tools.push(quoteTool, reportTool)
  if (id === 'direct' || id === 'none' || id === '' || opts?.useKnowledge) {
    tools.push(knowledgeTool)
  }
  // Custom agents also get weather + knowledge
  if (id.startsWith('custom_')) tools.push(knowledgeTool)

  // Deduplicate by name
  const seen = new Set<string>()
  return tools.filter((t) => {
    if (seen.has(t.function.name)) return false
    seen.add(t.function.name)
    return true
  })
}

export function toolStatusLabel(name: string, locale: string): string {
  const en = locale.toLowerCase().startsWith('en')
  switch (name) {
    case 'get_weather':
      return en ? 'Checking weather…' : '正在查询天气…'
    case 'get_daily_fortune':
      return en ? 'Computing today’s fortune…' : '正在计算今日运势…'
    case 'get_stock_quote':
      return en ? 'Fetching stock quote…' : '正在获取行情…'
    case 'get_latest_stocks_report':
      return en ? 'Loading stocks report…' : '正在读取荐股报告…'
    case 'search_knowledge':
      return en ? 'Searching knowledge base…' : '正在检索知识库…'
    default:
      if (name.startsWith('mcp__')) {
        const short = name.replace(/^mcp__/, '').replace(/__/g, ' / ')
        return en ? `MCP: ${short}…` : `MCP：${short}…`
      }
      return en ? `Running ${name}…` : `正在调用 ${name}…`
  }
}

export function toolDisplayName(name: string, locale: string): string {
  const en = locale.toLowerCase().startsWith('en')
  switch (name) {
    case 'get_weather':
      return en ? 'Weather' : '天气'
    case 'get_daily_fortune':
      return en ? 'Daily fortune' : '今日运势'
    case 'get_stock_quote':
      return en ? 'Stock quote' : '股票行情'
    case 'get_latest_stocks_report':
      return en ? 'Stocks report' : '荐股报告'
    case 'search_knowledge':
      return en ? 'Knowledge search' : '知识库检索'
    default:
      if (name.startsWith('mcp__')) {
        return name.replace(/^mcp__/, '').replace(/__/g, ' · ')
      }
      return name
  }
}

export function previewJson(raw: string, max = 180): string {
  const text = raw.trim()
  if (!text) return ''
  try {
    const compact = JSON.stringify(JSON.parse(text))
    return compact.length > max ? `${compact.slice(0, max)}…` : compact
  } catch {
    return text.length > max ? `${text.slice(0, max)}…` : text
  }
}
