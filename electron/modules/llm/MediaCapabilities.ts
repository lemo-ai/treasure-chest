import type {
  FortuneSettings,
  MediaCapabilitiesSnapshot,
  MediaCapabilityInfo,
  MediaCapabilityKind,
  MediaSupportLevel,
} from '@shared'
import { settingsToLlmEndpoint } from './LlmClient'
import { resolveVideoProvider } from './video'

export type { MediaSupportLevel, MediaCapabilityKind, MediaCapabilityInfo, MediaCapabilitiesSnapshot }

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.toLowerCase()
  } catch {
    return baseUrl.toLowerCase()
  }
}

/**
 * Industry pattern (Cursor / ChatGPT / Open WebUI):
 * gate media actions by provider capability *before* calling APIs.
 * Heuristics only — user gateways vary; "maybe" means try-at-own-risk.
 */
export function assessMediaCapabilities(settings: FortuneSettings): MediaCapabilitiesSnapshot {
  const endpoint = settingsToLlmEndpoint(settings)
  const host = hostOf(endpoint.baseUrl)
  const isAnthropic = endpoint.apiFormat === 'anthropic'
  const isOpenAiOfficial =
    host.includes('api.openai.com') || host.includes('openai.azure.com')
  const isDeepSeek = host.includes('deepseek')
  const isLocal =
    host.includes('127.0.0.1') ||
    host.includes('localhost') ||
    host.includes('ollama') ||
    host.includes('lmstudio') ||
    /:(11434|1234|8080)\b/.test(endpoint.baseUrl)
  const knownNoMedia = isDeepSeek || host.includes('moonshot') || host.includes('anthropic')

  const videoProvider = resolveVideoProvider({
    baseUrl: endpoint.baseUrl,
    apiKey: endpoint.apiKey,
    providerName: endpoint.providerName,
    settingsModel: endpoint.model,
  })

  const make = (
    kind: MediaCapabilityKind,
    level: MediaSupportLevel,
    reason: MediaCapabilityInfo['reason'],
  ): MediaCapabilityInfo => ({ kind, level, reason })

  const videoCapability = (): MediaCapabilityInfo => {
    switch (videoProvider.id) {
      case 'volcengine_ark':
        return make('video', 'yes', 'volcengine_ark')
      case 'dashscope':
        return make('video', 'yes', 'dashscope_wan')
      case 'kling':
        return make('video', 'yes', 'kling')
      default:
        if (isOpenAiOfficial) return make('video', 'maybe', 'video_rare')
        if (isLocal) return make('video', 'no', 'video_rare')
        return make('video', 'maybe', 'openai_compat_unknown')
    }
  }

  if (isAnthropic) {
    return {
      providerName: endpoint.providerName,
      baseUrl: endpoint.baseUrl,
      apiFormat: endpoint.apiFormat,
      model: endpoint.model,
      capabilities: {
        image: make('image', 'no', 'anthropic_format'),
        video: make('video', 'no', 'anthropic_format'),
        music: make('music', 'no', 'anthropic_format'),
        transcribe: make('transcribe', 'no', 'anthropic_format'),
      },
    }
  }

  if (knownNoMedia) {
    return {
      providerName: endpoint.providerName,
      baseUrl: endpoint.baseUrl,
      apiFormat: endpoint.apiFormat,
      model: endpoint.model,
      capabilities: {
        image: make('image', 'no', 'provider_no_media'),
        video: make('video', 'no', 'provider_no_media'),
        music: make('music', 'no', 'provider_no_media'),
        transcribe: make('transcribe', 'no', 'provider_no_media'),
      },
    }
  }

  if (isOpenAiOfficial) {
    return {
      providerName: endpoint.providerName,
      baseUrl: endpoint.baseUrl,
      apiFormat: endpoint.apiFormat,
      model: endpoint.model,
      capabilities: {
        image: make('image', 'yes', 'openai_official'),
        video: videoCapability(),
        music: make('music', 'no', 'music_rare'),
        transcribe: make('transcribe', 'yes', 'openai_official'),
      },
    }
  }

  if (isLocal) {
    return {
      providerName: endpoint.providerName,
      baseUrl: endpoint.baseUrl,
      apiFormat: endpoint.apiFormat,
      model: endpoint.model,
      capabilities: {
        image: make('image', 'maybe', 'local_runtime'),
        video: videoCapability(),
        music: make('music', 'no', 'music_rare'),
        transcribe: make('transcribe', 'maybe', 'local_runtime'),
      },
    }
  }

  // DashScope / Ark chat gateways often also expose image APIs
  const imageYes =
    videoProvider.id === 'dashscope' || videoProvider.id === 'volcengine_ark'

  return {
    providerName: endpoint.providerName,
    baseUrl: endpoint.baseUrl,
    apiFormat: endpoint.apiFormat,
    model: endpoint.model,
    capabilities: {
      image: make('image', imageYes ? 'yes' : 'maybe', 'openai_compat_unknown'),
      video: videoCapability(),
      music: make('music', 'no', 'music_rare'),
      transcribe: make('transcribe', 'maybe', 'openai_compat_unknown'),
    },
  }
}

export function classifyMediaHttpFailure(status: number, body: string): string | null {
  const lower = body.toLowerCase()
  if (status === 404 || status === 405) return 'endpoint_missing'
  if (
    status === 400 &&
    (/not support|unsupported|unknown model|does not exist|no such model/.test(lower) ||
      /image.?generat|dall-e|whisper|sora/.test(lower))
  ) {
    return 'model_unsupported'
  }
  if (status === 501 || /not implemented|not available/.test(lower)) return 'endpoint_missing'
  return null
}
