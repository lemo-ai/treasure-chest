export interface McpServerConfig {
  id: string
  name: string
  enabled: boolean
  /** Executable, e.g. npx / uvx / node */
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface McpSettings {
  servers: McpServerConfig[]
}

export const DEFAULT_MCP_SETTINGS: McpSettings = {
  servers: [],
}
