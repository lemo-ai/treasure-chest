import {
  authHeaders,
  dashscopeApiRoot,
  detectMediaVendor,
  resolveModel,
} from '../media/detect'
import { logger } from '../../../utils/logger'
import type { MusicProvider } from './types'

/**
 * DashScope speech / CosyVoice as audio fallback when no music endpoint exists.
 * Prefer dedicated music providers when available.
 */
export const dashscopeMusicProvider: MusicProvider = {
  id: 'dashscope',
  label: '阿里百炼语音',
  match: (ctx) => detectMediaVendor(ctx.baseUrl, ctx.settingsModel) === 'dashscope',
  async generate(prompt, ctx, opts) {
    const text = prompt.trim()
    const root = dashscopeApiRoot(ctx.baseUrl)
    const model = resolveModel(
      opts.model,
      ctx.settingsModel,
      'cosyvoice-v1',
      /cosyvoice|sambert|tts/i,
    )
    const headers = {
      'Content-Type': 'application/json',
      ...authHeaders(ctx.apiKey),
    }
    // Sync TTS-style call used by many DashScope speech models
    try {
      const res = await fetch(`${root}/services/aigc/text2audio/generation`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          input: { text: text.slice(0, 1000) },
          parameters: { format: 'mp3', sample_rate: 24000 },
        }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        logger.warn(`dashscope audio HTTP ${res.status}: ${errBody.slice(0, 200)}`)
        return {
          ok: false,
          error:
            `百炼暂无稳定音乐生成接口（已尝试语音合成）。HTTP ${res.status}: ${errBody.slice(0, 160)}。` +
            `若需音乐，请改用 MiniMax 等音乐供应商，或兼容网关。`,
        }
      }
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('audio') || ct.includes('octet-stream')) {
        const buf = Buffer.from(await res.arrayBuffer())
        const url = `data:audio/mpeg;base64,${buf.toString('base64')}`
        return {
          ok: true,
          url,
          providerId: this.id,
          text:
            `**Audio (百炼语音合成)**\n\n` +
            `当前供应商以语音合成为主，已生成朗读音频（非完整作曲）。\n\n` +
            `<audio controls src="${url}"></audio>`,
        }
      }
      const data = (await res.json()) as {
        output?: { audio?: { url?: string } }
        message?: string
      }
      const url = data.output?.audio?.url
      if (url) {
        return {
          ok: true,
          url,
          providerId: this.id,
          text: `**Audio (百炼)**\n\n<audio controls src="${url}"></audio>\n\n_${text.slice(0, 120)}_`,
        }
      }
      return {
        ok: false,
        error: data.message || '百炼未返回音频。该供应商通常不提供音乐作曲 API。',
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}
