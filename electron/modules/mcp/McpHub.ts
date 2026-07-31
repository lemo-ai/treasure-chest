import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { LlmToolSpec, McpServerConfig, McpSettings } from '@shared'
import { DEFAULT_MCP_SETTINGS } from '@shared'
import { settingsStore } from '../settings/SettingsStore'
import { logger } from '../../utils/logger'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { message?: string }
}

interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

class McpStdioSession {
  private proc: ChildProcessWithoutNullStreams
  private buf = ''
  private nextId = 1
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >()
  readonly server: McpServerConfig

  constructor(server: McpServerConfig) {
    this.server = server
    this.proc = spawn(server.command, server.args ?? [], {
      env: { ...process.env, ...(server.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.proc.stdout.setEncoding('utf8')
    this.proc.stdout.on('data', (chunk: string) => this.onData(chunk))
    this.proc.stderr.on('data', (chunk: Buffer | string) => {
      logger.warn(`[mcp:${server.name}] ${String(chunk).trim()}`)
    })
    this.proc.on('exit', () => {
      for (const [, p] of this.pending) p.reject(new Error('MCP process exited'))
      this.pending.clear()
    })
  }

  private onData(chunk: string): void {
    this.buf += chunk
    let idx = this.buf.indexOf('\n')
    while (idx >= 0) {
      const line = this.buf.slice(0, idx).trim()
      this.buf = this.buf.slice(idx + 1)
      if (line) this.handleLine(line)
      idx = this.buf.indexOf('\n')
    }
  }

  private handleLine(line: string): void {
    try {
      const msg = JSON.parse(line) as JsonRpcResponse
      if (typeof msg.id !== 'number') return
      const pending = this.pending.get(msg.id)
      if (!pending) return
      this.pending.delete(msg.id)
      if (msg.error) pending.reject(new Error(msg.error.message || 'MCP error'))
      else pending.resolve(msg.result)
    } catch {
      /* ignore non-json */
    }
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++
    const payload: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.proc.stdin.write(`${JSON.stringify(payload)}\n`, (err) => {
        if (err) {
          this.pending.delete(id)
          reject(err)
        }
      })
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`MCP timeout: ${method}`))
        }
      }, 30_000)
    })
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'qiankun', version: '0.1.0' },
    })
    // notifications/initialized (no id) — best effort
    this.proc.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
    )
  }

  async listTools(): Promise<McpTool[]> {
    const result = (await this.request('tools/list', {})) as { tools?: McpTool[] }
    return result.tools ?? []
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = (await this.request('tools/call', {
      name,
      arguments: args,
    })) as { content?: Array<{ type?: string; text?: string }>; isError?: boolean }
    const text = (result.content ?? [])
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n')
      .trim()
    return text || JSON.stringify(result)
  }

  dispose(): void {
    try {
      this.proc.kill()
    } catch {
      /* ignore */
    }
  }
}

const sessions = new Map<string, McpStdioSession>()

function getMcpSettings(): McpSettings {
  return settingsStore.getMcpSettings()
}

async function ensureSession(server: McpServerConfig): Promise<McpStdioSession | null> {
  const existing = sessions.get(server.id)
  if (existing) return existing
  try {
    const session = new McpStdioSession(server)
    await session.initialize()
    sessions.set(server.id, session)
    return session
  } catch (err) {
    logger.warn(`mcp connect failed ${server.name}`, err)
    return null
  }
}

export function disposeAllMcpSessions(): void {
  for (const s of sessions.values()) s.dispose()
  sessions.clear()
}

/** Map MCP tools to OpenAI tool specs with mcp__{serverId}__{toolName} names. */
export async function listMcpToolsAsSpecs(): Promise<LlmToolSpec[]> {
  const settings = getMcpSettings()
  const enabled = settings.servers.filter((s) => s.enabled && s.command.trim())
  const specs: LlmToolSpec[] = []
  for (const server of enabled) {
    const session = await ensureSession(server)
    if (!session) continue
    try {
      const tools = await session.listTools()
      for (const tool of tools) {
        specs.push({
          type: 'function',
          function: {
            name: `mcp__${server.id}__${tool.name}`,
            description: `[MCP:${server.name}] ${tool.description || tool.name}`,
            parameters: tool.inputSchema ?? { type: 'object', properties: {} },
          },
        })
      }
    } catch (err) {
      logger.warn(`mcp listTools failed ${server.name}`, err)
      sessions.delete(server.id)
      session.dispose()
    }
  }
  return specs
}

export async function callMcpTool(qualifiedName: string, argsJson: string): Promise<string> {
  const match = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(qualifiedName)
  // Prefer split on first mcp__ and last __ after server id — server ids are simple
  const parts = qualifiedName.split('__')
  if (parts.length < 3 || parts[0] !== 'mcp') {
    return JSON.stringify({ error: `invalid mcp tool name: ${qualifiedName}` })
  }
  const serverId = parts[1]!
  const toolName = parts.slice(2).join('__')
  void match

  const server = getMcpSettings().servers.find((s) => s.id === serverId)
  if (!server) return JSON.stringify({ error: `mcp server not found: ${serverId}` })
  const session = await ensureSession(server)
  if (!session) return JSON.stringify({ error: `mcp server unavailable: ${server.name}` })

  let args: Record<string, unknown> = {}
  try {
    args = argsJson.trim() ? (JSON.parse(argsJson) as Record<string, unknown>) : {}
  } catch {
    return JSON.stringify({ error: 'invalid arguments JSON' })
  }

  try {
    const text = await session.callTool(toolName, args)
    return text
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: msg })
  }
}

export function emptyMcpSettings(): McpSettings {
  return { ...DEFAULT_MCP_SETTINGS, servers: [] }
}
