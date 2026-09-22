import type {
  DailyFortune,
  FortuneAiConnectionTestInput,
  FortuneAiConnectionTestResponse,
  FortuneAiProviderConfig,
  FortuneAiResponse,
  FortuneSettings,
} from '@shared'
import {
  aiModelIds,
  firstChatModelId,
  firstModelId,
  isChatAiModel,
  parseAiModelList,
} from '@shared'
import { callLlmChat, isLocalLlmEndpoint } from '../llm/LlmClient'

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

function providerToSettings(provider: FortuneAiProviderConfig, model: string): FortuneSettings {
  const ids = aiModelIds(provider.models)
  const safeModel = model.trim() || firstModelId(provider.models)
  return {
    hexagramSchool: 'daymaster',
    aiPolish: true,
    aiBaseUrl: provider.baseUrl,
    aiProviderName: provider.name,
    aiApiFormat: provider.apiFormat,
    aiModels: ids.length > 0 ? ids : safeModel ? [safeModel] : [],
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
  const baseUrl = settings.aiBaseUrl.trim() || 'https://api.openai.com/v1'
  const local = isLocalLlmEndpoint(baseUrl)
  if (!settings.aiApiKey.trim() && !local) {
    return { ok: false, error: 'AI API key is empty.' }
  }
  const model = settings.aiModel.trim()
  if (!model) {
    return { ok: false, error: 'Model id is empty.' }
  }

  const result = await callLlmChat({
    baseUrl,
    apiKey: settings.aiApiKey,
    apiFormat: settings.aiApiFormat === 'anthropic' ? 'anthropic' : 'openai',
    model,
    providerName: settings.aiProviderName,
    messages: [{ role: 'user', content: buildPrompt(fortune, locale) }],
    temperature: 0.7,
    maxTokens: 900,
    timeoutMs: 45_000,
    tag: `fortune-ai-${Date.now().toString(36)}`,
  })

  if (!result.ok) return { ok: false, error: result.error ?? 'AI request failed.' }
  return { ok: true, text: result.text ?? '' }
}

export async function testAiProviderConnection(
  input: FortuneAiConnectionTestInput,
): Promise<FortuneAiConnectionTestResponse> {
  const models = parseAiModelList(input.provider.models)
  const requested = String(input.model || '').trim()
  const requestedCfg = models.find((m) => m.id === requested)
  const model =
    (requestedCfg && isChatAiModel(requestedCfg) ? requested : '') ||
    firstChatModelId(models) ||
    requested
  if (!model) {
    return {
      ok: false,
      message:
        'No chat model configured. Add a text chat model (e.g. qwen-plus). Image-only models like wanx are not supported on OpenAI-compatible chat endpoints.',
    }
  }
  const settings = providerToSettings(input.provider, model)
  const baseUrl = settings.aiBaseUrl.trim() || 'https://api.openai.com/v1'
  const local = isLocalLlmEndpoint(baseUrl)
  if (!settings.aiApiKey.trim() && !local) {
    return { ok: false, message: 'API key is empty.' }
  }
  if (!settings.aiModel.trim()) {
    return { ok: false, message: 'Model id is empty.' }
  }

  const startedAt = Date.now()
  const ping = local
    ? 'Reply with exactly: pong'
    : 'Reply with a short OK.'
  const result = await callLlmChat({
    baseUrl,
    apiKey: settings.aiApiKey,
    apiFormat: settings.aiApiFormat === 'anthropic' ? 'anthropic' : 'openai',
    model: settings.aiModel,
    providerName: settings.aiProviderName,
    messages: [
      { role: 'system', content: 'You are a connection test probe. Reply briefly.' },
      { role: 'user', content: ping },
    ],
    temperature: 0,
    maxTokens: 32,
    timeoutMs: 30_000,
    tag: `ai-test-${Date.now().toString(36)}`,
  })

  if (!result.ok) {
    return { ok: false, message: result.error ?? 'Connection failed.' }
  }
  const latency = Math.max(1, Date.now() - startedAt)
  const localTag = local ? ' · local' : ''
  return {
    ok: true,
    message:
      requested && requested !== model
        ? `OK via ${model} (${latency}ms; skipped media model ${requested})${localTag}`
        : `OK (${latency}ms)${localTag}`,
  }
}
