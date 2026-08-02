import {
  resolveEffectiveMediaVendor,
  type MediaEndpointContext,
} from '../media/detect'
import { dashscopeMusicProvider } from './dashscope'
import { minimaxMusicProvider } from './minimax'
import { openaiCompatMusicProvider } from './openaiCompat'
import type { MusicGenOptions, MusicGenResult, MusicProvider } from './types'

const noneMusicProvider: MusicProvider = {
  id: 'none',
  label: 'disabled',
  match: () => true,
  async generate() {
    return {
      ok: false,
      error: 'Music generation disabled for this provider (media profile = none).',
    }
  },
}

export function resolveMusicProvider(ctx: MediaEndpointContext): MusicProvider {
  const vendor = resolveEffectiveMediaVendor(ctx)
  if (vendor === 'none') return noneMusicProvider
  if (vendor === 'minimax') return minimaxMusicProvider
  if (vendor === 'dashscope') return dashscopeMusicProvider
  return openaiCompatMusicProvider
}

export async function generateMusicWithAdapters(
  prompt: string,
  ctx: MediaEndpointContext,
  opts: MusicGenOptions = {},
): Promise<MusicGenResult> {
  const text = prompt.trim()
  if (!text) return { ok: false, error: 'empty prompt' }
  const provider = resolveMusicProvider(ctx)
  return provider.generate(text, ctx, {
    ...opts,
    model: opts.model || ctx.musicModel,
  })
}

export type { MusicGenOptions, MusicGenResult }
