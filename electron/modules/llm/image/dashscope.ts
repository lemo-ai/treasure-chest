import {
  authHeaders,
  dashscopeApiRoot,
  detectMediaVendor,
  resolveModel,
} from '../media/detect'
import { pollUntilUrl } from '../media/poll'
import { logger } from '../../../utils/logger'
import type { ImageProvider } from './types'

function dashSize(size?: string): string {
  const s = (size || '1024x1024').replace(/[xX×]/g, '*')
  if (/^\d+\*\d+$/.test(s)) return s
  return '1024*1024'
}

/**
 * DashScope / 百炼 万相文生图（异步）.
 */
export const dashscopeImageProvider: ImageProvider = {
  id: 'dashscope',
  label: '阿里百炼万相',
  match: (ctx) => detectMediaVendor(ctx.baseUrl, ctx.settingsModel) === 'dashscope',
  async generate(prompt, ctx, opts) {
    const root = dashscopeApiRoot(ctx.baseUrl)
    const model = resolveModel(opts.model, ctx.settingsModel, 'wanx2.1-t2i-turbo', /wanx|wan2|t2i/i)
    logger.info(`dashscope image model=${model}`)
    const headers = {
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
      ...authHeaders(ctx.apiKey),
    }
    const body = {
      model,
      input: { prompt: prompt.slice(0, 4000) },
      parameters: {
        size: dashSize(opts.size),
        n: 1,
      },
    }

    let createRes: Response
    try {
      createRes = await fetch(`${root}/services/aigc/text2image/image-synthesis`, {
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
      logger.warn(`dashscope image create HTTP ${createRes.status}: ${errBody.slice(0, 240)}`)
      return {
        ok: false,
        error: `百炼文生图失败 HTTP ${createRes.status}: ${errBody.slice(0, 200)}`,
      }
    }

    const created = (await createRes.json()) as {
      output?: { task_id?: string }
      message?: string
      code?: string
    }
    const taskId = created.output?.task_id
    if (!taskId) {
      return { ok: false, error: created.message || created.code || '百炼未返回 task_id' }
    }

    const polled = await pollUntilUrl({
      label: '百炼文生图',
      intervalMs: 4_000,
      timeoutMs: 300_000,
      fetchStatus: async () => {
        const res = await fetch(`${root}/tasks/${encodeURIComponent(taskId)}`, {
          method: 'GET',
          headers: authHeaders(ctx.apiKey),
          signal: AbortSignal.timeout(30_000),
        })
        if (!res.ok) return { done: false, failed: false, statusText: `HTTP ${res.status}` }
        const data = (await res.json()) as {
          output?: {
            task_status?: string
            results?: Array<{ url?: string }>
            message?: string
          }
          message?: string
        }
        const status = (data.output?.task_status || '').toUpperCase()
        const url = data.output?.results?.[0]?.url
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
    return { ok: true, url: polled.url, providerId: this.id }
  },
}
