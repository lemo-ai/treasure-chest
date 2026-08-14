import type {
  FortuneSettings,
  LlmChatMessage,
  LlmChatResponse,
  LlmToolCall,
  LlmToolSpec,
} from '@shared'
import {
  normalizeAnthropicMessages,
  parseAnthropicResponse,
  toAnthropicMessages,
  toAnthropicTools,
} from './AnthropicAdapter'
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
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: LlmToolCall[]
    }
    finish_reason?: string
  }>
  error?: { message?: string }
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>
  stop_reason?: string
  error?: { message?: string }
}

export interface LlmCallOptions {
  baseUrl: string
  apiKey: string
  apiFormat: 'openai' | 'anthropic'
  model: string
  providerName?: string
  messages: LlmChatMessage[]
  tools?: LlmToolSpec[]
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  tag?: string
  signal?: AbortSignal
}

type StreamDeltaHandler = (delta: string) => void

async function readSseLines(
  body: ReadableStream<Uint8Array>,
  onLine: (line: string) => void | 'stop',
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => undefined)
        throw new DOMException('Aborted', 'AbortError')
      }
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl = buffer.indexOf('\n')
      while (nl >= 0) {
        const rawLine = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        const line = rawLine.replace(/\r$/, '')
        if (onLine(line) === 'stop') {
          await reader.cancel().catch(() => undefined)
          return
        }
        nl = buffer.indexOf('\n')
      }
    }
    if (buffer.trim()) onLine(buffer.replace(/\r$/, ''))
  } finally {
    reader.releaseLock()
  }
}

function parseOpenAiDelta(data: string): string | null | 'done' {
  const trimmed = data.trim()
  if (!trimmed) return null
  if (trimmed === '[DONE]') return 'done'
  try {
    const json = JSON.parse(trimmed) as {
      choices?: Array<{ delta?: { content?: string | null } }>
      error?: { message?: string }
    }
    if (json.error?.message) throw new Error(json.error.message)
    const content = json.choices?.[0]?.delta?.content
    return typeof content === 'string' && content.length > 0 ? content : null
  } catch (err) {
    if (err instanceof SyntaxError) return null
    throw err
  }
}

function parseAnthropicSse(eventName: string, data: string): string | null | 'done' {
  const trimmed = data.trim()
  if (!trimmed) return null
  try {
    const json = JSON.parse(trimmed) as {
      type?: string
      delta?: { type?: string; text?: string }
      error?: { message?: string }
    }
    if (json.type === 'error' || json.error?.message) {
      throw new Error(json.error?.message || 'Anthropic stream error')
    }
    if (eventName === 'message_stop' || json.type === 'message_stop') return 'done'
    if (
      (eventName === 'content_block_delta' || json.type === 'content_block_delta') &&
      json.delta?.type === 'text_delta' &&
      typeof json.delta.text === 'string'
    ) {
      return json.delta.text
    }
    return null
  } catch (err) {
    if (err instanceof SyntaxError) return null
    throw err
  }
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
  const onAbort = (): void => controller.abort()
  options.signal?.addEventListener('abort', onAbort)

  try {
    if (format === 'anthropic') {
      const system = options.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n')
        .trim()
      const turns = normalizeAnthropicMessages(toAnthropicMessages(options.messages))

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      }
      if (apiKey) headers['x-api-key'] = apiKey

      const body: Record<string, unknown> = {
        model,
        max_tokens: options.maxTokens ?? 2048,
        temperature: options.temperature ?? 0.7,
        ...(system ? { system } : {}),
        messages: turns,
      }
      if (options.tools?.length) {
        body.tools = toAnthropicTools(options.tools)
      }

      const response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: JSON.stringify(body),
      })
      const data = (await safeJson(response)) as AnthropicResponse
      if (!response.ok) {
        const err = data.error?.message ?? `HTTP ${response.status}`
        logger.warn(`[${tag}] failed status=${response.status} body=${shortText(data)} err=${err}`)
        return { ok: false, error: err, providerName, model }
      }
      const parsed = parseAnthropicResponse(data.content ?? [])
      if (!parsed.text && !parsed.toolCalls.length) {
        logger.warn(`[${tag}] empty anthropic response body=${shortText(data)}`)
        return { ok: false, error: 'Empty AI response.', providerName, model }
      }
      logger.info(
        `[${tag}] success format=anthropic text_len=${parsed.text.length} tools=${parsed.toolCalls.length}`,
      )
      return {
        ok: true,
        text: parsed.text,
        toolCalls: parsed.toolCalls.length ? parsed.toolCalls : undefined,
        providerName,
        model,
      }
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
        messages: options.messages.map((m) => {
          const row: Record<string, unknown> = {
            role: m.role,
            content: m.content,
          }
          if (m.tool_calls?.length) row.tool_calls = m.tool_calls
          if (m.tool_call_id) row.tool_call_id = m.tool_call_id
          if (m.name) row.name = m.name
          return row
        }),
        ...(options.tools?.length
          ? { tools: options.tools, tool_choice: 'auto' }
          : {}),
      }),
    })
    const data = (await safeJson(response)) as ChatCompletionResponse
    if (!response.ok) {
      const err = data.error?.message ?? `HTTP ${response.status}`
      logger.warn(`[${tag}] failed status=${response.status} body=${shortText(data)} err=${err}`)
      return { ok: false, error: err, providerName, model }
    }
    const message = data.choices?.[0]?.message
    const toolCalls = message?.tool_calls?.filter((c) => c?.function?.name) ?? []
    if (toolCalls.length > 0) {
      logger.info(`[${tag}] tool_calls=${toolCalls.map((c) => c.function.name).join(',')}`)
      return {
        ok: true,
        text: message?.content?.trim() || undefined,
        toolCalls,
        providerName,
        model,
      }
    }
    const text = message?.content?.trim() ?? ''
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
    options.signal?.removeEventListener('abort', onAbort)
  }
}

/** Streaming chat; calls onDelta for each text piece, returns final aggregate. */
export async function callLlmChatStream(
  options: LlmCallOptions,
  onDelta: StreamDeltaHandler,
): Promise<LlmChatResponse> {
  const baseUrl = trimTrailingSlash(options.baseUrl.trim() || 'https://api.openai.com/v1')
  const model = options.model.trim()
  const apiKey = options.apiKey.trim()
  const local = isLocalLlmEndpoint(baseUrl)
  const format = options.apiFormat === 'anthropic' ? 'anthropic' : 'openai'
  const tag = options.tag ?? `llm-stream-${Date.now().toString(36)}`
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
    `[${tag}] stream-start provider=${providerName} format=${format} model=${model} base=${baseUrl} local=${local}`,
  )

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000)
  const onAbort = (): void => controller.abort()
  options.signal?.addEventListener('abort', onAbort)

  let assembled = ''

  try {
    if (format === 'anthropic') {
      const system = options.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n')
        .trim()
      const turns = normalizeAnthropicMessages(toAnthropicMessages(options.messages))

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
          stream: true,
          ...(system ? { system } : {}),
          messages: turns,
        }),
      })

      if (!response.ok) {
        const data = (await safeJson(response)) as AnthropicResponse
        const err = data.error?.message ?? `HTTP ${response.status}`
        logger.warn(`[${tag}] stream failed status=${response.status} err=${err}`)
        return { ok: false, error: err, providerName, model }
      }
      if (!response.body) {
        return { ok: false, error: 'Empty stream body.', providerName, model }
      }

      let eventName = ''
      await readSseLines(
        response.body,
        (line) => {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim()
            return
          }
          if (!line.startsWith('data:')) return
          const payload = line.slice(5).trimStart()
          const piece = parseAnthropicSse(eventName, payload)
          if (piece === 'done') return 'stop'
          if (typeof piece === 'string') {
            assembled += piece
            onDelta(piece)
          }
        },
        controller.signal,
      )
    } else {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: JSON.stringify({
          model,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 2048,
          stream: true,
          messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (!response.ok) {
        const data = (await safeJson(response)) as ChatCompletionResponse
        const err = data.error?.message ?? `HTTP ${response.status}`
        logger.warn(`[${tag}] stream failed status=${response.status} err=${err}`)
        return { ok: false, error: err, providerName, model }
      }
      if (!response.body) {
        return { ok: false, error: 'Empty stream body.', providerName, model }
      }

      // Some local servers ignore stream and return JSON — fallback once.
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json') && !contentType.includes('event-stream')) {
        const data = (await safeJson(response)) as ChatCompletionResponse
        const text = data.choices?.[0]?.message?.content?.trim() ?? ''
        if (!text) {
          return { ok: false, error: 'Empty AI response.', providerName, model }
        }
        assembled = text
        onDelta(text)
        logger.info(`[${tag}] stream-fallback-json text_len=${text.length}`)
        return { ok: true, text, providerName, model }
      }

      await readSseLines(
        response.body,
        (line) => {
          if (!line.startsWith('data:')) return
          const payload = line.slice(5).trimStart()
          const piece = parseOpenAiDelta(payload)
          if (piece === 'done') return 'stop'
          if (typeof piece === 'string') {
            assembled += piece
            onDelta(piece)
          }
        },
        controller.signal,
      )
    }

    const text = assembled.trim()
    if (!text) {
      logger.warn(`[${tag}] empty stream assembled`)
      return { ok: false, error: 'Empty AI response.', providerName, model }
    }
    logger.info(`[${tag}] stream-success text_len=${text.length}`)
    return { ok: true, text, providerName, model }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`[${tag}] stream error: ${msg}`)
    if (assembled.trim()) {
      return { ok: true, text: assembled.trim(), providerName, model }
    }
    return { ok: false, error: msg, providerName, model }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
  }
}

export function settingsToLlmEndpoint(settings: FortuneSettings): {
  baseUrl: string
  apiKey: string
  apiFormat: 'openai' | 'anthropic'
  model: string
  providerName: string
  mediaProfile: import('@shared').MediaProfileId
  imageModel?: string
  videoModel?: string
  musicModel?: string
} {
  const active =
    settings.aiProviders.find((p) => p.id === settings.aiActiveProviderId) ??
    settings.aiProviders[0]
  return {
    baseUrl: settings.aiBaseUrl,
    apiKey: settings.aiApiKey,
    apiFormat: settings.aiApiFormat === 'anthropic' ? 'anthropic' : 'openai',
    model: settings.aiModel,
    providerName: settings.aiProviderName,
    mediaProfile: active?.mediaProfile ?? 'auto',
    imageModel: active?.imageModel,
    videoModel: active?.videoModel,
    musicModel: active?.musicModel,
  }
}
