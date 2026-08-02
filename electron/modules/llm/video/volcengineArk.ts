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

/** Normalize chat base URL to Ark API v3 root. */
export function arkApiRoot(baseUrl: string): string {
  const raw = stripTrailingSlash(baseUrl.trim())
  if (/\/api\/v3$/i.test(raw)) return raw
  // https://ark.cn-beijing.volces.com → /api/v3
  if (/volces\.com$/i.test(hostOf(raw)) || /volcengine\.com$/i.test(hostOf(raw))) {
    return `${raw.replace(/\/api\/v3.*$/i, '')}/api/v3`
  }
  return raw
}

/**
 * ByteDance Volcengine Ark Seedance (and related) async video tasks.
 * POST /contents/generations/tasks + GET poll.
 */
export const volcengineArkVideoProvider: VideoProvider = {
  id: 'volcengine_ark',
  label: '火山方舟',
  match: (ctx) => {
    const h = hostOf(ctx.baseUrl)
    return (
      h.includes('volces.com') ||
      h.includes('volcengine.com') ||
      h.includes('ark.cn-') ||
      /seedance|doubao.*video/i.test(ctx.settingsModel)
    )
  },
  defaultModel: (ctx) =>
    resolveModel({}, ctx.settingsModel, 'doubao-seedance-1-0-pro-250528', /seedance|doubao/i),
  async generate(prompt, ctx, opts) {
    const text = prompt.trim()
    const root = arkApiRoot(ctx.baseUrl)
    const model = resolveModel(
      opts,
      ctx.settingsModel,
      'doubao-seedance-1-0-pro-250528',
      /seedance|doubao/i,
    )
    const headers = { 'Content-Type': 'application/json', ...authHeaders(ctx.apiKey) }
    const body: Record<string, unknown> = {
      model,
      content: [{ type: 'text', text: text.slice(0, 4000) }],
      watermark: false,
    }
    if (opts.aspectRatio) body.ratio = opts.aspectRatio
    if (opts.durationSec) body.duration = opts.durationSec

    let createRes: Response
    try {
      createRes = await fetch(`${root}/contents/generations/tasks`, {
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
      logger.warn(`ark video create HTTP ${createRes.status}: ${errBody.slice(0, 240)}`)
      return {
        ok: false,
        error: `火山方舟创建任务失败 HTTP ${createRes.status}: ${errBody.slice(0, 200)}`,
      }
    }

    const created = (await createRes.json()) as { id?: string; task_id?: string }
    const taskId = created.id || created.task_id
    if (!taskId) {
      return { ok: false, error: '火山方舟未返回 task id' }
    }

    const polled = await pollUntilVideoUrl({
      label: '火山方舟视频',
      intervalMs: 10_000,
      timeoutMs: 600_000,
      fetchStatus: async () => {
        const res = await fetch(`${root}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
          method: 'GET',
          headers: authHeaders(ctx.apiKey),
          signal: AbortSignal.timeout(30_000),
        })
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          return { done: false, failed: false, statusText: `HTTP ${res.status}`, error: body.slice(0, 120) }
        }
        const data = (await res.json()) as {
          status?: string
          content?: { video_url?: string }
          output?: { video_url?: string; url?: string }
          video_url?: string
          error?: { message?: string }
          message?: string
        }
        const status = (data.status || '').toLowerCase()
        const url =
          data.content?.video_url ||
          data.output?.video_url ||
          data.output?.url ||
          data.video_url
        if (['failed', 'cancelled', 'canceled', 'error'].includes(status)) {
          return {
            done: true,
            failed: true,
            statusText: status,
            error: data.error?.message || data.message || status,
          }
        }
        if (['succeeded', 'success', 'completed', 'done'].includes(status) || url) {
          return { done: true, failed: false, url, statusText: status || 'done' }
        }
        return { done: false, failed: false, statusText: status || 'running' }
      },
    })

    if (!polled.ok) return polled
    return formatVideoSuccess(text, polled.url, metaLine(opts), this.label)
  },
}
