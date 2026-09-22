import {
  authHeaders,
  dashscopeApiRoot,
  detectMediaVendor,
  resolveModel,
} from '../media/detect'
import { logger } from '../../../utils/logger'
import type { MusicGenOptions, MusicProvider } from './types'

const FUN_MUSIC_HINT = /fun-music/i
const TTS_HINT = /cosyvoice|sambert|tts|qwen-audio/i

/**
 * DashScope / 百炼 audio:
 * - Fun-Music (`fun-music-v1` / `fun-music-preview`) → real music composer
 * - CosyVoice / Qwen-Audio-TTS → speech synthesis fallback
 */
export const dashscopeMusicProvider: MusicProvider = {
  id: 'dashscope',
  label: '阿里百炼音频',
  match: (ctx) => detectMediaVendor(ctx.baseUrl, ctx.settingsModel) === 'dashscope',
  async generate(prompt, ctx, opts) {
    const text = prompt.trim()
    const root = dashscopeApiRoot(ctx.baseUrl)
    const model = resolveMusicModel(opts, ctx)

    if (FUN_MUSIC_HINT.test(model)) {
      return generateFunMusic(text, root, ctx.apiKey, model, opts)
    }
    return generateCosyVoice(text, root, ctx.apiKey, model)
  },
}

function resolveMusicModel(
  opts: MusicGenOptions,
  ctx: { settingsModel: string; musicModel?: string },
): string {
  const requested = (opts.model || ctx.musicModel || '').trim()
  if (FUN_MUSIC_HINT.test(requested) || TTS_HINT.test(requested)) return requested
  return resolveModel(
    opts.model || ctx.musicModel,
    ctx.musicModel || ctx.settingsModel,
    'fun-music-v1',
    /fun-music|cosyvoice|sambert|tts|qwen-audio/i,
  )
}

async function generateFunMusic(
  prompt: string,
  root: string,
  apiKey: string,
  model: string,
  opts: MusicGenOptions,
): Promise<Awaited<ReturnType<MusicProvider['generate']>>> {
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders(apiKey),
  }

  let composed = prompt.slice(0, 2000)
  if (opts.style?.trim()) {
    composed = `${composed}，风格：${opts.style.trim()}`
  }

  const input: Record<string, unknown> = {
    prompt: composed,
    format: 'mp3',
  }
  if (opts.instrumental) {
    input.is_instrumental = true
  } else if (/fun-music-v1/i.test(model)) {
    input.gender = 'female'
  }

  logger.info(`dashscope fun-music model=${model} root=${root} instrumental=${Boolean(opts.instrumental)}`)

  try {
    const res = await fetch(`${root}/services/audio/music/generation`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input }),
      signal: AbortSignal.timeout(300_000),
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      logger.warn(`dashscope fun-music HTTP ${res.status}: ${errBody.slice(0, 240)}`)
      const accessDenied =
        res.status === 403 || /AccessDenied|access denied|Forbidden/i.test(errBody)
      return {
        ok: false,
        error: accessDenied
          ? `百炼 Fun-Music 访问被拒绝（HTTP ${res.status}）。` +
            `Fun-Music 为邀测能力：请到阿里云百炼控制台开通 fun-music，并使用「百炼 API-KEY」` +
            `（能调 dashscope.aliyuncs.com），不要用仅开通对话的 MaaS/兼容模式专用 Key。` +
            `文档：https://help.aliyun.com/zh/model-studio/error-code#access-denied`
          : `百炼 Fun-Music 失败 HTTP ${res.status}: ${errBody.slice(0, 200)}。` +
            `请确认已开通 fun-music，且能访问 ${root}/services/audio/music/generation。`,
        providerId: 'dashscope',
      }
    }

    const data = (await res.json()) as {
      output?: {
        audio?: { url?: string; data?: string }
        extra_info?: { lyrics?: string }
        finish_reason?: string
      }
      message?: string
      code?: string
    }
    const url = data.output?.audio?.url
    const b64 = data.output?.audio?.data?.trim()
    const audioUrl =
      url ||
      (b64 ? `data:audio/mpeg;base64,${b64}` : undefined)
    if (!audioUrl) {
      return {
        ok: false,
        error: data.message || data.code || '百炼 Fun-Music 未返回音频 URL',
        providerId: 'dashscope',
      }
    }

    const lyrics = data.output?.extra_info?.lyrics?.trim()
    const lyricsBlock = lyrics ? `\n\n歌词：\n\`\`\`\n${lyrics}\n\`\`\`` : ''
    return {
      ok: true,
      url: audioUrl,
      providerId: 'dashscope',
      text:
        `**Music (百炼 Fun-Music · ${model})**\n\n` +
        `<audio controls src="${audioUrl}"></audio>${lyricsBlock}\n\n_${prompt.slice(0, 120)}_`,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), providerId: 'dashscope' }
  }
}

async function generateCosyVoice(
  prompt: string,
  root: string,
  apiKey: string,
  model: string,
): Promise<Awaited<ReturnType<MusicProvider['generate']>>> {
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders(apiKey),
  }
  const ttsModel = TTS_HINT.test(model) ? model : 'cosyvoice-v1'
  logger.info(`dashscope cosyvoice model=${ttsModel} root=${root}`)

  try {
    const res = await fetch(`${root}/services/aigc/text2audio/generation`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: ttsModel,
        input: { text: prompt.slice(0, 1000) },
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
          `百炼语音合成失败 HTTP ${res.status}: ${errBody.slice(0, 160)}。` +
          `若需作曲，请在设置中将 musicModel 设为 fun-music-v1（需邀测开通）。`,
        providerId: 'dashscope',
      }
    }
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('audio') || ct.includes('octet-stream')) {
      const buf = Buffer.from(await res.arrayBuffer())
      const url = `data:audio/mpeg;base64,${buf.toString('base64')}`
      return {
        ok: true,
        url,
        providerId: 'dashscope',
        text:
          `**Audio (百炼语音合成 · ${ttsModel})**\n\n` +
          `当前为朗读音频，非完整作曲。\n\n` +
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
        providerId: 'dashscope',
        text: `**Audio (百炼 · ${ttsModel})**\n\n<audio controls src="${url}"></audio>\n\n_${prompt.slice(0, 120)}_`,
      }
    }
    return {
      ok: false,
      error: data.message || '百炼未返回音频。',
      providerId: 'dashscope',
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), providerId: 'dashscope' }
  }
}
