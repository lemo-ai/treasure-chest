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

/**
 * Placeholder replaced at runtime with a sandboxed folder under app userData.
 * Keeps shared defaults free of Electron `app.getPath`.
 */
export const MCP_WORKSPACE_PATH_TOKEN = '{{mcpWorkspace}}'

/**
 * Built-in open-source MCP servers (official reference implementations).
 * First launch / empty list seeds these into local settings so users can try MCP quickly.
 * @see https://github.com/modelcontextprotocol/servers
 */
export const BUILTIN_MCP_SERVERS: McpServerConfig[] = [
  {
    id: 'mcp_memory',
    name: 'Memory',
    enabled: true,
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
  },
  {
    id: 'mcp_sequential_thinking',
    name: 'Sequential Thinking',
    enabled: true,
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
  },
  {
    id: 'mcp_filesystem',
    name: 'Filesystem',
    enabled: true,
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', MCP_WORKSPACE_PATH_TOKEN],
  },
  {
    id: 'mcp_everything',
    name: 'Everything (demo)',
    enabled: false,
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything'],
  },
]

export const DEFAULT_MCP_SETTINGS: McpSettings = {
  servers: BUILTIN_MCP_SERVERS.map((s) => ({
    ...s,
    args: [...s.args],
    env: s.env ? { ...s.env } : undefined,
    headers: s.headers ? { ...s.headers } : undefined,
  })),
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
