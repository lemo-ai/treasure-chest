/** Workbench “just talk to the model” — not a named agent. */
export const DIRECT_CHAT_AGENT_ID = 'direct'

/**
 * Direct chat vs agent (ChatGPT default thread vs GPT/Agent; Claude chat vs Computer Use).
 * Direct: stream model text, no tool loop / persona / plugin inject.
 * Agent: system prompt + tools + multi-step loop.
 */
export function isDirectChatAgentId(agentId?: string | null): boolean {
  const id = (agentId ?? '').trim()
  return !id || id === DIRECT_CHAT_AGENT_ID || id === 'none'
}
