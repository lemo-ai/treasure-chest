export type LlmChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface LlmToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface LlmChatMessage {
  role: LlmChatRole
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: LlmToolCall[]
}

export interface LlmToolSpec {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
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
  /** Prefer knowledge search when user @mentioned knowledge */
  useKnowledge?: boolean
}

export interface LlmChatResponse {
  ok: boolean
  text?: string
  error?: string
  model?: string
  providerName?: string
  toolCalls?: LlmToolCall[]
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
      type: 'status'
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
