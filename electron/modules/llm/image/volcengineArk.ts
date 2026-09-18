import { arkApiRoot, detectMediaVendor, resolveModel } from '../media/detect'
import { postImagesGenerations } from './openaiCompat'
import type { ImageProvider } from './types'

/** Map UI size (1024x1024) to Ark Seedream size tokens when helpful. */
function arkSize(size?: string): string {
  const s = (size || '1024x1024').toLowerCase().replace('*', 'x')
  if (s.includes('1792') || s.includes('2k')) return '2K'
  if (s.includes('1024') || s.includes('1k')) return '1K'
  if (/^\d+x\d+$/.test(s)) return size!.replace('x', 'x')
  return size || '2K'
}

/**
 * Volcengine Ark Seedream — same /images/generations path, Ark-specific defaults.
 */
export const volcengineArkImageProvider: ImageProvider = {
  id: 'volcengine_ark',
  label: '火山方舟',
  match: (ctx) => detectMediaVendor(ctx.baseUrl, ctx.settingsModel) === 'volcengine_ark',
  async generate(prompt, ctx, opts) {
    const root = arkApiRoot(ctx.baseUrl)
    const model = resolveModel(
      opts.model,
      ctx.settingsModel,
      'doubao-seedream-4-0-250828',
      /seedream|doubao/i,
    )
    const body: Record<string, unknown> = {
      model,
      prompt: prompt.slice(0, 4000),
      n: 1,
      size: arkSize(opts.size),
      response_format: 'url',
      watermark: false,
      sequential_image_generation: 'disabled',
    }
    const res = await postImagesGenerations(root, ctx.apiKey, body, this.label)
    if (!res.ok) {
      // Retry once with pixel size for older gateways
      const retry = await postImagesGenerations(
        root,
        ctx.apiKey,
        {
          ...body,
          size: (opts.size || '1024x1024').replace('*', 'x'),
          response_format: 'b64_json',
        },
        this.label,
      )
      if (!retry.ok) return res
      return {
        ok: true,
        url: retry.url,
        revisedPrompt: retry.revisedPrompt,
        providerId: this.id,
        model,
      }
    }
    return {
      ok: true,
      url: res.url,
      revisedPrompt: res.revisedPrompt,
      providerId: this.id,
      model,
    }
  },
}
