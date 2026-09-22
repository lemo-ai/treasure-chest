import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type {
  LlmToolSpec,
  McpServerConfig,
  McpServerStatus,
  McpSettings,
  McpStatusSnapshot,
  McpToolInfo,
  McpTransport,
} from '@shared'
import { DEFAULT_MCP_SETTINGS } from '@shared'
import { settingsStore } from '../settings/SettingsStore'
import { logger } from '../../utils/logger'
import { prepareMcpLaunch } from './NodeRuntime'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id?: number
  result?: unknown
  error?: { code?: number; message?: string }
  method?: string
  params?: unknown
}

interface SessionMeta {
  status: McpServerStatus['status']
  error?: string
  tools: McpToolInfo[]
  lastConnectedAt?: string
}

abstract class McpSession {
  abstract readonly server: McpServerConfig
  meta: SessionMeta = { status: 'disconnected', tools: [] }

  abstract initialize(): Promise<void>
  abstract listTools(): Promise<McpToolInfo[]>
  abstract callTool(name: string, args: Record<string, unknown>): Promise<string>
  abstract dispose(): void
}

/**
 * MCP stdio transport (spec): newline-delimited JSON-RPC on stdin/stdout.
 * @see https://modelcontextprotocol.io/specification/2024-11-05/basic/transports
 */
class McpStdioSession extends McpSession {
  private proc: ChildProcessWithoutNullStreams | null = null
  private buf = ''
  private nextId = 1
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >()
  readonly server: McpServerConfig

  constructor(server: McpServerConfig) {
    super()
    this.server = server
    this.meta.status = 'connecting'
  }

  private attachProcess(proc: ChildProcessWithoutNullStreams): void {
    this.proc = proc
    this.proc.stdout.setEncoding('utf8')
    this.proc.stdout.on('data', (chunk: string) => this.onData(chunk))
    this.proc.stderr.on('data', (chunk: Buffer | string) => {
      const line = String(chunk).trim()
      if (line) logger.warn(`[mcp:${this.server.name}] ${line}`)
    })
    this.proc.on('error', (err) => {
      this.meta.status = 'error'
      this.meta.error = err.message
      this.rejectAll(err)
    })
    this.proc.on('exit', (code, signal) => {
      const msg = `MCP process exited (code=${code ?? 'null'} signal=${signal ?? 'null'})`
      this.meta.status = this.meta.status === 'connected' ? 'disconnected' : 'error'
      if (this.meta.status === 'error' && !this.meta.error) this.meta.error = msg
      this.rejectAll(new Error(msg))
    })
  }

  private rejectAll(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(err)
    }
    this.pending.clear()
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
    let msg: JsonRpcResponse
    try {
      msg = JSON.parse(line) as JsonRpcResponse
    } catch {
      logger.warn(`[mcp:${this.server.name}] non-json stdout: ${line.slice(0, 120)}`)
      return
    }

    // Server-initiated request/notification — acknowledge ping-style if needed
    if (typeof msg.method === 'string' && msg.id !== undefined) {
      this.replyToServer(msg.id, {})
      return
    }

    if (typeof msg.id !== 'number') return
    const pending = this.pending.get(msg.id)
    if (!pending) return
    this.pending.delete(msg.id)
    clearTimeout(pending.timer)
    if (msg.error) pending.reject(new Error(msg.error.message || 'MCP error'))
    else pending.resolve(msg.result)
  }

  private replyToServer(id: number, result: unknown): void {
    const payload = JSON.stringify({ jsonrpc: '2.0', id, result })
    try {
      this.proc?.stdin.write(`${payload}\n`)
    } catch {
      /* ignore */
    }
  }

  request(method: string, params?: unknown): Promise<unknown> {
    if (!this.proc) return Promise.reject(new Error('MCP process not started'))
    const proc = this.proc
    const id = this.nextId++
    const payload: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`MCP timeout: ${method}`))
        }
      }, 30_000)
      this.pending.set(id, { resolve, reject, timer })
      proc.stdin.write(`${JSON.stringify(payload)}\n`, (err) => {
        if (err) {
          this.pending.delete(id)
          clearTimeout(timer)
          reject(err)
        }
      })
    })
  }

  async initialize(): Promise<void> {
    if (!this.proc) {
      const launch = await prepareMcpLaunch(
        this.server.command,
        this.server.args ?? [],
        this.server.env,
      )
      logger.info(
        `mcp spawn ${this.server.name} cmd=${launch.command} runtime=${launch.runtime.source}:${launch.runtime.versionHint}`,
      )
      this.attachProcess(
        spawn(launch.command, launch.args, {
          env: launch.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      )
    }
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'qiankun', version: '0.2.0' },
    })
    this.proc?.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
    )
    this.meta.status = 'connected'
    this.meta.error = undefined
    this.meta.lastConnectedAt = new Date().toISOString()
  }

  async listTools(): Promise<McpToolInfo[]> {
    const result = (await this.request('tools/list', {})) as { tools?: McpToolInfo[] }
    const tools = (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }))
    this.meta.tools = tools
    return tools
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
    this.rejectAll(new Error('MCP session disposed'))
    try {
      this.proc?.kill()
    } catch {
      /* ignore */
    }
    this.proc = null
  }
}

/**
 * MCP SSE transport (legacy HTTP+SSE from 2024-11-05 spec).
 * POST JSON-RPC to the SSE endpoint; read event-stream responses.
 */
class McpSseSession extends McpSession {
  private nextId = 1
  private abort: AbortController | null = null
  readonly server: McpServerConfig

  constructor(server: McpServerConfig) {
    super()
    this.server = server
    this.meta.status = 'connecting'
  }

  private endpoint(): string {
    const url = (this.server.url ?? '').trim()
    if (!url) throw new Error('SSE MCP server requires url')
    return url
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(this.server.headers ?? {}),
    }
  }

  private async postRpc(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params })
    const res = await fetch(this.endpoint(), {
      method: 'POST',
      headers: this.headers(),
      body,
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`SSE MCP HTTP ${res.status}: ${text.slice(0, 180)}`)
    }
    const ctype = res.headers.get('content-type') || ''
    if (ctype.includes('text/event-stream')) {
      const raw = await res.text()
      const dataLines = raw
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .filter(Boolean)
      for (const line of dataLines.reverse()) {
        try {
          const msg = JSON.parse(line) as JsonRpcResponse
          if (msg.id === id) {
            if (msg.error) throw new Error(msg.error.message || 'MCP error')
            return msg.result
          }
        } catch (err) {
          if (err instanceof Error && err.message !== 'MCP error') continue
          throw err
        }
      }
      throw new Error('SSE MCP: no matching JSON-RPC response in stream')
    }
    const msg = (await res.json()) as JsonRpcResponse
    if (msg.error) throw new Error(msg.error.message || 'MCP error')
    return msg.result
  }

  async initialize(): Promise<void> {
    this.abort = new AbortController()
    await this.postRpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'qiankun', version: '0.2.0' },
    })
    // Best-effort initialized notification
    try {
      await fetch(this.endpoint(), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      /* optional */
    }
    this.meta.status = 'connected'
    this.meta.error = undefined
    this.meta.lastConnectedAt = new Date().toISOString()
  }

  async listTools(): Promise<McpToolInfo[]> {
    const result = (await this.postRpc('tools/list', {})) as { tools?: McpToolInfo[] }
    const tools = (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }))
    this.meta.tools = tools
    return tools
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = (await this.postRpc('tools/call', {
      name,
      arguments: args,
    })) as { content?: Array<{ type?: string; text?: string }> }
    const text = (result.content ?? [])
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n')
      .trim()
    return text || JSON.stringify(result)
  }

  dispose(): void {
    this.abort?.abort()
    this.abort = null
    this.meta.status = 'disconnected'
  }
}

const sessions = new Map<string, McpSession>()

function transportOf(server: McpServerConfig): McpTransport {
  return server.transport === 'sse' ? 'sse' : 'stdio'
}

function getMcpSettings(): McpSettings {
  return settingsStore.getMcpSettings()
}

function createSession(server: McpServerConfig): McpSession {
  if (transportOf(server) === 'sse') return new McpSseSession(server)
  return new McpStdioSession(server)
}

async function ensureSession(server: McpServerConfig): Promise<McpSession | null> {
  const existing = sessions.get(server.id)
  if (existing && existing.meta.status === 'connected') return existing
  if (existing) {
    existing.dispose()
    sessions.delete(server.id)
  }
  const session = createSession(server)
  sessions.set(server.id, session)
  try {
    await session.initialize()
    await session.listTools()
    return session
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    session.meta.status = 'error'
    session.meta.error = msg
    logger.warn(`mcp connect failed ${server.name}`, err)
    return null
  }
}

export function disposeAllMcpSessions(): void {
  for (const s of sessions.values()) s.dispose()
  sessions.clear()
}

export function disposeMcpSession(serverId: string): void {
  const s = sessions.get(serverId)
  if (!s) return
  s.dispose()
  sessions.delete(serverId)
}

function statusForServer(server: McpServerConfig): McpServerStatus {
  const transport = transportOf(server)
  const session = sessions.get(server.id)
  if (!server.enabled) {
    return {
      id: server.id,
      name: server.name,
      enabled: false,
      transport,
      status: 'disconnected',
      tools: [],
    }
  }
  if (!session) {
    return {
      id: server.id,
      name: server.name,
      enabled: true,
      transport,
      status: 'disconnected',
      tools: [],
    }
  }
  return {
    id: server.id,
    name: server.name,
    enabled: true,
    transport,
    status: session.meta.status,
    error: session.meta.error,
    tools: session.meta.tools,
    lastConnectedAt: session.meta.lastConnectedAt,
  }
}

/** Connect enabled servers and return a status snapshot (industry: refresh / test). */
export async function refreshMcpStatus(): Promise<McpStatusSnapshot> {
  const settings = getMcpSettings()
  const enabled = settings.servers.filter((s) => s.enabled)
  const keep = new Set(enabled.map((s) => s.id))
  for (const id of [...sessions.keys()]) {
    if (!keep.has(id)) {
      disposeMcpSession(id)
    }
  }
  await Promise.all(
    enabled.map(async (server) => {
      const ready =
        transportOf(server) === 'sse' ? Boolean(server.url?.trim()) : Boolean(server.command.trim())
      if (!ready) {
        const stub = createSession(server)
        stub.meta.status = 'error'
        stub.meta.error =
          transportOf(server) === 'sse' ? 'Missing SSE url' : 'Missing command'
        sessions.set(server.id, stub)
        return
      }
      await ensureSession(server)
    }),
  )
  return getMcpStatusSnapshot()
}

export function getMcpStatusSnapshot(): McpStatusSnapshot {
  const settings = getMcpSettings()
  const servers = settings.servers.map(statusForServer)
  const toolCount = servers.reduce((n, s) => n + s.tools.length, 0)
  return { servers, toolCount }
}

/** Map MCP tools to OpenAI tool specs with mcp__{serverId}__{toolName} names. */
export async function listMcpToolsAsSpecs(): Promise<LlmToolSpec[]> {
  const snap = await refreshMcpStatus()
  const specs: LlmToolSpec[] = []
  for (const server of snap.servers) {
    if (!server.enabled || server.status !== 'connected') continue
    for (const tool of server.tools) {
      specs.push({
        type: 'function',
        function: {
          name: `mcp__${server.id}__${tool.name}`,
          description: `[MCP:${server.name}] ${tool.description || tool.name}`,
          parameters: tool.inputSchema ?? { type: 'object', properties: {} },
        },
      })
    }
  }
  return specs
}

export async function callMcpTool(qualifiedName: string, argsJson: string): Promise<string> {
  const parts = qualifiedName.split('__')
  if (parts.length < 3 || parts[0] !== 'mcp') {
    return JSON.stringify({ error: `invalid mcp tool name: ${qualifiedName}` })
  }
  const serverId = parts[1]!
  const toolName = parts.slice(2).join('__')

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
    return await session.callTool(toolName, args)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: msg })
  }
}

export function emptyMcpSettings(): McpSettings {
  return { ...DEFAULT_MCP_SETTINGS, servers: [] }
}
