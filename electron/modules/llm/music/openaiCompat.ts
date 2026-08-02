import { authHeaders, resolveModel, stripTrailingSlash } from '../media/detect'
import { logger } from '../../../utils/logger'
import type { MusicProvider } from './types'

/**
 * OpenAI-compatible music / audio gateways + TTS fallback.
 */
export const openaiCompatMusicProvider: MusicProvider = {
  id: 'openai_compat',
  label: 'OpenAI-compatible',
  match: () => true,
  async generate(prompt, ctx, opts) {
    const text = prompt.trim()
    const base = stripTrailingSlash(ctx.baseUrl)
    const model = resolveModel(opts.model, ctx.settingsModel, 'music-1', /music|suno|audio/i)
    const headers = { 'Content-Type': 'application/json', ...authHeaders(ctx.apiKey) }
    const enriched = [
      text.slice(0, 1800),
      opts.style ? `style: ${opts.style}` : null,
      opts.durationSec ? `duration: ${opts.durationSec}s` : null,
      opts.instrumental ? 'instrumental only' : null,
    ]
      .filter(Boolean)
      .join('. ')
    const musicBody = {
      model,
      prompt: enriched,
      duration: opts.durationSec,
      style: opts.style,
      instrumental: opts.instrumental,
    }
    const attempts = [
      { path: '/audio/generations', body: musicBody },
      { path: '/music/generations', body: musicBody },
      {
        path: '/audio/speech',
        body: {
          model: 'tts-1',
          input: text.slice(0, 1000),
          voice: 'alloy',
          response_format: 'mp3',
        },
        speech: true as const,
      },
    ]

    const errors: string[] = []
    for (const attempt of attempts) {
      try {
        const res = await fetch(`${base}${attempt.path}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(attempt.body),
          signal: AbortSignal.timeout(180_000),
        })
        if (!res.ok) {
          errors.push(`${attempt.path} → HTTP ${res.status}`)
          logger.warn(`music ${attempt.path} HTTP ${res.status}`)
          continue
        }
        if ('speech' in attempt && attempt.speech) {
          const buf = Buffer.from(await res.arrayBuffer())
          const url = `data:audio/mpeg;base64,${buf.toString('base64')}`
          return {
            ok: true,
            url,
            providerId: this.id,
            text:
              `**Audio (TTS fallback)**\n\n` +
              `No dedicated music endpoint; generated speech audio from the prompt instead.\n\n` +
              `<audio controls src="${url}"></audio>`,
          }
        }
        const data = (await res.json()) as {
          data?: Array<{ url?: string; b64_json?: string }>
          url?: string
          audio_url?: string
        }
        const url =
          data.url ||
          data.audio_url ||
          data.data?.[0]?.url ||
          (data.data?.[0]?.b64_json
            ? `data:audio/mpeg;base64,${data.data[0].b64_json}`
            : undefined)
        const meta = [
          opts.style,
          opts.durationSec ? `${opts.durationSec}s` : null,
          opts.instrumental ? 'instrumental' : null,
        ]
          .filter(Boolean)
          .join(' · ')
        if (url) {
          return {
            ok: true,
            url,
            providerId: this.id,
            text: `**Music / audio**${meta ? ` (${meta})` : ''}\n\n<audio controls src="${url}"></audio>\n\n_${text.slice(0, 120)}_`,
          }
        }
        errors.push(`${attempt.path} → no audio payload`)
      } catch (err) {
        errors.push(`${attempt.path} → ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return {
      ok: false,
      error:
        `Music API not available. Tried /audio/generations, /music/generations, TTS. ` +
        `Last: ${errors.slice(-3).join('; ')}`,
    }
  },
}
