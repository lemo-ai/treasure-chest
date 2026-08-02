import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { FortuneSettings } from '@shared'
import { settingsToLlmEndpoint } from './LlmClient'
import { classifyMediaHttpFailure } from './media/detect'
import { generateMusicWithAdapters } from './music'
import { generateVideoWithAdapters } from './video'
import { logger } from '../../utils/logger'

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

/** Provider-adaptive video generation. */
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
      mediaProfile: endpoint.mediaProfile,
      imageModel: endpoint.imageModel,
      videoModel: endpoint.videoModel,
      musicModel: endpoint.musicModel,
    },
    opts ?? {},
  )
  const { providerId: _providerId, ...media } = result
  return media
}

/** Provider-adaptive music / audio generation. */
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

  const endpoint = settingsToLlmEndpoint(settings)
  if (endpoint.apiFormat === 'anthropic') {
    return {
      ok: false,
      error: 'Music generation requires a non-Anthropic media-capable endpoint.',
    }
  }

  return generateMusicWithAdapters(
    text,
    {
      baseUrl: endpoint.baseUrl,
      apiKey: endpoint.apiKey,
      providerName: endpoint.providerName,
      settingsModel: endpoint.model,
      mediaProfile: endpoint.mediaProfile,
      imageModel: endpoint.imageModel,
      videoModel: endpoint.videoModel,
      musicModel: endpoint.musicModel,
    },
    opts ?? {},
  )
}
