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
  /** Set by preload for streaming; ignored by non-stream chat */
  streamId?: string
}

export interface LlmChatResponse {
  ok: boolean
  text?: string
  error?: string
  model?: string
  providerName?: string
}

/** Renderer ↔ main stream handshake id */
export interface LlmChatStreamStart {
  streamId: string
}

export type LlmChatStreamEvent =
  | {
      streamId: string
      type: 'delta'
      text: string
    }
  | {
      streamId: string
      type: 'done'
      text: string
      model?: string
      providerName?: string
    }
  | {
      streamId: string
      type: 'error'
      error: string
      model?: string
      providerName?: string
    }
