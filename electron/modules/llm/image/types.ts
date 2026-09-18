import type { MediaEndpointContext } from '../media/detect'

export interface ImageGenOptions {
  size?: string
  model?: string
  style?: string
  quality?: string
}

export interface ImageGenResult {
  ok: boolean
  url?: string
  error?: string
  revisedPrompt?: string
  providerId?: string
  /** Actual T2I model id used (may differ from the chat model in the picker). */
  model?: string
}

export interface ImageProvider {
  id: string
  label: string
  match: (ctx: MediaEndpointContext) => boolean
  generate: (
    prompt: string,
    ctx: MediaEndpointContext,
    opts: ImageGenOptions,
  ) => Promise<ImageGenResult>
}
