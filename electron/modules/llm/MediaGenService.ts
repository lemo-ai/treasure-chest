import type { FortuneSettings } from '@shared'
import { settingsToLlmEndpoint } from './LlmClient'
import { classifyMediaHttpFailure } from './MediaCapabilities'
import { generateVideoWithAdapters } from './video'
import { logger } from '../../utils/logger'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

export interface MediaGenResult {
  ok: boolean
  /** Markdown-friendly body for the assistant bubble */
  text?: string
  /** Optional media URL / data URL */
  url?: string
  error?: string
}

function requireOpenAiCompat(settings: FortuneSettings): ReturnType<typeof settingsToLlmEndpoint> | MediaGenResult {
  const endpoint = settingsToLlmEndpoint(settings)
  if (endpoint.apiFormat === 'anthropic') {
    return { ok: false, error: 'This capability requires an OpenAI-compatible endpoint (not Anthropic Messages).' }
  }
  return endpoint
}

function authHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {}
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`
  return headers
}

/**
 * OpenAI-compatible Whisper transcription: POST /v1/audio/transcriptions
 * @see https://platform.openai.com/docs/api-reference/audio/createTranscription
 */
export async function transcribeAudioFile(
  filePath: string,
  settings: FortuneSettings,
  opts?: { model?: string; language?: string },
): Promise<MediaGenResult> {
  const endpoint = requireOpenAiCompat(settings)
  if ('ok' in endpoint && endpoint.ok === false) return endpoint

  const { baseUrl, apiKey } = endpoint as ReturnType<typeof settingsToLlmEndpoint>
  const base = baseUrl.replace(/\/$/, '')
  const model = opts?.model?.trim() || 'whisper-1'

  try {
    const buf = await readFile(filePath)
    const name = basename(filePath)
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(buf)]), name)
    form.append('model', model)
    if (opts?.language) form.append('language', opts.language)

    const res = await fetch(`${base}/audio/transcriptions`, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: form,
      signal: AbortSignal.timeout(300_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.warn(`transcribe HTTP ${res.status}: ${body.slice(0, 200)}`)
      const kind = classifyMediaHttpFailure(res.status, body)
      if (kind === 'endpoint_missing') {
        return {
          ok: false,
          error:
            'This provider has no /audio/transcriptions (Whisper) endpoint. Switch provider in Settings → Models.',
        }
      }
      if (kind === 'model_unsupported') {
        return {
          ok: false,
          error: 'Current model rejected transcription. Use a Whisper-compatible model/provider.',
        }
      }
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 180)}` }
    }
    const data = (await res.json()) as { text?: string }
    const text = (data.text || '').trim()
    if (!text) return { ok: false, error: 'Empty transcription' }
    return {
      ok: true,
      text: `**Transcription** (${name})\n\n${text}`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn('transcribe failed', err)
    return { ok: false, error: msg }
  }
}

/**
 * Provider-adaptive video generation (Ark Seedance / DashScope Wan / Kling / OpenAI-compat).
 */
export async function generateVideo(
  prompt: string,
  settings: FortuneSettings,
  opts?: {
    model?: string
    durationSec?: number
    aspectRatio?: string
    resolution?: string
  },
): Promise<MediaGenResult> {
  const text = prompt.trim()
  if (!text) return { ok: false, error: 'empty prompt' }

  const endpoint = settingsToLlmEndpoint(settings)
  if (endpoint.apiFormat === 'anthropic') {
    return {
      ok: false,
      error: 'Video generation is not available on Anthropic Messages endpoints. Switch provider in Settings.',
    }
  }

  const result = await generateVideoWithAdapters(
    text,
    {
      baseUrl: endpoint.baseUrl,
      apiKey: endpoint.apiKey,
      providerName: endpoint.providerName,
      settingsModel: endpoint.model,
    },
    opts ?? {},
  )
  const { providerId: _providerId, ...media } = result
  return media
}

/**
 * Best-effort music / audio generation against OpenAI-compatible gateways.
 */
export async function generateMusic(
  prompt: string,
  settings: FortuneSettings,
  opts?: {
    model?: string
    durationSec?: number
    style?: string
    instrumental?: boolean
  },
): Promise<MediaGenResult> {
  const text = prompt.trim()
  if (!text) return { ok: false, error: 'empty prompt' }

  const endpoint = requireOpenAiCompat(settings)
  if ('ok' in endpoint && endpoint.ok === false) return endpoint
  const { baseUrl, apiKey } = endpoint as ReturnType<typeof settingsToLlmEndpoint>
  const base = baseUrl.replace(/\/$/, '')
  const model = opts?.model?.trim() || 'music-1'
  const headers = { 'Content-Type': 'application/json', ...authHeaders(apiKey) }
  const enriched =
    [
      text.slice(0, 1800),
      opts?.style ? `style: ${opts.style}` : null,
      opts?.durationSec ? `duration: ${opts.durationSec}s` : null,
      opts?.instrumental ? 'instrumental only' : null,
    ]
      .filter(Boolean)
      .join('. ')
  const musicBody = {
    model,
    prompt: enriched,
    duration: opts?.durationSec,
    style: opts?.style,
    instrumental: opts?.instrumental,
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
        const body = await res.text().catch(() => '')
        errors.push(`${attempt.path} → HTTP ${res.status}`)
        logger.warn(`music gen ${attempt.path} HTTP ${res.status}: ${body.slice(0, 160)}`)
        continue
      }
      if ('speech' in attempt && attempt.speech) {
        const buf = Buffer.from(await res.arrayBuffer())
        const url = `data:audio/mpeg;base64,${buf.toString('base64')}`
        return {
          ok: true,
          url,
          text:
            `**Audio (TTS fallback)**\n\n` +
            `Your provider has no dedicated music endpoint; generated speech audio from the prompt instead.\n\n` +
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
        (data.data?.[0]?.b64_json ? `data:audio/mpeg;base64,${data.data[0].b64_json}` : undefined)
      const meta = [
        opts?.style,
        opts?.durationSec ? `${opts.durationSec}s` : null,
        opts?.instrumental ? 'instrumental' : null,
      ]
        .filter(Boolean)
        .join(' · ')
      if (url) {
        return {
          ok: true,
          url,
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
      `Music API not available on this endpoint. Tried /audio/generations, /music/generations, and TTS fallback. ` +
      `Errors: ${errors.slice(-3).join('; ')}`,
  }
}
