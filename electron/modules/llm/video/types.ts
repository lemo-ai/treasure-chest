export type VideoProviderId =
  | 'volcengine_ark'
  | 'dashscope'
  | 'kling'
  | 'openai_compat'

export interface VideoGenResult {
  ok: boolean
  text?: string
  url?: string
  error?: string
}

export interface VideoGenOptions {
  model?: string
  durationSec?: number
  aspectRatio?: string
  resolution?: string
}

export interface VideoProviderContext {
  /** Settings base URL (may be chat-compatible path). */
  baseUrl: string
  apiKey: string
  providerName: string
  /** Active chat/video model from settings. */
  settingsModel: string
  mediaProfile?: import('@shared').MediaProfileId
  imageModel?: string
  videoModel?: string
  musicModel?: string
}

export interface VideoProvider {
  id: VideoProviderId
  label: string
  /** Whether this host/model pair should use this adapter. */
  match: (ctx: VideoProviderContext) => boolean
  /** Default model when settings model is not video-oriented. */
  defaultModel: (ctx: VideoProviderContext) => string
  generate: (
    prompt: string,
    ctx: VideoProviderContext,
    opts: VideoGenOptions,
  ) => Promise<VideoGenResult>
}

export function authHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {}
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`
  return headers
}

export function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.toLowerCase()
  } catch {
    return baseUrl.toLowerCase()
  }
}

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

/** Prefer explicit opts.model, else settings model if it looks like video, else fallback. */
export function resolveModel(
  opts: VideoGenOptions,
  settingsModel: string,
  fallback: string,
  videoHint: RegExp,
): string {
  const fromOpts = opts.model?.trim()
  if (fromOpts) return fromOpts
  const fromSettings = settingsModel.trim()
  if (fromSettings && videoHint.test(fromSettings)) return fromSettings
  return fallback
}

export function formatVideoSuccess(
  prompt: string,
  url: string | undefined,
  meta: string,
  providerLabel: string,
): VideoGenResult {
  if (url) {
    return {
      ok: true,
      url,
      text:
        `**Video** (${providerLabel}${meta ? ` · ${meta}` : ''})\n\n` +
        `[Open video](${url})\n\n_${prompt.slice(0, 120)}_`,
    }
  }
  return {
    ok: true,
    text:
      `**Video job** (${providerLabel}${meta ? ` · ${meta}` : ''})\n\n` +
      `Provider accepted the job but did not return a direct URL yet.\n\nPrompt: ${prompt.slice(0, 200)}`,
  }
}

export function metaLine(opts: VideoGenOptions): string {
  return [opts.aspectRatio, opts.durationSec ? `${opts.durationSec}s` : null, opts.resolution]
    .filter(Boolean)
    .join(' · ')
}
