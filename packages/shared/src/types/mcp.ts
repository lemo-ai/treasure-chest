/** MCP transport — aligned with Claude Desktop / Cursor / MCP spec. */
export type McpTransport = 'stdio' | 'sse'

export interface McpServerConfig {
  id: string
  name: string
  enabled: boolean
  /** stdio (default) or sse (HTTP + Server-Sent Events). */
  transport?: McpTransport
  /** Executable for stdio, e.g. npx / uvx / node */
  command: string
  args: string[]
  /**
   * Extra env vars injected into the MCP server process (stdio) or unused for SSE.
   * Configure in Settings — users do not need OS-level exports before launching the app.
   * Typical keys: API tokens the server itself needs (GITHUB_TOKEN, BRAVE_API_KEY, …).
   */
  env?: Record<string, string>
  /** SSE endpoint URL when transport === 'sse'. */
  url?: string
  /** Optional HTTP headers for SSE (e.g. Authorization). */
  headers?: Record<string, string>
}

export interface McpSettings {
  servers: McpServerConfig[]
}

export const DEFAULT_MCP_SETTINGS: McpSettings = {
  servers: [],
}

export type McpServerStatusKind = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface McpServerStatus {
  id: string
  name: string
  enabled: boolean
  transport: McpTransport
  status: McpServerStatusKind
  error?: string
  tools: McpToolInfo[]
  /** ISO time of last successful initialize / tools/list */
  lastConnectedAt?: string
}

export interface McpStatusSnapshot {
  servers: McpServerStatus[]
  toolCount: number
}
