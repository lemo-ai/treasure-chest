import type { KnowledgeCitation, LlmToolStep } from './llm'

/** Append-only session event types (dsh-inspired). */
export type SessionEventType =
  | 'turn/start'
  | 'turn/end'
  | 'step/start'
  | 'step/end'
  | 'user/message'
  | 'assistant/message'
  | 'assistant/chunk'
  | 'tool/call'
  | 'tool/result'
  | 'system/inject'
  | 'compaction/summary'
  | 'goal/set'
  | 'goal/update'
  | 'subagent/start'
  | 'subagent/end'
  | 'shell/chunk'

export interface TurnStartPayload {
  turnIndex: number
}

export interface TurnEndPayload {
  turnIndex: number
  reason: 'complete' | 'error' | 'cancelled' | 'max_steps' | 'empty' | 'interrupted'
}

export interface StepPayload {
  turnIndex: number
  stepIndex: number
}

export interface UserMessagePayload {
  content: string
}

export interface AssistantMessagePayload {
  content: string
  model?: string
  providerName?: string
  citations?: KnowledgeCitation[]
  toolSteps?: LlmToolStep[]
}

export interface AssistantChunkPayload {
  delta: string
}

export interface ToolCallPayload {
  id: string
  name: string
  arguments: string
}

export interface ToolResultPayload {
  id: string
  name: string
  content: string
  status: 'done' | 'error' | 'denied'
}

export interface SystemInjectPayload {
  section: string
  content: string
}

export interface CompactionSummaryPayload {
  summary: string
  throughSeq: number
}

export interface GoalSetPayload {
  goalId: string
  title: string
  detail?: string
}

export interface GoalUpdatePayload {
  goalId: string
  status: AgentGoalStatus
  detail?: string
}

export interface SubagentStartPayload {
  childSessionId: string
  task: string
  agentId?: string
}

export interface SubagentEndPayload {
  childSessionId: string
  status: 'complete' | 'error'
  resultPreview?: string
}

export interface ShellChunkPayload {
  toolCallId: string
  stream: 'stdout' | 'stderr'
  delta: string
}

export type AgentGoalStatus = 'active' | 'done' | 'cancelled'

export interface AgentGoal {
  id: string
  sessionId: string
  title: string
  detail?: string
  status: AgentGoalStatus
  createdAt: string
  updatedAt: string
}

export interface HarnessPluginInfo {
  id: string
  name: string
  version: string
  toolNames: string[]
  path: string
  loadedAt: string
}

export interface HarnessPluginManifest {
  id: string
  name: string
  version: string
  description?: string
  tools: Array<{
    name: string
    description: string
    parameters: Record<string, unknown>
    handler: string
  }>
  entry?: string
  hooks?: Array<{
    name: string
    handler: string
  }>
}

export interface HarnessPluginCatalogEntry {
  id: string
  name: string
  version: string
  description: string
  bundledPath: string
  installed: boolean
}

export interface SandboxDiagnostic {
  path: string
  line: number
  column: number
  endLine?: number
  endColumn?: number
  message: string
  severity: 'error' | 'warning' | 'info'
  source: 'typescript' | 'json'
}

export interface HarnessPtySessionInfo {
  id: string
  cwd: string
  pid?: number
}

export type HarnessPtyEvent =
  | { ptyId: string; type: 'data'; data: string }
  | { ptyId: string; type: 'exit'; exitCode: number }

export interface CordisStackSnapshot {
  cordisRoot: string
  patchPath: string
  profileId: string
  profilePath: string
  bundleIds: string[]
  bundlePaths: string[]
  pluginsDir: string
  harness: Partial<HarnessConfig>
  sandboxMode: 'local' | 'ssh' | 'container'
  sandboxRoot?: string | null
  ssh?: {
    host: string
    user: string
    remotePath: string
    port?: number
  }
  container?: {
    containerName: string
    workspacePath: string
  }
  dshWebUrl?: string
  enablePluginTools?: boolean
}

export interface LspLocation {
  path: string
  line: number
  column: number
}

export interface LspCompletionItem {
  label: string
  detail?: string
  kind?: number
}

export interface SandboxBackendInfo {
  mode: 'local' | 'ssh' | 'container'
  label: string
}

export interface SaveCordisSettingsInput {
  profileId?: string
  bundleIds?: string[]
  enablePluginTools?: boolean
  dshWebUrl?: string
  sandboxRoot?: string | null
  sandboxMode?: 'local' | 'ssh' | 'container'
  sshHost?: string
  sshUser?: string
  sshRemotePath?: string
  sshPort?: number
  containerName?: string
  containerWorkspacePath?: string
}

export interface CreateCordisProfileInput {
  profileId: string
  copyFrom?: string
}

export interface CreateCordisBundleInput {
  bundleId: string
  description?: string
  copyFrom?: string
}

export type SessionEventPayload =
  | TurnStartPayload
  | TurnEndPayload
  | StepPayload
  | UserMessagePayload
  | AssistantMessagePayload
  | AssistantChunkPayload
  | ToolCallPayload
  | ToolResultPayload
  | SystemInjectPayload
  | CompactionSummaryPayload
  | GoalSetPayload
  | GoalUpdatePayload
  | SubagentStartPayload
  | SubagentEndPayload
  | ShellChunkPayload

export interface AgentSession {
  id: string
  agentId: string
  title: string
  forkedFrom?: string
  /** Optional workspace this session belongs to (0.6.0 Project). */
  projectId?: string
  createdAt: string
  updatedAt: string
}

export interface SessionEvent {
  id: string
  sessionId: string
  seq: number
  type: SessionEventType
  payload: SessionEventPayload
  createdAt: string
}

/** UI projection derived from the event log. */
export interface HarnessSubagentMeta {
  phase: 'start' | 'end'
  childSessionId: string
  task?: string
  status?: string
  resultPreview?: string
  agentId?: string
}

export interface HarnessGoalMeta {
  phase: 'set' | 'update'
  goalId: string
  title?: string
  status?: string
}

export interface HarnessMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  citations?: KnowledgeCitation[]
  toolSteps?: LlmToolStep[]
  /** Structured subagent event — UI uses i18n; content is fallback. */
  subagent?: HarnessSubagentMeta
  goal?: HarnessGoalMeta
  /** Failed turn / media call — show「重试上一问」. */
  retryable?: boolean
}

export interface HarnessStoreSnapshot {
  sessions: AgentSession[]
  /** Last focused session overall (compat / backup). Prefer activeSessionIdByAgent. */
  activeSessionId: string | null
  /** Per-agent last active session — agents keep isolated cursors. */
  activeSessionIdByAgent: Record<string, string | null>
  messagesBySession: Record<string, HarnessMessage[]>
}

export const HARNESS_ABSOLUTE_MAX_STEPS = 200

export interface HarnessConfig {
  /** Max LLM request+tool cycles per user turn. 0 = no practical cap until ABSOLUTE_MAX. */
  maxStepsPerTurn: number
  /** Max messages passed to the model after compaction. */
  maxContextMessages: number
  /** Trigger compaction when derived messages exceed this count. */
  compactionThreshold: number
  /** Max nested subagent depth per turn chain. */
  maxSubagentDepth: number
  /** Enable coding tools (shell / file edit). */
  enableCodingTools: boolean
  /** Auto-continue turns while session goals remain active. */
  maxGoalContinuations: number
}

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  maxStepsPerTurn: 0,
  maxContextMessages: 48,
  compactionThreshold: 40,
  maxSubagentDepth: 2,
  enableCodingTools: true,
  maxGoalContinuations: 3,
}

export interface MigrateLocalHarnessInput {
  sessions: AgentSession[]
  activeSessionId: string | null
  messagesBySession: Record<
    string,
    Array<{
      id: string
      role: 'user' | 'assistant' | 'system'
      content: string
      createdAt: string
      citations?: KnowledgeCitation[]
      toolSteps?: LlmToolStep[]
    }>
  >
}

export interface ForkSessionInput {
  sourceSessionId: string
  /** Copy events with seq <= boundarySeq; omit to fork all. */
  boundarySeq?: number
  title?: string
}

/** Harness agent sessions/events/goals for backup export. */
export interface HarnessBackupSection {
  sessions: AgentSession[]
  events: SessionEvent[]
  goals: AgentGoal[]
  activeSessionId: string | null
  activeSessionIdByAgent?: Record<string, string | null>
}
