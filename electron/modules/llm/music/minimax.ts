import {
  authHeaders,
  detectMediaVendor,
  resolveModel,
  stripTrailingSlash,
} from '../media/detect'
import { logger } from '../../../utils/logger'
import type { MusicProvider } from './types'

/**
 * MiniMax music generation (common Chinese music API).
 * POST /v1/music_generation or /v1/music_gen — best-effort path probes.
 */
export const minimaxMusicProvider: MusicProvider = {
  id: 'minimax',
  label: 'MiniMax',
  match: (ctx) => detectMediaVendor(ctx.baseUrl, ctx.settingsModel) === 'minimax',
  async generate(prompt, ctx, opts) {
    const text = prompt.trim()
    const base = stripTrailingSlash(ctx.baseUrl).replace(/\/v1$/i, '') + '/v1'
    const model = resolveModel(opts.model, ctx.settingsModel, 'music-01', /music/i)
    const headers = { 'Content-Type': 'application/json', ...authHeaders(ctx.apiKey) }
    const body = {
      model,
      prompt: text.slice(0, 2000),
      duration: opts.durationSec ?? 30,
      instrumental: Boolean(opts.instrumental),
      style: opts.style,
    }
    const paths = ['/music_generation', '/music_gen', '/t2a_v2']
    const errors: string[] = []

    for (const path of paths) {
      try {
        const res = await fetch(`${base}${path}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(300_000),
        })
        if (!res.ok) {
          const errBody = await res.text().catch(() => '')
          errors.push(`${path} → HTTP ${res.status}`)
          logger.warn(`minimax music ${path} HTTP ${res.status}: ${errBody.slice(0, 120)}`)
          continue
        }
        const data = (await res.json()) as {
          data?: { audio?: string; audio_url?: string }
          audio_file?: { download_url?: string }
          base_resp?: { status_code?: number; status_msg?: string }
        }
        const url =
          data.data?.audio_url ||
          data.audio_file?.download_url ||
          (data.data?.audio ? `data:audio/mpeg;base64,${data.data.audio}` : undefined)
        if (url) {
          return {
            ok: true,
            url,
            providerId: this.id,
            text: `**Music** (MiniMax)\n\n<audio controls src="${url}"></audio>\n\n_${text.slice(0, 120)}_`,
          }
        }
        errors.push(`${path} → no audio`)
      } catch (err) {
        errors.push(`${path} → ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return {
      ok: false,
      error: `MiniMax music failed. ${errors.slice(-3).join('; ')}`,
    }
  },
}
