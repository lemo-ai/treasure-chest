import type { MediaEndpointContext } from '../media/detect'

export interface MusicGenOptions {
  model?: string
  durationSec?: number
  style?: string
  instrumental?: boolean
}

export interface MusicGenResult {
  ok: boolean
  text?: string
  url?: string
  error?: string
  providerId?: string
}

export interface MusicProvider {
  id: string
  label: string
  match: (ctx: MediaEndpointContext) => boolean
  generate: (
    prompt: string,
    ctx: MediaEndpointContext,
    opts: MusicGenOptions,
  ) => Promise<MusicGenResult>
}
