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
  /** Harness session id; when set, history is loaded from the append-only event log */
  sessionId?: string
  /** Internal: nested subagent depth (0 = root). */
  subagentDepth?: number
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
  /**
   * Attach live web/quote lookup tools (ChatGPT-style browsing).
   * Omit = default on for workbench chat; false = pure model, no search.
   */
  enableWebSearch?: boolean
  /** Optional knowledge collection scope for search_knowledge */
  knowledgeCollectionId?: string
  /** Restrict MCP tools to these server ids; empty/undefined = all connected */
  enabledMcpServerIds?: string[]
  /** Cross-session memory facts injected into system prompt */
  memoryFacts?: string[]
  /** Override agent-default coding tools (shell / file ops). */
  enableCodingTools?: boolean
  /** Override harness agent tools (goals / subagent). */
  enableHarnessTools?: boolean
  /** Override Cordis-style plugin tools. */
  enablePluginTools?: boolean
  /** Override spawn_subagent availability. */
  enableSpawnSubagent?: boolean
  /** Override MCP tools (domain agents default off). */
  enableMcpTools?: boolean
  /** Expose list_data_sources / query_data_source for Settings → Data sources. */
  enableDataSourceTools?: boolean
  /** Restrict data-source tools to these ids; omit with tools on (direct) = all enabled. */
  enabledDataSourceIds?: string[]
}

export type ToolSensitivityTier = 'auto' | 'confirm' | 'block'

export interface ToolSensitivityDecision {
  tier: ToolSensitivityTier
  reason: string
}

/** Pending sensitive tool call awaiting user confirmation. */
export interface ToolApprovalRequest {
  streamId: string
  toolCallId: string
  name: string
  label: string
  argsPreview: string
  risk: 'confirm' | 'block'
  reason: string
  /** Harness session id — used for session-scoped always-allow */
  sessionId?: string
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
  status: 'running' | 'done' | 'error' | 'pending' | 'denied'
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
      type: 'tool_approval'
      request: ToolApprovalRequest
    }
  | {
      streamId: string
      type: 'session_event'
      event: import('./harness').SessionEvent
    }
  | {
      streamId: string
      type: 'done'
      text: string
      model?: string
      providerName?: string
      citations?: KnowledgeCitation[]
      toolSteps?: LlmToolStep[]
      sessionId?: string
    }
  | {
      streamId: string
      type: 'cancelled'
      text?: string
      toolSteps?: LlmToolStep[]
    }
  | {
      streamId: string
      type: 'error'
      error: string
      model?: string
      providerName?: string
    }
