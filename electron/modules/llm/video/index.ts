import { resolveEffectiveMediaVendor } from '../media/detect'
import { dashscopeVideoProvider } from './dashscope'
import { klingVideoProvider } from './kling'
import { openaiCompatVideoProvider } from './openaiCompat'
import type {
  VideoGenOptions,
  VideoGenResult,
  VideoProvider,
  VideoProviderContext,
  VideoProviderId,
} from './types'
import { volcengineArkVideoProvider } from './volcengineArk'

const noneVideoProvider: VideoProvider = {
  id: 'openai_compat',
  label: 'disabled',
  match: () => true,
  defaultModel: () => '',
  async generate() {
    return {
      ok: false,
      error: 'Video generation disabled for this provider (media profile = none).',
    }
  },
}

export function listVideoProviders(): Array<{ id: VideoProviderId; label: string }> {
  return [
    { id: 'volcengine_ark', label: volcengineArkVideoProvider.label },
    { id: 'dashscope', label: dashscopeVideoProvider.label },
    { id: 'kling', label: klingVideoProvider.label },
  ]
}

export function resolveVideoProvider(ctx: VideoProviderContext): VideoProvider {
  const vendor = resolveEffectiveMediaVendor(ctx)
  if (vendor === 'none') return noneVideoProvider
  if (vendor === 'volcengine_ark') return volcengineArkVideoProvider
  if (vendor === 'dashscope') return dashscopeVideoProvider
  if (vendor === 'kling') return klingVideoProvider
  return openaiCompatVideoProvider
}

export async function generateVideoWithAdapters(
  prompt: string,
  ctx: VideoProviderContext,
  opts: VideoGenOptions = {},
): Promise<VideoGenResult & { providerId: VideoProviderId }> {
  const text = prompt.trim()
  if (!text) return { ok: false, error: 'empty prompt', providerId: 'openai_compat' }

  const provider = resolveVideoProvider(ctx)
  const requested = opts.model?.trim()
  const looksVideo = requested
    ? /wanx|wan2|t2v|seedance|kling|video|sora/i.test(requested)
    : false
  const result = await provider.generate(text, ctx, {
    ...opts,
    model: (looksVideo ? requested : undefined) || ctx.videoModel || requested,
  })
  return { ...result, providerId: provider.id }
}

export type { VideoProviderId, VideoGenOptions, VideoProviderContext, VideoGenResult }
