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
  /** Capability mode overlay (write / translate / research / skills…) */
  capabilityMode?: string
  /** Extra instructions from a selected skill template */
  skillPrompt?: string
  locale?: string
  /** Set by preload for streaming; ignored by non-stream chat */
  streamId?: string
  /** Prefer knowledge search when user @mentioned knowledge */
  useKnowledge?: boolean
  /** Optional knowledge collection scope for search_knowledge */
  knowledgeCollectionId?: string
}

export interface KnowledgeCitation {
  documentId: string
  title: string
  chunkId: string
  ordinal: number
  text: string
  score: number
}

/** One tool invocation step for Codex-style process UI. */
export interface LlmToolStep {
  id: string
  name: string
  /** Localized short label */
  label: string
  status: 'running' | 'done' | 'error'
  /** Truncated JSON args for display */
  argsPreview?: string
  /** Truncated tool output for display */
  resultPreview?: string
  error?: string
}

export interface LlmChatResponse {
  ok: boolean
  text?: string
  error?: string
  model?: string
  providerName?: string
  toolCalls?: LlmToolCall[]
  citations?: KnowledgeCitation[]
  toolSteps?: LlmToolStep[]
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
      type: 'citations'
      citations: KnowledgeCitation[]
    }
  | {
      streamId: string
      type: 'tool_step'
      step: LlmToolStep
    }
  | {
      streamId: string
      type: 'done'
      text: string
      model?: string
      providerName?: string
      citations?: KnowledgeCitation[]
      toolSteps?: LlmToolStep[]
    }
  | {
      streamId: string
      type: 'error'
      error: string
      model?: string
      providerName?: string
    }
