export type MediaSupportLevel = 'yes' | 'maybe' | 'no'

export type MediaCapabilityKind = 'image' | 'video' | 'music' | 'transcribe'

/**
 * Per-provider media protocol profile (configured in Settings).
 * `auto` = suggest from Base URL; user can override.
 */
export type MediaProfileId =
  | 'auto'
  | 'openai_compat'
  | 'volcengine_ark'
  | 'dashscope'
  | 'kling'
  | 'minimax'
  | 'none'

export const MEDIA_PROFILE_IDS: MediaProfileId[] = [
  'auto',
  'openai_compat',
  'volcengine_ark',
  'dashscope',
  'kling',
  'minimax',
  'none',
]

/** Cloud / vendor presets for Settings → Models (defaults only; user-editable). */
export interface AiProviderPreset {
  id: string
  /** i18n key under settings.preset.* */
  nameKey: string
  baseUrl: string
  apiFormat: 'openai' | 'anthropic'
  mediaProfile: MediaProfileId
  models: string[]
  imageModel?: string
  videoModel?: string
  musicModel?: string
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: 'openai',
    nameKey: 'settings.preset.openai',
    baseUrl: 'https://api.openai.com/v1',
    apiFormat: 'openai',
    mediaProfile: 'openai_compat',
    models: ['gpt-4o', 'dall-e-3'],
    imageModel: 'dall-e-3',
  },
  {
    id: 'volcengine_ark',
    nameKey: 'settings.preset.volcengineArk',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    apiFormat: 'openai',
    mediaProfile: 'volcengine_ark',
    models: ['doubao-seedream-4-0-250828', 'doubao-seedance-1-0-pro-250528'],
    imageModel: 'doubao-seedream-4-0-250828',
    videoModel: 'doubao-seedance-1-0-pro-250528',
  },
  {
    id: 'dashscope',
    nameKey: 'settings.preset.dashscope',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiFormat: 'openai',
    mediaProfile: 'dashscope',
    models: ['qwen-plus', 'wanx2.1-t2i-turbo', 'wanx2.1-t2v-turbo'],
    imageModel: 'wanx2.1-t2i-turbo',
    videoModel: 'wanx2.1-t2v-turbo',
  },
  {
    id: 'kling',
    nameKey: 'settings.preset.kling',
    baseUrl: 'https://api.klingai.com/v1',
    apiFormat: 'openai',
    mediaProfile: 'kling',
    models: ['kling-v1'],
    videoModel: 'kling-v1',
  },
  {
    id: 'minimax',
    nameKey: 'settings.preset.minimax',
    baseUrl: 'https://api.minimax.chat/v1',
    apiFormat: 'openai',
    mediaProfile: 'minimax',
    models: ['music-01'],
    musicModel: 'music-01',
  },
]

export interface MediaCapabilityInfo {
  kind: MediaCapabilityKind
  level: MediaSupportLevel
  reason:
    | 'anthropic_format'
    | 'provider_no_media'
    | 'openai_official'
    | 'openai_compat_unknown'
    | 'local_runtime'
    | 'video_rare'
    | 'music_rare'
    | 'volcengine_ark'
    | 'dashscope_wan'
    | 'kling'
    | 'minimax_music'
    | 'dashscope_audio'
    | 'media_disabled'
    | 'media_profile'
}

export interface MediaCapabilitiesSnapshot {
  providerName: string
  baseUrl: string
  apiFormat: 'openai' | 'anthropic'
  model: string
  mediaProfile: MediaProfileId
  capabilities: Record<MediaCapabilityKind, MediaCapabilityInfo>
}
