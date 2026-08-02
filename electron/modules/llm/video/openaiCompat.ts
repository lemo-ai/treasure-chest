import { logger } from '../../../utils/logger'
import {
  authHeaders,
  formatVideoSuccess,
  metaLine,
  resolveModel,
  stripTrailingSlash,
  type VideoProvider,
} from './types'

/**
 * OpenAI Videos API + common compatible gateways.
 * Tries several path shapes used by OpenAI / Azure / third-party proxies.
 */
export const openaiCompatVideoProvider: VideoProvider = {
  id: 'openai_compat',
  label: 'OpenAI-compatible',
  match: () => true, // fallback
  defaultModel: (ctx) =>
    resolveModel({}, ctx.settingsModel, 'sora-2', /sora|video/i),
  async generate(prompt, ctx, opts) {
    const text = prompt.trim()
    const base = stripTrailingSlash(ctx.baseUrl)
    const model = resolveModel(opts, ctx.settingsModel, 'sora-2', /sora|video/i)
    const headers = { 'Content-Type': 'application/json', ...authHeaders(ctx.apiKey) }
    const extra = {
      duration: opts.durationSec,
      seconds: opts.durationSec,
      aspect_ratio: opts.aspectRatio,
      size: opts.aspectRatio,
      resolution: opts.resolution,
    }
    const baseBody = { model, prompt: text.slice(0, 4000), ...extra }
    const bodies = [
      { path: '/videos', body: baseBody },
      { path: '/video/generations', body: { ...baseBody, n: 1 } },
      { path: '/videos/generations', body: baseBody },
    ]

    const errors: string[] = []
    for (const attempt of bodies) {
      try {
        const res = await fetch(`${base}${attempt.path}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(attempt.body),
          signal: AbortSignal.timeout(300_000),
        })
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          errors.push(`${attempt.path} → HTTP ${res.status}`)
          logger.warn(`video openai ${attempt.path} HTTP ${res.status}: ${body.slice(0, 160)}`)
          continue
        }
        const data = (await res.json()) as {
          id?: string
          data?: Array<{ url?: string; b64_json?: string }>
          url?: string
          video_url?: string
          status?: string
        }
        const url =
          data.url ||
          data.video_url ||
          data.data?.[0]?.url ||
          (data.data?.[0]?.b64_json ? `data:video/mp4;base64,${data.data[0].b64_json}` : undefined)
        const meta = metaLine(opts)
        if (url) return formatVideoSuccess(text, url, meta, this.label)
        if (data.id || data.status) {
          return {
            ok: true,
            text:
              `**Video job accepted** (${this.label}${meta ? ` · ${meta}` : ''})\n\n` +
              `Job \`${data.id || 'pending'}\` (status: ${data.status || 'submitted'}).\n` +
              `Open your provider console to download when ready.\n\nPrompt: ${text.slice(0, 200)}`,
          }
        }
        errors.push(`${attempt.path} → no video payload`)
      } catch (err) {
        errors.push(`${attempt.path} → ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return {
      ok: false,
      error:
        `OpenAI-compatible video API not available. Tried /videos, /video/generations, /videos/generations. ` +
        `Last: ${errors.slice(-3).join('; ')}`,
    }
  },
}
