import type { FortuneSettings } from '@shared'
import { settingsToLlmEndpoint } from './LlmClient'
import { logger } from '../../utils/logger'

export interface ImageGenResult {
  ok: boolean
  /** data URL or remote URL */
  url?: string
  error?: string
  revisedPrompt?: string
}

/**
 * OpenAI-compatible image generation (/v1/images/generations).
 * Works with OpenAI and many compatible gateways that expose the same path.
 */
export async function generateImage(
  prompt: string,
  settings: FortuneSettings,
  opts?: { size?: string; model?: string },
): Promise<ImageGenResult> {
  const text = prompt.trim()
  if (!text) return { ok: false, error: 'empty prompt' }

  const endpoint = settingsToLlmEndpoint(settings)
  if (endpoint.apiFormat === 'anthropic') {
    return { ok: false, error: 'Image generation requires an OpenAI-compatible endpoint.' }
  }

  const base = endpoint.baseUrl.replace(/\/$/, '')
  const url = `${base}/images/generations`
  const model = opts?.model?.trim() || 'dall-e-3'
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (endpoint.apiKey.trim()) headers.Authorization = `Bearer ${endpoint.apiKey.trim()}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        prompt: text.slice(0, 4000),
        n: 1,
        size: opts?.size || '1024x1024',
        response_format: 'b64_json',
      }),
      signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.warn(`image gen HTTP ${res.status}: ${body.slice(0, 200)}`)
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 180)}` }
    }
    const data = (await res.json()) as {
      data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>
    }
    const item = data.data?.[0]
    if (item?.b64_json) {
      return {
        ok: true,
        url: `data:image/png;base64,${item.b64_json}`,
        revisedPrompt: item.revised_prompt,
      }
    }
    if (item?.url) {
      return { ok: true, url: item.url, revisedPrompt: item.revised_prompt }
    }
    return { ok: false, error: 'No image in response' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn('image gen failed', err)
    return { ok: false, error: msg }
  }
}
