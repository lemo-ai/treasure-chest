/** Tracks in-flight agent turns so the renderer can cancel by streamId. */
const runs = new Map<string, AbortController>()

export function registerTurnRun(streamId: string): AbortSignal {
  const existing = runs.get(streamId)
  if (existing) existing.abort()
  const controller = new AbortController()
  runs.set(streamId, controller)
  return controller.signal
}

export function cancelTurnRun(streamId: string): boolean {
  const controller = runs.get(streamId)
  if (!controller) return false
  controller.abort()
  runs.delete(streamId)
  return true
}

export function endTurnRun(streamId: string): void {
  runs.delete(streamId)
}

export function isTurnCancelled(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted)
}

export class TurnCancelledError extends Error {
  constructor() {
    super('cancelled')
    this.name = 'TurnCancelledError'
  }
}
