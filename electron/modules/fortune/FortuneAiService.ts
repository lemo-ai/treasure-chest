import type {
  DailyFortune,
  FortuneAiConnectionTestInput,
  FortuneAiConnectionTestResponse,
  FortuneAiProviderConfig,
  FortuneAiResponse,
  FortuneSettings,
} from '@shared'
import { logger } from '../../utils/logger'

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

function shortText(value: unknown, limit = 240): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  if (!raw) return ''
  return raw.length > limit ? `${raw.slice(0, limit)}…` : raw
}

function buildPrompt(fortune: DailyFortune, locale: string): string {
  const aspectRows = [
    ['career', fortune.aspects.career.score, fortune.aspects.career.level, fortune.aspects.career.blurb],
    ['wealth', fortune.aspects.wealth.score, fortune.aspects.wealth.level, fortune.aspects.wealth.blurb],
    ['relationship', fortune.aspects.relationship.score, fortune.aspects.relationship.level, fortune.aspects.relationship.blurb],
    ['health', fortune.aspects.health.score, fortune.aspects.health.level, fortune.aspects.health.blurb],
    ['mood', fortune.aspects.mood.score, fortune.aspects.mood.level, fortune.aspects.mood.blurb],
  ]
    .map(([k, score, level, blurb]) => `- ${k}: ${score} (${level}) => ${blurb}`)
    .join('\n')

  const isEn = locale.startsWith('en')
  if (isEn) {
    return [
      'You are a traditional Chinese metaphysics copywriter.',
      'Rewrite and enrich this daily fortune in a practical, concise style.',
      'Keep all facts unchanged: scores, levels, hexagram id/name, day master, lucky hints.',
      'Do not claim certainty. Avoid medical/financial guarantees.',
      'Return plain text with 4 sections and short bullets:',
      '1) Overall trend',
      '2) Key opportunities',
      '3) Risk reminders',
      '4) Action checklist for today',
      '',
      `Date: ${fortune.date}`,
      `Hexagram: #${fortune.hexagram.id} ${fortune.hexagram.nameEn} / ${fortune.hexagram.nameFull}`,
      `Day master: ${fortune.bazi.dayMaster} (${fortune.bazi.element})`,
      `Overall: ${fortune.overall.score} (${fortune.overall.level})`,
      `Summary: ${fortune.hexagram.summary}`,
      `Advice: ${fortune.hexagram.advice}`,
      'Aspects:',
      aspectRows,
      `Lucky colors: ${fortune.lucky.colors.join(', ')}`,
      `Lucky directions: ${fortune.lucky.directions.join(', ')}`,
      `Lucky numbers: ${fortune.lucky.numbers.join(' / ')}`,
    ].join('\n')
  }

  return [
    '你是传统命理产品文案师，请基于输入数据生成“AI分析结果”。',
    '要求：',
    '1) 必须保留事实不变：分数、等级、卦象ID/卦名、日主、幸运提示；',
    '2) 用传统命理语气，但给出可执行建议；',
    '3) 不要绝对化承诺，不要医疗/投资保证；',
    '4) 纯文本，按四段输出：',
    '   - 总体运势',
    '   - 可借之势',
    '   - 宜避之处',
    '   - 今日行事清单',
    '',
    `日期：${fortune.date}`,
    `卦象：#${fortune.hexagram.id} ${fortune.hexagram.nameFull} / ${fortune.hexagram.nameEn}`,
    `日主：${fortune.bazi.dayMaster}（${fortune.bazi.element}）`,
    `综合：${fortune.overall.score}（${fortune.overall.level}）`,
    `摘要：${fortune.hexagram.summary}`,
    `建议：${fortune.hexagram.advice}`,
    '分项：',
    aspectRows,
    `幸运色：${fortune.lucky.colors.join('、')}`,
    `方位：${fortune.lucky.directions.join('、')}`,
    `数字：${fortune.lucky.numbers.join(' / ')}`,
  ].join('\n')
}

interface ChatCompletionChoice {
  message?: {
    content?: string
  }
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[]
  error?: {
    message?: string
  }
}

interface AnthropicResponse {
  content?: Array<{
    type?: string
    text?: string
  }>
  error?: {
    message?: string
  }
}

function providerToSettings(provider: FortuneAiProviderConfig, model: string): FortuneSettings {
  const safeModel = model.trim() || provider.models[0] || 'gpt-4o-mini'
  return {
    hexagramSchool: 'daymaster',
    aiPolish: true,
    aiBaseUrl: provider.baseUrl,
    aiProviderName: provider.name,
    aiApiFormat: provider.apiFormat,
    aiModels: provider.models.length > 0 ? provider.models : [safeModel],
    aiModel: safeModel,
    aiApiKey: provider.apiKey,
    aiProviders: [provider],
    aiActiveProviderId: provider.id,
  }
}

export async function generateFortuneAiAnalysis(
  fortune: DailyFortune,
  locale: string,
  settings: FortuneSettings,
): Promise<FortuneAiResponse> {
  if (!settings.aiApiKey.trim()) {
    return { ok: false, error: 'AI API key is empty.' }
  }
  const baseUrl = trimTrailingSlash(settings.aiBaseUrl.trim() || 'https://api.openai.com/v1')
  const model = settings.aiModel.trim() || 'gpt-4o-mini'
  const prompt = buildPrompt(fortune, locale)
  const format = settings.aiApiFormat === 'anthropic' ? 'anthropic' : 'openai'
  const requestTag = `fortune-ai-${Date.now().toString(36)}`
  logger.info(
    `[${requestTag}] start provider=${settings.aiProviderName} format=${format} model=${model} base=${baseUrl}`,
  )

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    try {
      if (format === 'anthropic') {
        const response = await fetch(`${baseUrl}/messages`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': settings.aiApiKey.trim(),
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 900,
            temperature: 0.7,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          }),
        })
        const data = (await safeJson(response)) as AnthropicResponse
        if (!response.ok) {
          const err = data.error?.message ?? `HTTP ${response.status}`
          logger.warn(
            `[${requestTag}] failed status=${response.status} body=${shortText(data)} err=${err}`,
          )
          return { ok: false, error: err }
        }
        const text = (data.content ?? [])
          .filter((part) => part.type === 'text' && typeof part.text === 'string')
          .map((part) => part.text?.trim() ?? '')
          .join('\n')
          .trim()
        if (!text) {
          logger.warn(`[${requestTag}] empty text response body=${shortText(data)}`)
          return { ok: false, error: 'Empty AI response.' }
        }
        logger.info(`[${requestTag}] success format=anthropic text_len=${text.length}`)
        return { ok: true, text }
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.aiApiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      })

      const data = (await safeJson(response)) as ChatCompletionResponse
      if (!response.ok) {
        const err = data.error?.message ?? `HTTP ${response.status}`
        logger.warn(
          `[${requestTag}] failed status=${response.status} body=${shortText(data)} err=${err}`,
        )
        return { ok: false, error: err }
      }

      const text = data.choices?.[0]?.message?.content?.trim() ?? ''
      if (!text) {
        logger.warn(`[${requestTag}] empty text response body=${shortText(data)}`)
        return { ok: false, error: 'Empty AI response.' }
      }
      logger.info(`[${requestTag}] success format=openai text_len=${text.length}`)
      return { ok: true, text }
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`[${requestTag}] request error: ${msg}`)
    return { ok: false, error: msg }
  }
}

export async function testAiProviderConnection(
  input: FortuneAiConnectionTestInput,
): Promise<FortuneAiConnectionTestResponse> {
  const fakeFortune: DailyFortune = {
    date: '2026-01-01',
    profileId: 'connection-test',
    bazi: {
      year: '甲子',
      month: '乙丑',
      day: '丙寅',
      hour: null,
      dayMaster: '丙',
      hourKnown: false,
      animal: '鼠',
      yinYang: 'yang',
      element: '火',
    },
    hexagram: {
      id: 1,
      name: '乾',
      nameFull: '乾为天',
      nameEn: 'The Creative',
      tendency: 'favorable',
      summary: '测试连接摘要',
      advice: '测试连接建议',
    },
    overall: {
      score: 80,
      level: 'good',
      blurb: '连接测试',
    },
    aspects: {
      career: { score: 80, level: 'good', blurb: 'test' },
      wealth: { score: 80, level: 'good', blurb: 'test' },
      relationship: { score: 80, level: 'good', blurb: 'test' },
      health: { score: 80, level: 'good', blurb: 'test' },
      mood: { score: 80, level: 'good', blurb: 'test' },
    },
    lucky: { colors: ['青绿'], directions: ['东'], numbers: [3, 8] },
    disclaimer: 'test',
    source: { engine: 'test', aiPolished: true },
  }

  const startedAt = Date.now()
  const result = await generateFortuneAiAnalysis(
    fakeFortune,
    'zh-CN',
    providerToSettings(input.provider, input.model),
  )
  if (!result.ok) {
    return {
      ok: false,
      message: result.error ?? 'Connection failed.',
    }
  }
  return {
    ok: true,
    message: `连接成功（${Date.now() - startedAt}ms）`,
  }
}
