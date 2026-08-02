import { createHmac } from 'node:crypto'
import { logger } from '../../../utils/logger'
import { pollUntilVideoUrl } from './poll'
import {
  formatVideoSuccess,
  hostOf,
  metaLine,
  resolveModel,
  stripTrailingSlash,
  type VideoProvider,
} from './types'

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

/** Official Kling uses AK+SK JWT; gateways may accept a single Bearer key. */
function klingAuthHeader(apiKey: string): Record<string, string> {
  const raw = apiKey.trim()
  if (!raw) return {}
  const parts = raw.split(/[:|]/).map((s) => s.trim()).filter(Boolean)
  if (parts.length >= 2) {
    const [ak, sk] = parts
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const now = Math.floor(Date.now() / 1000)
    const payload = b64url(JSON.stringify({ iss: ak, exp: now + 1800, nbf: now - 5 }))
    const data = `${header}.${payload}`
    const sig = createHmac('sha256', sk!).update(data).digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
    return { Authorization: `Bearer ${data}.${sig}` }
  }
  return { Authorization: `Bearer ${raw}` }
}

function klingApiRoot(baseUrl: string): string {
  const raw = stripTrailingSlash(baseUrl.trim())
  const h = hostOf(raw)
  if (h.includes('klingai.com') || h.includes('klingapi.com')) {
    if (/\/v1$/i.test(raw)) return raw
    return `${raw.replace(/\/v1.*$/i, '')}/v1`
  }
  return /\/v1$/i.test(raw) ? raw : `${raw}/v1`
}

/**
 * Kling AI text-to-video (official JWT or gateway Bearer).
 * POST /videos/text2video + GET /videos/text2video/{task_id}
 */
export const klingVideoProvider: VideoProvider = {
  id: 'kling',
  label: '可灵 Kling',
  match: (ctx) => {
    const h = hostOf(ctx.baseUrl)
    return h.includes('klingai.com') || h.includes('klingapi.com') || /kling/i.test(ctx.settingsModel)
  },
  defaultModel: (ctx) =>
    resolveModel({}, ctx.settingsModel, 'kling-v1', /kling/i),
  async generate(prompt, ctx, opts) {
    const text = prompt.trim()
    const root = klingApiRoot(ctx.baseUrl)
    const model = resolveModel(opts, ctx.settingsModel, 'kling-v1', /kling/i)
    const headers = {
      'Content-Type': 'application/json',
      ...klingAuthHeader(ctx.apiKey),
    }
    const duration = String(opts.durationSec && opts.durationSec >= 10 ? 10 : 5)
    const body = {
      model_name: model,
      model,
      prompt: text.slice(0, 2500),
      duration,
      aspect_ratio: opts.aspectRatio || '16:9',
      mode: 'std',
    }

    let createRes: Response
    try {
      createRes = await fetch(`${root}/videos/text2video`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      })
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }

    if (!createRes.ok) {
      const errBody = await createRes.text().catch(() => '')
      logger.warn(`kling video create HTTP ${createRes.status}: ${errBody.slice(0, 240)}`)
      return {
        ok: false,
        error:
          `可灵创建失败 HTTP ${createRes.status}: ${errBody.slice(0, 180)}` +
          (ctx.apiKey.includes(':') || ctx.apiKey.includes('|')
            ? ''
            : '（官方可灵请在 API Key 填 AccessKey:SecretKey）'),
      }
    }

    const created = (await createRes.json()) as {
      data?: { task_id?: string; task_status?: string }
      task_id?: string
      code?: number
      message?: string
    }
    const taskId = created.data?.task_id || created.task_id
    if (!taskId) {
      return { ok: false, error: created.message || '可灵未返回 task_id' }
    }

    const polled = await pollUntilVideoUrl({
      label: '可灵视频',
      intervalMs: 10_000,
      timeoutMs: 600_000,
      fetchStatus: async () => {
        const res = await fetch(`${root}/videos/text2video/${encodeURIComponent(taskId)}`, {
          method: 'GET',
          headers: klingAuthHeader(ctx.apiKey),
          signal: AbortSignal.timeout(30_000),
        })
        if (!res.ok) {
          return { done: false, failed: false, statusText: `HTTP ${res.status}` }
        }
        const data = (await res.json()) as {
          data?: {
            task_status?: string
            task_status_msg?: string
            task_result?: { videos?: Array<{ url?: string }> }
          }
        }
        const status = (data.data?.task_status || '').toLowerCase()
        const url = data.data?.task_result?.videos?.[0]?.url
        if (status === 'failed') {
          return {
            done: true,
            failed: true,
            statusText: status,
            error: data.data?.task_status_msg || status,
          }
        }
        if (status === 'succeed' || status === 'succeeded' || url) {
          return { done: true, failed: false, url, statusText: status || 'succeed' }
        }
        return { done: false, failed: false, statusText: status || 'processing' }
      },
    })

    if (!polled.ok) return polled
    return formatVideoSuccess(text, polled.url, metaLine(opts), this.label)
  },
}
