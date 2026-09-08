/** Shared media vendor detection + Settings mediaProfile resolution. */

import type { MediaProfileId } from '@shared'

export type MediaVendorId =
  | 'volcengine_ark'
  | 'dashscope'
  | 'kling'
  | 'openai'
  | 'minimax'
  | 'openai_compat'
  | 'none'

export interface MediaEndpointContext {
  baseUrl: string
  apiKey: string
  providerName: string
  settingsModel: string
  /** From Settings → provider.mediaProfile (`auto` uses URL detect). */
  mediaProfile?: MediaProfileId
  imageModel?: string
  videoModel?: string
  musicModel?: string
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

export function authHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {}
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`
  return headers
}

export function detectMediaVendor(baseUrl: string, settingsModel = ''): MediaVendorId {
  const h = hostOf(baseUrl)
  const m = settingsModel.toLowerCase()

  if (
    h.includes('volces.com') ||
    h.includes('volcengine.com') ||
    h.includes('ark.cn-') ||
    /seedance|seedream|doubao/.test(m)
  ) {
    return 'volcengine_ark'
  }
  if (
    h.includes('dashscope') ||
    h.includes('aliyuncs.com') ||
    h.includes('maas.aliyuncs.com') ||
    /wanx|wan2\.|qwen-vl|tongyi/.test(m)
  ) {
    return 'dashscope'
  }
  if (h.includes('klingai.com') || h.includes('klingapi.com') || /kling/.test(m)) {
    return 'kling'
  }
  if (h.includes('minimax') || /minimax|speech-/.test(m)) {
    return 'minimax'
  }
  if (h.includes('api.openai.com') || h.includes('openai.azure.com')) {
    return 'openai'
  }
  return 'openai_compat'
}

/** Resolve effective vendor: Settings profile wins; `auto` falls back to URL detect. */
export function resolveEffectiveMediaVendor(ctx: MediaEndpointContext): MediaVendorId {
  const profile = ctx.mediaProfile ?? 'auto'
  if (profile === 'none') return 'none'
  if (profile === 'openai_compat') return 'openai_compat'
  if (profile === 'volcengine_ark') return 'volcengine_ark'
  if (profile === 'dashscope') return 'dashscope'
  if (profile === 'kling') return 'kling'
  if (profile === 'minimax') return 'minimax'
  return detectMediaVendor(ctx.baseUrl, ctx.settingsModel)
}

/** Suggest a media profile from Base URL (Settings default when applying a preset / editing URL). */
export function suggestMediaProfile(baseUrl: string): MediaProfileId {
  const v = detectMediaVendor(baseUrl, '')
  if (v === 'openai' || v === 'openai_compat') return 'openai_compat'
  if (v === 'none') return 'auto'
  return v
}

/** Normalize chat base URL to Ark API v3 root. */
export function arkApiRoot(baseUrl: string): string {
  const raw = stripTrailingSlash(baseUrl.trim())
  if (/\/api\/v3$/i.test(raw)) return raw
  if (/volces\.com|volcengine\.com/i.test(hostOf(raw))) {
    return `${raw.replace(/\/api\/v3.*$/i, '')}/api/v3`
  }
  return raw
}

/** Map chat-compatible DashScope URL to native AIGC API root. */
export function dashscopeApiRoot(baseUrl: string): string {
  const raw = stripTrailingSlash(baseUrl.trim())
  if (/\/api\/v1$/i.test(raw)) return raw
  const origin = raw.replace(/\/compatible-mode\/v1.*$/i, '').replace(/\/v1$/i, '')
  if (hostOf(origin).includes('dashscope') || hostOf(origin).includes('aliyuncs.com')) {
    return `${origin}/api/v1`
  }
  return `${raw}/api/v1`
}

export function resolveModel(
  optsModel: string | undefined,
  settingsModel: string,
  fallback: string,
  hint: RegExp,
): string {
  const fromOpts = optsModel?.trim()
  // Only accept an explicit id when it looks like an image model — chat ids
  // (e.g. qwen-plus) must fall through to the vendor T2I fallback.
  if (fromOpts && hint.test(fromOpts)) return fromOpts
  const fromSettings = settingsModel.trim()
  if (fromSettings && hint.test(fromSettings)) return fromSettings
  return fallback
}

export function classifyMediaHttpFailure(status: number, body: string): string | null {
  const lower = body.toLowerCase()
  if (status === 404 || status === 405) return 'endpoint_missing'
  if (
    status === 400 &&
    (/not support|unsupported|unknown model|does not exist|no such model/.test(lower) ||
      /image.?generat|dall-e|whisper|sora|seedream/.test(lower))
  ) {
    return 'model_unsupported'
  }
  if (status === 501 || /not implemented|not available/.test(lower)) return 'endpoint_missing'
  return null
}
