import {
  resolveEffectiveMediaVendor,
  type MediaEndpointContext,
} from '../media/detect'
import { dashscopeImageProvider } from './dashscope'
import { openaiCompatImageProvider } from './openaiCompat'
import type { ImageGenOptions, ImageGenResult, ImageProvider } from './types'
import { volcengineArkImageProvider } from './volcengineArk'

const noneImageProvider: ImageProvider = {
  id: 'none',
  label: 'disabled',
  match: () => true,
  async generate() {
    return {
      ok: false,
      error: 'Image generation disabled for this provider (media profile = none).',
    }
  },
}

export function resolveImageProvider(ctx: MediaEndpointContext): ImageProvider {
  const vendor = resolveEffectiveMediaVendor(ctx)
  if (vendor === 'none') return noneImageProvider
  if (vendor === 'volcengine_ark') return volcengineArkImageProvider
  if (vendor === 'dashscope') return dashscopeImageProvider
  return openaiCompatImageProvider
}

export async function generateImageWithAdapters(
  prompt: string,
  ctx: MediaEndpointContext,
  opts: ImageGenOptions = {},
): Promise<ImageGenResult> {
  const text = prompt.trim()
  if (!text) return { ok: false, error: 'empty prompt' }
  const provider = resolveImageProvider(ctx)
  const merged: ImageGenOptions = {
    ...opts,
    model: opts.model || ctx.imageModel,
  }
  return provider.generate(text, ctx, merged)
}

export type { ImageGenOptions, ImageGenResult }
