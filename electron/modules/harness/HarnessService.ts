import type {
  AgentSession,
  ForkSessionInput,
  FortuneSettings,
  HarnessMessage,
  HarnessStoreSnapshot,
  LlmChatRequest,
  LlmChatResponse,
  LlmToolStep,
  MigrateLocalHarnessInput,
  SessionEvent,
  ToolApprovalRequest,
} from '@shared'
import { runAgentTurn } from './AgentLoop'
import * as SessionRepo from './SessionRepo'
import * as GoalsStore from './GoalsStore'
import { ensurePluginsDir, listHarnessPlugins, reloadHarnessPlugins, listPluginCatalog, installHarnessPlugin, openHarnessPluginsDir } from './plugins/PluginLoader'
import { getSandboxRoot, setSandboxRoot, ensureSandboxRoot } from './coding/Sandbox'
import { getDiagnosticsForPath } from './coding/DiagnosticsService'
import {
  createPtySession,
  writePtySession,
  resizePtySession,
  killPtySession,
} from './coding/PtyService'
import { saveCordisSettings, createCordisProfile, createCordisBundle } from './cordis/CordisWriter'
import { resolveHarnessConfig, applyCordisStack } from './cordis/CordisConfig'
import {
  getCordisStack,
  reloadCordisStack,
  getCordisRootPath,
  listCordisProfiles,
  listCordisBundles,
} from './cordis/CordisLoader'
import { describeSandboxBackend } from './coding/RemoteSandbox'
import { lspGetDefinition, lspGetCompletion } from './coding/LspService'
import { getDshWebUrl, setDshWebUrl, ensureEmbeddedDshWebServer, isEmbeddedDshWebPreferred, setEmbeddedDshWebPreferred } from './coding/DshWebService'
import { shell } from 'electron'

export function getHarnessPluginsDir(): string {
  return ensurePluginsDir()
}

export function getHarnessStore(): HarnessStoreSnapshot {
  return SessionRepo.buildStoreSnapshot()
}

export function listHarnessSessions(agentId?: string): AgentSession[] {
  return SessionRepo.listSessions(agentId)
}

export function createHarnessSession(agentId: string, title: string, id?: string): AgentSession {
  return SessionRepo.createSession(agentId, title, id)
}

export function renameHarnessSession(id: string, title: string): boolean {
  return SessionRepo.renameSession(id, title)
}

export function deleteHarnessSession(id: string): boolean {
  return SessionRepo.deleteSession(id)
}

export function getHarnessActiveSessionId(): string | null {
  return SessionRepo.getActiveSessionId()
}

export function setHarnessActiveSessionId(id: string | null): void {
  SessionRepo.setActiveSessionId(id)
}

export function listHarnessEvents(sessionId: string): SessionEvent[] {
  return SessionRepo.listEvents(sessionId)
}

export function listHarnessMessages(sessionId: string): HarnessMessage[] {
  return SessionRepo.deriveMessages(sessionId)
}

export function appendHarnessUserMessage(sessionId: string, content: string): HarnessMessage {
  return SessionRepo.appendUserMessage(sessionId, content)
}

export function appendHarnessSystemMessage(sessionId: string, content: string): HarnessMessage {
  return SessionRepo.appendSystemMessage(sessionId, content)
}

export function forkHarnessSession(input: ForkSessionInput): AgentSession | null {
  return SessionRepo.forkSession(input.sourceSessionId, input.boundarySeq, input.title)
}

export function migrateHarnessFromLocal(input: MigrateLocalHarnessInput): { imported: number } {
  return SessionRepo.migrateFromLocal(input)
}

export function listHarnessGoals(sessionId: string, includeDone = true) {
  return GoalsStore.listGoals(sessionId, includeDone)
}

export function setHarnessGoal(sessionId: string, title: string, detail?: string) {
  return GoalsStore.setGoal(sessionId, title, detail)
}

export function updateHarnessGoal(
  sessionId: string,
  goalId: string,
  status: import('@shared').AgentGoalStatus,
  detail?: string,
) {
  return GoalsStore.updateGoal(sessionId, goalId, status, detail)
}

export async function reloadHarnessPluginRegistry() {
  ensurePluginsDir()
  return reloadHarnessPlugins()
}

export async function getHarnessPlugins() {
  return listHarnessPlugins()
}

export function getHarnessSandboxRoot() {
  ensureSandboxRoot()
  return getSandboxRoot()
}

export function setHarnessSandboxRoot(path: string) {
  return setSandboxRoot(path)
}

export function getHarnessDiagnostics(path?: string) {
  return getDiagnosticsForPath(path)
}

export function getHarnessCordisStack() {
  return getCordisStack()
}

export function reloadHarnessCordisStack() {
  const stack = reloadCordisStack()
  applyCordisStack(true)
  return stack
}

export function openHarnessCordisRoot() {
  const root = getCordisRootPath()
  void shell.openPath(root)
  return root
}

export function getHarnessSandboxBackend() {
  return describeSandboxBackend()
}

export function getHarnessLspDefinition(path: string, line: number, column: number) {
  return lspGetDefinition(path, line, column)
}

export function getHarnessLspCompletion(path: string, line: number, column: number) {
  return lspGetCompletion(path, line, column)
}

export function getHarnessDshWebUrl() {
  return getDshWebUrl()
}

export function setHarnessDshWebUrl(url: string) {
  return setDshWebUrl(url)
}

export async function ensureHarnessEmbeddedDshWeb() {
  return ensureEmbeddedDshWebServer()
}

export function getHarnessEmbeddedDshWebPreferred() {
  return isEmbeddedDshWebPreferred()
}

export function setHarnessEmbeddedDshWebPreferred(enabled: boolean) {
  return setEmbeddedDshWebPreferred(enabled)
}

export function createHarnessCordisProfile(input: import('@shared').CreateCordisProfileInput) {
  return createCordisProfile(input)
}

export function createHarnessCordisBundle(input: import('@shared').CreateCordisBundleInput) {
  return createCordisBundle(input)
}

export function listHarnessCordisProfiles() {
  return listCordisProfiles()
}

export function listHarnessCordisBundles() {
  return listCordisBundles()
}

export function saveHarnessCordisSettings(input: import('@shared').SaveCordisSettingsInput) {
  return saveCordisSettings(input)
}

export function getHarnessPluginCatalog() {
  return listPluginCatalog()
}

export async function installHarnessPluginFrom(input: {
  bundledId?: string
  sourcePath?: string
}) {
  return installHarnessPlugin(input)
}

export function openHarnessPluginsDirectory() {
  return openHarnessPluginsDir()
}

export function createHarnessPty(
  cols: number,
  rows: number,
  onData: (ptyId: string, data: string) => void,
  onExit: (ptyId: string, exitCode: number) => void,
) {
  return createPtySession(cols, rows, onData, onExit)
}

export function writeHarnessPty(ptyId: string, data: string) {
  return writePtySession(ptyId, data)
}

export function resizeHarnessPty(ptyId: string, cols: number, rows: number) {
  return resizePtySession(ptyId, cols, rows)
}

export function killHarnessPty(ptyId: string) {
  return killPtySession(ptyId)
}

export async function runHarnessChat(
  req: LlmChatRequest,
  settings: FortuneSettings,
): Promise<LlmChatResponse> {
  const result = await runAgentTurn(req, settings, {}, resolveHarnessConfig())
  return result
}

export async function runHarnessChatStream(
  req: LlmChatRequest,
  settings: FortuneSettings,
  onDelta: (text: string) => void,
  onStatus?: (text: string) => void,
  onCitations?: (citations: import('@shared').KnowledgeCitation[]) => void,
  onToolStep?: (step: LlmToolStep) => void,
  onApproval?: (request: ToolApprovalRequest) => Promise<boolean>,
  onSessionEvent?: (event: SessionEvent) => void,
): Promise<LlmChatResponse> {
  return runAgentTurn(req, settings, {
    onDelta,
    onStatus,
    onCitations,
    onToolStep,
    onApproval,
    onSessionEvent,
  }, resolveHarnessConfig())
}
