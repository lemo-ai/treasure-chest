import type { FortuneSettings, LlmChatMessage, LlmChatResponse } from '@shared'
import { logger } from '../../utils/logger'

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

export function isLocalLlmEndpoint(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase()
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local')
    )
  } catch {
    const raw = baseUrl.toLowerCase()
    return (
      raw.includes('localhost') ||
      raw.includes('127.0.0.1') ||
      raw.includes('0.0.0.0') ||
      raw.includes('[::1]')
    )
  }
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

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>
  error?: { message?: string }
}

export interface LlmCallOptions {
  baseUrl: string
  apiKey: string
  apiFormat: 'openai' | 'anthropic'
  model: string
  providerName?: string
  messages: LlmChatMessage[]
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  tag?: string
}

/**
 * OpenAI-compatible (+ Anthropic) chat call.
 * Local endpoints (Ollama / LM Studio / vLLM …) may omit API key.
 */
export async function callLlmChat(options: LlmCallOptions): Promise<LlmChatResponse> {
  const baseUrl = trimTrailingSlash(options.baseUrl.trim() || 'https://api.openai.com/v1')
  const model = options.model.trim()
  const apiKey = options.apiKey.trim()
  const local = isLocalLlmEndpoint(baseUrl)
  const format = options.apiFormat === 'anthropic' ? 'anthropic' : 'openai'
  const tag = options.tag ?? `llm-${Date.now().toString(36)}`
  const providerName = options.providerName?.trim() || (local ? 'Local' : 'AI')

  if (!model) {
    return { ok: false, error: 'Model id is empty.', providerName }
  }
  if (!apiKey && !local) {
    return { ok: false, error: 'API key is empty.', providerName }
  }
  if (options.messages.length === 0) {
    return { ok: false, error: 'Messages are empty.', providerName }
  }

  logger.info(
    `[${tag}] start provider=${providerName} format=${format} model=${model} base=${baseUrl} local=${local}`,
  )

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000)

  try {
    if (format === 'anthropic') {
      const system = options.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n')
        .trim()
      const turns = options.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }))

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      }
      if (apiKey) headers['x-api-key'] = apiKey

      const response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens ?? 2048,
          temperature: options.temperature ?? 0.7,
          ...(system ? { system } : {}),
          messages: turns,
        }),
      })
      const data = (await safeJson(response)) as AnthropicResponse
      if (!response.ok) {
        const err = data.error?.message ?? `HTTP ${response.status}`
        logger.warn(`[${tag}] failed status=${response.status} body=${shortText(data)} err=${err}`)
        return { ok: false, error: err, providerName, model }
      }
      const text = (data.content ?? [])
        .filter((part) => part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text?.trim() ?? '')
        .join('\n')
        .trim()
      if (!text) {
        logger.warn(`[${tag}] empty anthropic response body=${shortText(data)}`)
        return { ok: false, error: 'Empty AI response.', providerName, model }
      }
      logger.info(`[${tag}] success format=anthropic text_len=${text.length}`)
      return { ok: true, text, providerName, model }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    })
    const data = (await safeJson(response)) as ChatCompletionResponse
    if (!response.ok) {
      const err = data.error?.message ?? `HTTP ${response.status}`
      logger.warn(`[${tag}] failed status=${response.status} body=${shortText(data)} err=${err}`)
      return { ok: false, error: err, providerName, model }
    }
    const text = data.choices?.[0]?.message?.content?.trim() ?? ''
    if (!text) {
      logger.warn(`[${tag}] empty openai response body=${shortText(data)}`)
      return { ok: false, error: 'Empty AI response.', providerName, model }
    }
    logger.info(`[${tag}] success format=openai text_len=${text.length}`)
    return { ok: true, text, providerName, model }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`[${tag}] request error: ${msg}`)
    return { ok: false, error: msg, providerName, model }
  } finally {
    clearTimeout(timer)
  }
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
