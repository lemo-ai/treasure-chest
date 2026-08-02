import type {
  FortuneSettings,
  MediaCapabilitiesSnapshot,
  MediaCapabilityInfo,
  MediaCapabilityKind,
  MediaSupportLevel,
} from '@shared'
import { settingsToLlmEndpoint } from './LlmClient'
import {
  classifyMediaHttpFailure,
  resolveEffectiveMediaVendor,
} from './media/detect'
import { resolveImageProvider } from './image'
import { resolveMusicProvider } from './music'
import { resolveVideoProvider } from './video'

export type { MediaSupportLevel, MediaCapabilityKind, MediaCapabilityInfo, MediaCapabilitiesSnapshot }
export { classifyMediaHttpFailure }

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.toLowerCase()
  } catch {
    return baseUrl.toLowerCase()
  }
}

/**
 * Gate media actions by Settings mediaProfile (+ URL auto when profile=auto).
 */
export function assessMediaCapabilities(settings: FortuneSettings): MediaCapabilitiesSnapshot {
  const endpoint = settingsToLlmEndpoint(settings)
  const host = hostOf(endpoint.baseUrl)
  const isAnthropic = endpoint.apiFormat === 'anthropic'
  const isLocal =
    host.includes('127.0.0.1') ||
    host.includes('localhost') ||
    host.includes('ollama') ||
    host.includes('lmstudio') ||
    /:(11434|1234|8080)\b/.test(endpoint.baseUrl)
  const knownNoMedia = host.includes('deepseek') || host.includes('moonshot') || host.includes('anthropic')

  const ctx = {
    baseUrl: endpoint.baseUrl,
    apiKey: endpoint.apiKey,
    providerName: endpoint.providerName,
    settingsModel: endpoint.model,
    mediaProfile: endpoint.mediaProfile,
    imageModel: endpoint.imageModel,
    videoModel: endpoint.videoModel,
    musicModel: endpoint.musicModel,
  }
  const vendor = resolveEffectiveMediaVendor(ctx)
  const imageProvider = resolveImageProvider(ctx)
  const videoProvider = resolveVideoProvider(ctx)
  const musicProvider = resolveMusicProvider(ctx)
  const mediaProfile = endpoint.mediaProfile ?? 'auto'

  const make = (
    kind: MediaCapabilityKind,
    level: MediaSupportLevel,
    reason: MediaCapabilityInfo['reason'],
  ): MediaCapabilityInfo => ({ kind, level, reason })

  const baseSnap = {
    providerName: endpoint.providerName,
    baseUrl: endpoint.baseUrl,
    apiFormat: endpoint.apiFormat,
    model: endpoint.model,
    mediaProfile,
  }

  if (isAnthropic) {
    return {
      ...baseSnap,
      capabilities: {
        image: make('image', 'no', 'anthropic_format'),
        video: make('video', 'no', 'anthropic_format'),
        music: make('music', 'no', 'anthropic_format'),
        transcribe: make('transcribe', 'no', 'anthropic_format'),
      },
    }
  }

  if (vendor === 'none' || mediaProfile === 'none') {
    return {
      ...baseSnap,
      capabilities: {
        image: make('image', 'no', 'media_disabled'),
        video: make('video', 'no', 'media_disabled'),
        music: make('music', 'no', 'media_disabled'),
        transcribe: make('transcribe', 'maybe', 'openai_compat_unknown'),
      },
    }
  }

  if (knownNoMedia && mediaProfile === 'auto') {
    return {
      ...baseSnap,
      capabilities: {
        image: make('image', 'no', 'provider_no_media'),
        video: make('video', 'no', 'provider_no_media'),
        music: make('music', 'no', 'provider_no_media'),
        transcribe: make('transcribe', 'no', 'provider_no_media'),
      },
    }
  }

  const imageCap = (): MediaCapabilityInfo => {
    switch (imageProvider.id) {
      case 'volcengine_ark':
        return make('image', 'yes', 'volcengine_ark')
      case 'dashscope':
        return make('image', 'yes', 'dashscope_wan')
      case 'none':
        return make('image', 'no', 'media_disabled')
      default:
        if (vendor === 'openai') return make('image', 'yes', 'openai_official')
        if (isLocal) return make('image', 'maybe', 'local_runtime')
        return make('image', 'maybe', 'media_profile')
    }
  }

  const videoCap = (): MediaCapabilityInfo => {
    switch (videoProvider.id) {
      case 'volcengine_ark':
        return make('video', 'yes', 'volcengine_ark')
      case 'dashscope':
        return make('video', 'yes', 'dashscope_wan')
      case 'kling':
        return make('video', 'yes', 'kling')
      default:
        if (vendor === 'openai') return make('video', 'maybe', 'video_rare')
        if (isLocal) return make('video', 'no', 'video_rare')
        return make('video', 'maybe', 'media_profile')
    }
  }

  const musicCap = (): MediaCapabilityInfo => {
    switch (musicProvider.id) {
      case 'minimax':
        return make('music', 'yes', 'minimax_music')
      case 'dashscope':
        return make('music', 'maybe', 'dashscope_audio')
      case 'none':
        return make('music', 'no', 'media_disabled')
      default:
        if (vendor === 'openai') return make('music', 'no', 'music_rare')
        return make('music', 'maybe', 'media_profile')
    }
  }

  const transcribeCap = (): MediaCapabilityInfo => {
    if (vendor === 'openai') return make('transcribe', 'yes', 'openai_official')
    if (isLocal) return make('transcribe', 'maybe', 'local_runtime')
    return make('transcribe', 'maybe', 'openai_compat_unknown')
  }

  return {
    ...baseSnap,
    capabilities: {
      image: imageCap(),
      video: videoCap(),
      music: musicCap(),
      transcribe: transcribeCap(),
    },
  }
}
