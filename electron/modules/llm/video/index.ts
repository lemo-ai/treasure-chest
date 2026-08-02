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

/** Specific adapters first; OpenAI-compatible is always the fallback. */
const PROVIDERS: VideoProvider[] = [
  volcengineArkVideoProvider,
  dashscopeVideoProvider,
  klingVideoProvider,
  openaiCompatVideoProvider,
]

export function listVideoProviders(): Array<{ id: VideoProviderId; label: string }> {
  return PROVIDERS.filter((p) => p.id !== 'openai_compat').map((p) => ({
    id: p.id,
    label: p.label,
  }))
}

export function resolveVideoProvider(ctx: VideoProviderContext): VideoProvider {
  for (const provider of PROVIDERS) {
    if (provider.id === 'openai_compat') continue
    if (provider.match(ctx)) return provider
  }
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
  const result = await provider.generate(text, ctx, opts)
  return { ...result, providerId: provider.id }
}

export type { VideoProviderId, VideoGenOptions, VideoProviderContext, VideoGenResult }
