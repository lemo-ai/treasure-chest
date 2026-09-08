import type { FortuneSettings } from '@shared'
import { logger } from '../../utils/logger'
import { settingsToLlmEndpoint } from './LlmClient'
import { generateImageWithAdapters } from './image'
import { materializeImageUrl } from './media/materializeUrl'

export interface ImageGenResult {
  ok: boolean
  url?: string
  error?: string
  revisedPrompt?: string
}

export async function generateImage(
  prompt: string,
  settings: FortuneSettings,
  opts?: { size?: string; model?: string; style?: string; quality?: string },
): Promise<ImageGenResult> {
  const text = prompt.trim()
  if (!text) return { ok: false, error: 'empty prompt' }

  const endpoint = settingsToLlmEndpoint(settings)
  if (endpoint.apiFormat === 'anthropic') {
    return { ok: false, error: 'Image generation requires an OpenAI-compatible endpoint.' }
  }

  const result = await generateImageWithAdapters(
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

  if (!result.ok || !result.url) return result

  try {
    const dataUrl = await materializeImageUrl(result.url)
    return { ...result, url: dataUrl }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`image materialize failed: ${msg}`)
    return { ok: false, error: msg }
  }
}
