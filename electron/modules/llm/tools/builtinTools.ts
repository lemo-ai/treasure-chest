import type { LlmToolSpec } from '@shared'
import { isDirectChatAgentId } from '@shared'

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
      'Fetch last close, range returns, and recent daily bars for a CN or US symbol. A-share examples: 688836.SH / 688836. Yahoo may fail; CN quotes fall back to Eastmoney. Call after search_stock if the ticker was unknown.',
    parameters: {
      type: 'object',
      properties: {
        market: { type: 'string', enum: ['CN', 'US'], description: 'Market' },
        symbol: { type: 'string', description: 'Ticker, e.g. 688836.SH / 600519 / AAPL' },
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
      'Load the latest local stocks recommendation report (watchlist/scanner). If none exists, generates one first. Prefer this before inventing picks.',
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

const listDataSourcesTool: LlmToolSpec = {
  type: 'function',
  function: {
    name: 'list_data_sources',
    description:
      'List Settings → Data sources available to this agent (id / name / kind / allowed). Call before query_data_source.',
    parameters: { type: 'object', properties: {} },
  },
}

const queryDataSourceTool: LlmToolSpec = {
  type: 'function',
  function: {
    name: 'query_data_source',
    description:
      'Read or write via a bound data source. For SQL kinds (sqlite/postgres/…), pass sql to override the saved default (SELECT to analyze; INSERT/UPDATE/CREATE to persist). For HTTP/file kinds, returns the resolved payload. Only ids allowed for this agent.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Data source id from list_data_sources' },
        sql: {
          type: 'string',
          description: 'Optional SQL override for SQL/DB kinds (read or write)',
        },
        query: {
          type: 'string',
          description: 'Optional query override for vector/search-style kinds',
        },
      },
      required: ['id'],
    },
  },
}

const webSearchTool: LlmToolSpec = {
  type: 'function',
  function: {
    name: 'search_web',
    description:
      'Live web search. Prefers China-reachable sources (Baidu / Sogou / 360 / Toutiao / cn.bing), with Bing/Google/DuckDuckGo as fallback, plus Wikipedia. MUST call for current events, IPO/listing status, prices, company news, or anything after your training cutoff. You may call it in parallel with search_stock. Do not answer listing/price questions from memory.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query, e.g. 宇树科技 股票代码' },
      },
      required: ['query'],
    },
  },
}

const stockSearchTool: LlmToolSpec = {
  type: 'function',
  function: {
    name: 'search_stock',
    description:
      'Resolve a company name to listed tickers (Eastmoney + Sina + Yahoo). MUST call when the user names a company without a ticker (e.g. 宇树科技). Then call get_stock_quote. Empty quotes means lookup failed, NOT that the company is private.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Company name or ticker, e.g. 宇树科技 / Unitree / AAPL' },
      },
      required: ['query'],
    },
  },
}

const fetchUrlTool: LlmToolSpec = {
  type: 'function',
  function: {
    name: 'fetch_url',
    description:
      'Open a public HTTP(S) page and return extracted text. Use after search_web when a headline is relevant and you need the article body (like ChatGPT browsing). For tables / structured scrape prefer crawl_url.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full http(s) URL from search results' },
      },
      required: ['url'],
    },
  },
}

const crawlUrlTool: LlmToolSpec = {
  type: 'function',
  function: {
    name: 'crawl_url',
    description:
      'Universal page crawler: fetch a public HTTP(S) URL (handles gb18030 etc.) and extract text, HTML tables, and links. Use for odds boards, result tables, docs, or any page where you need structured data beyond plain article text.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full http(s) URL to crawl' },
        mode: {
          type: 'string',
          enum: ['auto', 'text', 'tables', 'links'],
          description: 'auto=text+tables+links (default); tables for odds/result grids',
        },
        maxChars: {
          type: 'number',
          description: 'Max text characters (default 24000)',
        },
      },
      required: ['url'],
    },
  },
}

const generateImageTool: LlmToolSpec = {
  type: 'function',
  function: {
    name: 'generate_image',
    description:
      'Generate an image from a text prompt using the user’s configured image model (e.g. Wan / Seedream / DALL·E). Call when the user asks to draw, paint, or create a picture/illustration/poster. Do NOT claim you created an image without calling this tool.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed visual description of the image to generate',
        },
        size: {
          type: 'string',
          description: 'Optional size, e.g. 1024x1024 or 1280x720',
        },
        style: { type: 'string', description: 'Optional style hint' },
      },
      required: ['prompt'],
    },
  },
}

const generateVideoTool: LlmToolSpec = {
  type: 'function',
  function: {
    name: 'generate_video',
    description:
      'Generate a short video from a text prompt using the user’s configured video model (e.g. Wan t2v). Call when the user asks to make/create a video or clip. Do NOT invent a video URL without calling this tool.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed description of the video scene and motion',
        },
        durationSec: {
          type: 'number',
          description: 'Optional duration in seconds (provider-dependent, often 2–15)',
        },
        aspectRatio: {
          type: 'string',
          description: 'Optional aspect ratio, e.g. 16:9 / 9:16 / 1:1',
        },
      },
      required: ['prompt'],
    },
  },
}

const generateMusicTool: LlmToolSpec = {
  type: 'function',
  function: {
    name: 'generate_music',
    description:
      'Generate music or song audio using the user’s configured music/audio model (e.g. Fun-Music). Call when the user asks to compose music, a song, BGM, or soundtrack. Do NOT invent an audio URL without calling this tool.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Mood, genre, instruments, and scene for the music',
        },
        style: { type: 'string', description: 'Optional genre/style, e.g. pop / lo-fi' },
        instrumental: {
          type: 'boolean',
          description: 'If true, generate instrumental only (no vocals)',
        },
        durationSec: {
          type: 'number',
          description: 'Optional target duration in seconds when supported',
        },
      },
      required: ['prompt'],
    },
  },
}

const MEDIA_TOOLS: LlmToolSpec[] = [generateImageTool, generateVideoTool, generateMusicTool]

export function builtinToolsForAgent(
  agentId: string,
  opts?: {
    useKnowledge?: boolean
    useWebSearch?: boolean
    /** Expose list_data_sources / query_data_source (agent-bound Settings data sources). */
    enableDataSourceTools?: boolean
  },
): LlmToolSpec[] {
  const id = (agentId || 'direct').trim()
  const web = [
    webSearchTool,
    stockSearchTool,
    quoteTool,
    fetchUrlTool,
    crawlUrlTool,
  ]
  const useWeb = opts?.useWebSearch !== false
  const dsTools = [listDataSourcesTool, queryDataSourceTool]
  const dsOn = opts?.enableDataSourceTools === true

  if (isDirectChatAgentId(id)) {
    const tools: LlmToolSpec[] = useWeb ? [...web] : []
    if (opts?.useKnowledge) tools.push(knowledgeTool)
    if (dsOn) tools.push(...dsTools)
    tools.push(...MEDIA_TOOLS)
    return tools
  }

  const tools: LlmToolSpec[] = []
  if (id === 'fortune') {
    tools.push(fortuneTool, weatherTool)
  } else if (id === 'stocks') {
    tools.push(...web, reportTool)
  } else {
    if (dsOn) tools.push(...dsTools)
    tools.push(weatherTool)
    if (useWeb) tools.push(...web)
    if (opts?.useKnowledge || id.startsWith('custom_') || id === 'lottery') {
      tools.push(knowledgeTool)
    }
  }
  tools.push(...MEDIA_TOOLS)

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
    case 'list_data_sources':
      return en ? 'Listing data sources…' : '正在列出数据源…'
    case 'query_data_source':
      return en ? 'Querying data source…' : '正在查询数据源…'
    case 'search_knowledge':
      return en ? 'Searching knowledge base…' : '正在检索知识库…'
    case 'search_web':
      return en ? 'Searching the web…' : '正在搜索网络…'
    case 'search_stock':
      return en ? 'Looking up ticker…' : '正在查找股票代码…'
    case 'fetch_url':
      return en ? 'Opening page…' : '正在打开网页…'
    case 'crawl_url':
      return en ? 'Crawling page…' : '正在爬取网页…'
    case 'generate_image':
      return en ? 'Generating image…' : '正在生成图片…'
    case 'generate_video':
      return en ? 'Generating video…' : '正在生成视频…'
    case 'generate_music':
      return en ? 'Generating music…' : '正在生成音乐…'
    case 'read_file':
      return en ? 'Reading file…' : '正在读取文件…'
    case 'list_dir':
      return en ? 'Listing directory…' : '正在列出目录…'
    case 'search_files':
      return en ? 'Searching files…' : '正在搜索文件…'
    case 'grep_content':
      return en ? 'Searching file contents…' : '正在搜索文件内容…'
    case 'apply_patch':
      return en ? 'Applying patch…' : '正在应用补丁…'
    case 'git_status':
      return en ? 'Git status…' : '正在读取 Git 状态…'
    case 'git_diff':
      return en ? 'Git diff…' : '正在读取 Git diff…'
    case 'git_commit':
      return en ? 'Git commit…' : '正在 Git 提交…'
    case 'write_file':
      return en ? 'Writing file…' : '正在写入文件…'
    case 'str_replace_file':
      return en ? 'Editing file…' : '正在编辑文件…'
    case 'run_shell':
      return en ? 'Running shell…' : '正在执行命令…'
    case 'run_shell_background':
      return en ? 'Starting background shell…' : '正在启动后台命令…'
    case 'get_job_status':
      return en ? 'Checking job…' : '正在查询任务…'
    case 'kill_job':
      return en ? 'Stopping job…' : '正在停止任务…'
    case 'list_jobs':
      return en ? 'Listing jobs…' : '正在列出任务…'
    case 'get_diagnostics':
      return en ? 'Running diagnostics…' : '正在运行诊断…'
    case 'set_goal':
      return en ? 'Setting goal…' : '正在设定目标…'
    case 'update_goal':
      return en ? 'Updating goal…' : '正在更新目标…'
    case 'list_goals':
      return en ? 'Listing goals…' : '正在读取目标…'
    case 'spawn_subagent':
      return en ? 'Spawning subagent…' : '正在启动子智能体…'
    default:
      if (name.startsWith('plugin__')) {
        const short = name.replace(/^plugin__/, '').replace(/__/g, ' / ')
        return en ? `Plugin: ${short}…` : `插件：${short}…`
      }
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
    case 'list_data_sources':
      return en ? 'Data sources' : '数据源列表'
    case 'query_data_source':
      return en ? 'Query data source' : '查询数据源'
    case 'search_knowledge':
      return en ? 'Knowledge search' : '知识库检索'
    case 'search_web':
      return en ? 'Web search' : '网络搜索'
    case 'search_stock':
      return en ? 'Ticker lookup' : '股票代码查找'
    case 'fetch_url':
      return en ? 'Open page' : '打开网页'
    case 'crawl_url':
      return en ? 'Web crawl' : '网页爬取'
    case 'generate_image':
      return en ? 'Image generation' : '图片生成'
    case 'generate_video':
      return en ? 'Video generation' : '视频生成'
    case 'generate_music':
      return en ? 'Music generation' : '音乐生成'
    case 'read_file':
      return en ? 'Read file' : '读文件'
    case 'list_dir':
      return en ? 'List directory' : '列目录'
    case 'search_files':
      return en ? 'Search files' : '搜文件'
    case 'grep_content':
      return en ? 'Grep' : '内容搜索'
    case 'apply_patch':
      return en ? 'Apply patch' : '应用补丁'
    case 'git_status':
      return en ? 'Git status' : 'Git 状态'
    case 'git_diff':
      return en ? 'Git diff' : 'Git diff'
    case 'git_commit':
      return en ? 'Git commit' : 'Git 提交'
    case 'write_file':
      return en ? 'Write file' : '写文件'
    case 'str_replace_file':
      return en ? 'Edit file' : '编辑文件'
    case 'run_shell':
      return en ? 'Shell' : '终端命令'
    case 'run_shell_background':
      return en ? 'Background shell' : '后台命令'
    case 'get_job_status':
      return en ? 'Job status' : '任务状态'
    case 'kill_job':
      return en ? 'Kill job' : '停止任务'
    case 'list_jobs':
      return en ? 'List jobs' : '任务列表'
    case 'get_diagnostics':
      return en ? 'Diagnostics' : '代码诊断'
    case 'set_goal':
      return en ? 'Set goal' : '设定目标'
    case 'update_goal':
      return en ? 'Update goal' : '更新目标'
    case 'list_goals':
      return en ? 'List goals' : '目标列表'
    case 'spawn_subagent':
      return en ? 'Subagent' : '子智能体'
    default:
      if (name.startsWith('plugin__')) {
        return name.replace(/^plugin__/, '').replace(/__/g, ' · ')
      }
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
