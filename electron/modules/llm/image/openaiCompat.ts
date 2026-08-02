import { authHeaders, classifyMediaHttpFailure, resolveModel, stripTrailingSlash } from '../media/detect'
import { logger } from '../../../utils/logger'
import type { ImageProvider } from './types'

async function postImagesGenerations(
  base: string,
  apiKey: string,
  body: Record<string, unknown>,
  label: string,
): Promise<{ ok: true; url: string; revisedPrompt?: string } | { ok: false; error: string }> {
  const headers = { 'Content-Type': 'application/json', ...authHeaders(apiKey) }
  try {
    const res = await fetch(`${stripTrailingSlash(base)}/images/generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      logger.warn(`image ${label} HTTP ${res.status}: ${errBody.slice(0, 200)}`)
      const kind = classifyMediaHttpFailure(res.status, errBody)
      if (kind === 'endpoint_missing') {
        return {
          ok: false,
          error: `${label} has no /images/generations endpoint.`,
        }
      }
      if (kind === 'model_unsupported') {
        return {
          ok: false,
          error: `${label} rejected this image model. Pick a Seedream / DALL·E / Wan image model.`,
        }
      }
      return { ok: false, error: `HTTP ${res.status}: ${errBody.slice(0, 180)}` }
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
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export const openaiCompatImageProvider: ImageProvider = {
  id: 'openai_compat',
  label: 'OpenAI-compatible',
  match: () => true,
  async generate(prompt, ctx, opts) {
    const model = resolveModel(opts.model, ctx.settingsModel, 'dall-e-3', /dall-e|gpt-image|flux|image/i)
    const body: Record<string, unknown> = {
      model,
      prompt: prompt.slice(0, 4000),
      n: 1,
      size: opts.size || '1024x1024',
      response_format: 'b64_json',
    }
    if (opts.style === 'vivid' || opts.style === 'natural') body.style = opts.style
    if (opts.quality === 'hd' || opts.quality === 'standard') body.quality = opts.quality
    const res = await postImagesGenerations(ctx.baseUrl, ctx.apiKey, body, this.label)
    if (!res.ok) return res
    return { ok: true, url: res.url, revisedPrompt: res.revisedPrompt, providerId: this.id }
  },
}

export { postImagesGenerations }
