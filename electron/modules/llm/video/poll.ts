import { logger } from '../../../utils/logger'

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

/**
 * Poll an async video job until URL / terminal failure.
 */
export async function pollUntilVideoUrl(opts: {
  label: string
  intervalMs?: number
  timeoutMs?: number
  fetchStatus: () => Promise<{
    done: boolean
    failed: boolean
    url?: string
    error?: string
    statusText?: string
  }>
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const interval = opts.intervalMs ?? 8_000
  const timeout = opts.timeoutMs ?? 600_000
  const started = Date.now()
  let lastStatus = 'pending'

  while (Date.now() - started < timeout) {
    try {
      const snap = await opts.fetchStatus()
      if (snap.statusText) lastStatus = snap.statusText
      if (snap.failed) {
        return { ok: false, error: snap.error || `${opts.label} failed (${lastStatus})` }
      }
      if (snap.done && snap.url) return { ok: true, url: snap.url }
      if (snap.done && !snap.url) {
        return { ok: false, error: `${opts.label} finished without a video URL` }
      }
    } catch (err) {
      logger.warn(`${opts.label} poll error`, err)
    }
    await sleep(interval)
  }

  return {
    ok: false,
    error: `${opts.label} timed out after ${Math.round(timeout / 1000)}s (last: ${lastStatus})`,
  }
}
