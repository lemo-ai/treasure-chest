export type LlmChatRole = 'system' | 'user' | 'assistant'

export interface LlmChatMessage {
  role: LlmChatRole
  content: string
}

export interface LlmChatRequest {
  /** Agent id for system prompt / routing */
  agentId: string
  /** Optional override model; falls back to settings.aiModel */
  model?: string
  /** Conversation turns excluding system (main process injects system) */
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  /** Optional extra system prompt (custom agent persona) */
  systemPrompt?: string
  locale?: string
}

export interface LlmChatResponse {
  ok: boolean
  text?: string
  error?: string
  model?: string
  providerName?: string
}
