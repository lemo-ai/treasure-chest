export type MediaSupportLevel = 'yes' | 'maybe' | 'no'

export type MediaCapabilityKind = 'image' | 'video' | 'music' | 'transcribe'

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
}

export interface MediaCapabilitiesSnapshot {
  providerName: string
  baseUrl: string
  apiFormat: 'openai' | 'anthropic'
  model: string
  capabilities: Record<MediaCapabilityKind, MediaCapabilityInfo>
}
