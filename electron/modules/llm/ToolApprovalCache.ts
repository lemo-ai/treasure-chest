/** In-memory per-session allowlist for sensitive tools (cleared on app quit). */
const allowed = new Map<string, Set<string>>()

export function isSessionToolAllowed(sessionId: string | undefined, toolName: string): boolean {
  if (!sessionId) return false
  const set = allowed.get(sessionId)
  return Boolean(set?.has(toolName))
}

export function allowSessionTool(sessionId: string, toolName: string): void {
  const id = sessionId.trim()
  const name = toolName.trim()
  if (!id || !name) return
  let set = allowed.get(id)
  if (!set) {
    set = new Set()
    allowed.set(id, set)
  }
  set.add(name)
}

export function clearSessionToolAllowances(sessionId: string): void {
  allowed.delete(sessionId.trim())
}
