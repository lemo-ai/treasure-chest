/**
 * Tracks in-flight agent turns: cancel + pause/resume between tool steps.
 */
type PauseGate = {
  promise: Promise<void>
  resolve: () => void
}

type RunEntry = {
  controller: AbortController
  pause: PauseGate | null
}

const runs = new Map<string, RunEntry>()

export function registerTurnRun(streamId: string): AbortSignal {
  const existing = runs.get(streamId)
  if (existing) {
    existing.controller.abort()
    existing.pause?.resolve()
  }
  const controller = new AbortController()
  runs.set(streamId, { controller, pause: null })
  return controller.signal
}

export function cancelTurnRun(streamId: string): boolean {
  const entry = runs.get(streamId)
  if (!entry) return false
  entry.controller.abort()
  entry.pause?.resolve()
  runs.delete(streamId)
  return true
}

export function endTurnRun(streamId: string): void {
  const entry = runs.get(streamId)
  entry?.pause?.resolve()
  runs.delete(streamId)
}

export function pauseTurnRun(streamId: string): boolean {
  const entry = runs.get(streamId)
  if (!entry || entry.controller.signal.aborted) return false
  if (entry.pause) return true
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  entry.pause = { promise, resolve }
  return true
}

export function resumeTurnRun(streamId: string): boolean {
  const entry = runs.get(streamId)
  if (!entry?.pause) return false
  entry.pause.resolve()
  entry.pause = null
  return true
}

export function isTurnPaused(streamId: string): boolean {
  return Boolean(runs.get(streamId)?.pause)
}

export function isTurnCancelled(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted)
}

/** Block while paused; abort throws via caller throwIfCancelled after await. */
export async function waitIfPaused(streamId: string | undefined, signal?: AbortSignal): Promise<void> {
  if (!streamId) return
  while (true) {
    if (signal?.aborted) return
    const entry = runs.get(streamId)
    const gate = entry?.pause
    if (!gate) return
    await gate.promise
  }
}

export class TurnCancelledError extends Error {
  constructor() {
    super('cancelled')
    this.name = 'TurnCancelledError'
  }
}
