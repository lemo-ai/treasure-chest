import { logger } from '../../../utils/logger'
import { pollUntilVideoUrl } from './poll'
import {
  authHeaders,
  formatVideoSuccess,
  hostOf,
  metaLine,
  resolveModel,
  stripTrailingSlash,
  type VideoProvider,
} from './types'

/**
 * Map chat-compatible DashScope URL to native AIGC API root.
 * Custom MaaS compatible-mode hosts are remapped to public DashScope AIGC.
 */
export function dashscopeApiRoot(baseUrl: string): string {
  const raw = stripTrailingSlash(baseUrl.trim())
  const host = hostOf(raw)
  if (host.includes('dashscope.aliyuncs.com') || host.includes('dashscope-intl.aliyuncs.com')) {
    if (/\/api\/v1$/i.test(raw)) return raw
    const origin = raw.replace(/\/compatible-mode\/v1.*$/i, '').replace(/\/v1$/i, '')
    return `${origin}/api/v1`
  }
  if (host.includes('maas.aliyuncs.com') || host.includes('aliyuncs.com')) {
    return 'https://dashscope.aliyuncs.com/api/v1'
  }
  if (/\/api\/v1$/i.test(raw)) return raw
  return `${raw.replace(/\/compatible-mode\/v1.*$/i, '').replace(/\/v1$/i, '')}/api/v1`
}

function sizeFromOpts(opts: { aspectRatio?: string; resolution?: string }): string | undefined {
  if (opts.resolution && /\d+\s*[x*×]\s*\d+/i.test(opts.resolution)) {
    return opts.resolution.replace(/[×xX]/g, '*').replace(/\s/g, '')
  }
  const map: Record<string, string> = {
    '16:9': '1280*720',
    '9:16': '720*1280',
    '1:1': '960*960',
    '4:3': '1088*832',
    '3:4': '832*1088',
  }
  if (opts.aspectRatio && map[opts.aspectRatio]) return map[opts.aspectRatio]
  return undefined
}

/**
 * Alibaba DashScope / 百炼 万相文生视频（异步）.
 * POST .../services/aigc/video-generation/video-synthesis + poll /tasks/{id}
 */
export const dashscopeVideoProvider: VideoProvider = {
  id: 'dashscope',
  label: '阿里百炼万相',
  match: (ctx) => {
    const h = hostOf(ctx.baseUrl)
    return (
      h.includes('dashscope') ||
      h.includes('aliyuncs.com') ||
      h.includes('maas.aliyuncs.com') ||
      /wanx|wan2\.|tongyi.*video/i.test(ctx.settingsModel)
    )
  },
  defaultModel: (ctx) =>
    resolveModel({}, ctx.settingsModel, 'wanx2.1-t2v-turbo', /wanx|wan2/i),
  async generate(prompt, ctx, opts) {
    const text = prompt.trim()
    const root = dashscopeApiRoot(ctx.baseUrl)
    const model = resolveModel(opts, ctx.settingsModel, 'wanx2.1-t2v-turbo', /wanx|wan2/i)
    const headers = {
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
      ...authHeaders(ctx.apiKey),
    }
    const parameters: Record<string, unknown> = {
      prompt_extend: true,
    }
    const size = sizeFromOpts(opts)
    if (size) parameters.size = size
    if (opts.aspectRatio) parameters.ratio = opts.aspectRatio
    if (opts.durationSec) parameters.duration = opts.durationSec
    if (opts.resolution && !size) parameters.resolution = opts.resolution

    const body = {
      model,
      input: { prompt: text.slice(0, 4000) },
      parameters,
    }

    let createRes: Response
    try {
      createRes = await fetch(`${root}/services/aigc/video-generation/video-synthesis`, {
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
      logger.warn(`dashscope video create HTTP ${createRes.status}: ${errBody.slice(0, 240)}`)
      return {
        ok: false,
        error: `百炼视频创建失败 HTTP ${createRes.status}: ${errBody.slice(0, 200)}`,
      }
    }

    const created = (await createRes.json()) as {
      output?: { task_id?: string; task_status?: string }
      request_id?: string
      code?: string
      message?: string
    }
    const taskId = created.output?.task_id
    if (!taskId) {
      return {
        ok: false,
        error: created.message || created.code || '百炼未返回 task_id',
      }
    }

    const polled = await pollUntilVideoUrl({
      label: '百炼万相视频',
      intervalMs: 8_000,
      timeoutMs: 600_000,
      fetchStatus: async () => {
        const res = await fetch(`${root}/tasks/${encodeURIComponent(taskId)}`, {
          method: 'GET',
          headers: authHeaders(ctx.apiKey),
          signal: AbortSignal.timeout(30_000),
        })
        if (!res.ok) {
          return { done: false, failed: false, statusText: `HTTP ${res.status}` }
        }
        const data = (await res.json()) as {
          output?: {
            task_status?: string
            video_url?: string
            results?: Array<{ url?: string }>
            message?: string
          }
          message?: string
        }
        const status = (data.output?.task_status || '').toUpperCase()
        const url =
          data.output?.video_url ||
          data.output?.results?.[0]?.url
        if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
          return {
            done: true,
            failed: true,
            statusText: status,
            error: data.output?.message || data.message || status,
          }
        }
        if (status === 'SUCCEEDED' || url) {
          return { done: true, failed: false, url, statusText: status || 'SUCCEEDED' }
        }
        return { done: false, failed: false, statusText: status || 'RUNNING' }
      },
    })

    if (!polled.ok) return polled
    return formatVideoSuccess(text, polled.url, metaLine(opts), this.label)
  },
}
