import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IpcChannels,
  type AppLocale,
  type AppSettingsSnapshot,
  type BirthProfile,
  type CalendarMode,
  type DesktopWidgetSettings,
  type DesktopWidgetView,
  type LaunchBehavior,
  type NotificationSettings,
  type FortuneSettings,
  type DailyFortune,
  type FortuneAiConnectionTestInput,
  type FortuneAiConnectionTestResponse,
  type FortuneAiResponse,
  type LlmChatRequest,
  type LlmChatResponse,
  type LlmChatStreamEvent,
  type StockMarket,
  type ScannerPoolItem,
  type StocksReport,
  type StocksReportSummary,
  type StocksSettings,
  type StockQuoteDetail,
  type WatchlistItem,
  type ThemeMode,
  type ThemeAccent,
} from '@shared'

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke(IpcChannels.app.getVersion),
  getUpdateStatus: (): Promise<import('@shared').AppUpdateStatus> =>
    ipcRenderer.invoke(IpcChannels.app.getUpdateStatus),
  checkForUpdates: (): Promise<import('@shared').AppUpdateStatus> =>
    ipcRenderer.invoke(IpcChannels.app.checkForUpdates),
  downloadUpdate: (): Promise<import('@shared').AppUpdateStatus> =>
    ipcRenderer.invoke(IpcChannels.app.downloadUpdate),
  quitAndInstallUpdate: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.app.quitAndInstall),
  openReleasesPage: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IpcChannels.app.openReleasesPage),
  getTheme: (): Promise<ThemeMode> => ipcRenderer.invoke(IpcChannels.settings.getTheme),
  setTheme: (theme: ThemeMode): Promise<ThemeMode> =>
    ipcRenderer.invoke(IpcChannels.settings.setTheme, theme),
  getAccent: (): Promise<ThemeAccent> => ipcRenderer.invoke(IpcChannels.settings.getAccent),
  setAccent: (accent: ThemeAccent): Promise<ThemeAccent> =>
    ipcRenderer.invoke(IpcChannels.settings.setAccent, accent),
  getLocale: (): Promise<AppLocale> => ipcRenderer.invoke(IpcChannels.settings.getLocale),
  setLocale: (locale: AppLocale): Promise<AppLocale> =>
    ipcRenderer.invoke(IpcChannels.settings.setLocale, locale),
  getSettingsSnapshot: (): Promise<AppSettingsSnapshot> =>
    ipcRenderer.invoke(IpcChannels.settings.getSnapshot),
  getDesktopWidget: (): Promise<DesktopWidgetView> =>
    ipcRenderer.invoke(IpcChannels.settings.getDesktopWidget),
  setDesktopWidget: (partial: Partial<DesktopWidgetSettings>): Promise<DesktopWidgetView> =>
    ipcRenderer.invoke(IpcChannels.settings.setDesktopWidget, partial),
  pickDialBackground: (): Promise<DesktopWidgetView> =>
    ipcRenderer.invoke(IpcChannels.settings.pickDialBackground),
  clearDialBackground: (): Promise<DesktopWidgetView> =>
    ipcRenderer.invoke(IpcChannels.settings.clearDialBackground),
  selectDialBackground: (path: string): Promise<DesktopWidgetView> =>
    ipcRenderer.invoke(IpcChannels.settings.selectDialBackground, path),
  deleteDialBackground: (path: string): Promise<DesktopWidgetView> =>
    ipcRenderer.invoke(IpcChannels.settings.deleteDialBackground, path),
  onDesktopWidgetUpdated: (listener: (settings: DesktopWidgetView) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, settings: DesktopWidgetView): void => {
      listener(settings)
    }
    ipcRenderer.on(IpcChannels.settings.desktopWidgetUpdated, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.settings.desktopWidgetUpdated, handler)
    }
  },
  openCalendarWindow: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.window.openCalendar),
  closeCalendarWindow: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.window.closeCalendar),
  showMainWindow: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.window.showMain),
  startDialDrag: (): void => {
    ipcRenderer.send(IpcChannels.window.dialDragStart)
  },
  endDialDrag: (): void => {
    ipcRenderer.send(IpcChannels.window.dialDragEnd)
  },
  getCalendarMode: (): Promise<CalendarMode> => ipcRenderer.invoke(IpcChannels.calendar.getMode),
  setCalendarMode: (mode: CalendarMode): Promise<CalendarMode> =>
    ipcRenderer.invoke(IpcChannels.calendar.setMode, mode),
  getBirthProfile: (): Promise<BirthProfile | null> =>
    ipcRenderer.invoke(IpcChannels.fortune.getProfile),
  saveBirthProfile: (profile: BirthProfile): Promise<BirthProfile> =>
    ipcRenderer.invoke(IpcChannels.fortune.saveProfile, profile),
  clearBirthProfile: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.fortune.clearProfile),
  exportBackup: (): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.backup.export),
  importBackup: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.backup.import),
  getLaunchAtLogin: (): Promise<{ configured: boolean; system: boolean }> =>
    ipcRenderer.invoke(IpcChannels.system.getLaunchAtLogin),
  setLaunchAtLogin: (enabled: boolean): Promise<{ configured: boolean; system: boolean }> =>
    ipcRenderer.invoke(IpcChannels.system.setLaunchAtLogin, enabled),
  setLaunchBehavior: (behavior: LaunchBehavior): Promise<LaunchBehavior> =>
    ipcRenderer.invoke(IpcChannels.settings.setLaunchBehavior, behavior),
  setNotifications: (partial: Partial<NotificationSettings>): Promise<NotificationSettings> =>
    ipcRenderer.invoke(IpcChannels.settings.setNotifications, partial),
  setDataSources: (
    partial: Partial<import('@shared').DataSourcesSettings>,
  ): Promise<import('@shared').DataSourcesSettings> =>
    ipcRenderer.invoke(IpcChannels.settings.setDataSources, partial),
  upsertDataSource: (
    input: import('@shared').DataSourceConfig,
  ): Promise<import('@shared').DataSourceConfig> =>
    ipcRenderer.invoke(IpcChannels.settings.upsertDataSource, input),
  deleteDataSource: (id: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.settings.deleteDataSource, id),
  previewDataSource: (id: string): Promise<{ ok: boolean; text?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.settings.previewDataSource, id),
  testDataSource: (
    input: import('@shared').DataSourceConfig,
  ): Promise<{ ok: boolean; text?: string; error?: string; latencyMs?: number }> =>
    ipcRenderer.invoke(IpcChannels.settings.testDataSource, input),
  pickDataSourceFile: (): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.settings.pickDataSourceFile),
  listDataSourceDrivers: (): Promise<import('@shared').DataSourceDriverInfo[]> =>
    ipcRenderer.invoke(IpcChannels.settings.listDataSourceDrivers),
  ensureDataSourceDriver: (
    kind: string,
    version?: string,
  ): Promise<{ ok: boolean; status?: unknown; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.settings.ensureDataSourceDriver, kind, version),
  testDingTalkNotify: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.settings.testDingTalk),
  testEmailNotify: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.settings.testEmail),
  setFortuneSettings: (partial: Partial<FortuneSettings>): Promise<FortuneSettings> =>
    ipcRenderer.invoke(IpcChannels.settings.setFortuneSettings, partial),
  setStocksSettings: (partial: Partial<StocksSettings>): Promise<StocksSettings> =>
    ipcRenderer.invoke(IpcChannels.settings.setStocksSettings, partial),
  generateFortuneAiAnalysis: (fortune: DailyFortune, locale: string): Promise<FortuneAiResponse> =>
    ipcRenderer.invoke(IpcChannels.fortune.generateAiAnalysis, { fortune, locale }),
  testFortuneAiConnection: (payload: FortuneAiConnectionTestInput): Promise<FortuneAiConnectionTestResponse> =>
    ipcRenderer.invoke(IpcChannels.fortune.testAiConnection, payload),
  workbenchChat: (payload: LlmChatRequest): Promise<LlmChatResponse> =>
    ipcRenderer.invoke(IpcChannels.workbench.chat, payload),
  workbenchChatStream: (
    payload: LlmChatRequest,
    onDelta: (text: string) => void,
    onStatus?: (text: string) => void,
    onCitations?: (citations: import('@shared').KnowledgeCitation[]) => void,
    onToolStep?: (step: import('@shared').LlmToolStep) => void,
    onToolApproval?: (request: import('@shared').ToolApprovalRequest) => void,
    onSessionEvent?: (event: import('@shared').SessionEvent) => void,
    onStreamStart?: (streamId: string) => void,
  ): Promise<LlmChatResponse> => {
    const streamId = `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    onStreamStart?.(streamId)
    return new Promise((resolve, reject) => {
      let lastCitations: import('@shared').KnowledgeCitation[] | undefined
      let lastToolSteps: import('@shared').LlmToolStep[] = []
      const finish = (response: LlmChatResponse): void => {
        ipcRenderer.removeListener(IpcChannels.workbench.chatStreamEvent, handler)
        resolve(response)
      }
      const handler = (_event: IpcRendererEvent, ev: LlmChatStreamEvent): void => {
        if (ev.streamId !== streamId) return
        if (ev.type === 'status') {
          onStatus?.(ev.text)
          return
        }
        if (ev.type === 'citations') {
          lastCitations = ev.citations
          onCitations?.(ev.citations)
          return
        }
        if (ev.type === 'tool_step') {
          const idx = lastToolSteps.findIndex((s) => s.id === ev.step.id)
          if (idx >= 0) lastToolSteps[idx] = ev.step
          else lastToolSteps = [...lastToolSteps, ev.step]
          onToolStep?.(ev.step)
          return
        }
        if (ev.type === 'tool_approval') {
          onToolApproval?.(ev.request)
          return
        }
        if (ev.type === 'delta') {
          onDelta(ev.text)
          return
        }
        if (ev.type === 'done') {
          finish({
            ok: true,
            text: ev.text,
            model: ev.model,
            providerName: ev.providerName,
            citations: ev.citations ?? lastCitations,
            toolSteps: ev.toolSteps ?? lastToolSteps,
          })
          return
        }
        if (ev.type === 'session_event') {
          onSessionEvent?.(ev.event)
          return
        }
        if (ev.type === 'cancelled') {
          finish({
            ok: false,
            error: 'cancelled',
            text: ev.text,
            toolSteps: ev.toolSteps,
          })
          return
        }
        if (ev.type === 'error') {
          finish({
            ok: false,
            error: ev.error,
            model: ev.model,
            providerName: ev.providerName,
            toolSteps: lastToolSteps,
          })
        }
      }

      ipcRenderer.on(IpcChannels.workbench.chatStreamEvent, handler)
      void ipcRenderer
        .invoke(IpcChannels.workbench.chatStream, { ...payload, streamId })
        .catch((err: unknown) => {
          ipcRenderer.removeListener(IpcChannels.workbench.chatStreamEvent, handler)
          reject(err)
        })
    })
  },
  resolveToolApproval: (payload: {
    streamId: string
    toolCallId: string
    approved: boolean
    alwaysAllow?: boolean
    sessionId?: string
    toolName?: string
  }): Promise<boolean> => ipcRenderer.invoke(IpcChannels.workbench.resolveToolApproval, payload),
  cancelWorkbenchStream: (streamId: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.workbench.cancelStream, streamId),
  pauseWorkbenchStream: (streamId: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.workbench.pauseStream, streamId),
  resumeWorkbenchStream: (streamId: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.workbench.resumeStream, streamId),
  harnessGetStore: (): Promise<import('@shared').HarnessStoreSnapshot> =>
    ipcRenderer.invoke(IpcChannels.harness.getStore),
  harnessMigrateLocal: (payload: import('@shared').MigrateLocalHarnessInput): Promise<{ imported: number }> =>
    ipcRenderer.invoke(IpcChannels.harness.migrateLocal, payload),
  harnessCreateSession: (agentId: string, title: string, id?: string): Promise<import('@shared').AgentSession> =>
    ipcRenderer.invoke(IpcChannels.harness.createSession, { agentId, title, id }),
  harnessRenameSession: (id: string, title: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.harness.renameSession, { id, title }),
  harnessDeleteSession: (id: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.harness.deleteSession, id),
  harnessSetActiveSession: (id: string | null, agentId?: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.harness.setActiveSession, id, agentId),
  harnessListMessages: (sessionId: string): Promise<import('@shared').HarnessMessage[]> =>
    ipcRenderer.invoke(IpcChannels.harness.listMessages, sessionId),
  harnessAppendUserMessage: (sessionId: string, content: string): Promise<import('@shared').HarnessMessage> =>
    ipcRenderer.invoke(IpcChannels.harness.appendUserMessage, { sessionId, content }),
  harnessAppendSystemMessage: (sessionId: string, content: string): Promise<import('@shared').HarnessMessage> =>
    ipcRenderer.invoke(IpcChannels.harness.appendSystemMessage, { sessionId, content }),
  harnessListEvents: (sessionId: string): Promise<import('@shared').SessionEvent[]> =>
    ipcRenderer.invoke(IpcChannels.harness.listEvents, sessionId),
  harnessForkSession: (payload: import('@shared').ForkSessionInput): Promise<import('@shared').AgentSession | null> =>
    ipcRenderer.invoke(IpcChannels.harness.forkSession, payload),
  harnessExportSessionMarkdown: (payload: {
    sessionId: string
    includeEvents?: boolean
  }): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.harness.exportSessionMarkdown, payload),
  harnessExportSessionPdf: (payload: {
    sessionId: string
    includeEvents?: boolean
  }): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.harness.exportSessionPdf, payload),
  harnessListGoals: (sessionId: string, includeDone?: boolean): Promise<import('@shared').AgentGoal[]> =>
    ipcRenderer.invoke(IpcChannels.harness.listGoals, { sessionId, includeDone }),
  harnessSetGoal: (
    sessionId: string,
    title: string,
    detail?: string,
  ): Promise<import('@shared').AgentGoal> =>
    ipcRenderer.invoke(IpcChannels.harness.setGoal, { sessionId, title, detail }),
  harnessReloadPlugins: (): Promise<{ plugins: import('@shared').HarnessPluginInfo[]; tools: unknown[] }> =>
    ipcRenderer.invoke(IpcChannels.harness.reloadPlugins),
  harnessListPlugins: (): Promise<import('@shared').HarnessPluginInfo[]> =>
    ipcRenderer.invoke(IpcChannels.harness.listPlugins),
  harnessGetSandboxRoot: (): Promise<string> => ipcRenderer.invoke(IpcChannels.harness.getSandboxRoot),
  harnessSetSandboxRoot: (path: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.harness.setSandboxRoot, path),
  harnessPickSandboxRoot: (): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.harness.pickSandboxRoot),
  harnessClearSandboxRoot: (): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.harness.clearSandboxRoot),
  harnessGetPluginsDir: (): Promise<string> => ipcRenderer.invoke(IpcChannels.harness.getPluginsDir),
  harnessGetDiagnostics: (path?: string): Promise<import('@shared').SandboxDiagnostic[]> =>
    ipcRenderer.invoke(IpcChannels.harness.getDiagnostics, path),
  harnessListPluginCatalog: (): Promise<import('@shared').HarnessPluginCatalogEntry[]> =>
    ipcRenderer.invoke(IpcChannels.harness.listPluginCatalog),
  harnessInstallPlugin: (payload: {
    bundledId?: string
    sourcePath?: string
  }): Promise<import('@shared').HarnessPluginInfo> =>
    ipcRenderer.invoke(IpcChannels.harness.installPlugin, payload),
  harnessPickInstallPlugin: (): Promise<import('@shared').HarnessPluginInfo | null> =>
    ipcRenderer.invoke(IpcChannels.harness.pickInstallPlugin),
  harnessOpenPluginsDir: (): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.harness.openPluginsDir),
  harnessPtyCreate: (
    cols: number,
    rows: number,
    onEvent: (ev: import('@shared').HarnessPtyEvent) => void,
  ): Promise<import('@shared').HarnessPtySessionInfo> => {
    const handler = (_event: IpcRendererEvent, ev: import('@shared').HarnessPtyEvent): void => {
      onEvent(ev)
    }
    ipcRenderer.on(IpcChannels.harness.ptyEvent, handler)
    return ipcRenderer
      .invoke(IpcChannels.harness.ptyCreate, { cols, rows })
      .then((info: import('@shared').HarnessPtySessionInfo) => info)
      .catch((err) => {
        ipcRenderer.removeListener(IpcChannels.harness.ptyEvent, handler)
        throw err
      })
  },
  harnessPtyWrite: (ptyId: string, data: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.harness.ptyWrite, { ptyId, data }),
  harnessPtyResize: (ptyId: string, cols: number, rows: number): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.harness.ptyResize, { ptyId, cols, rows }),
  harnessPtyKill: (ptyId: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.harness.ptyKill, ptyId),
  harnessGetCordisStack: (): Promise<import('@shared').CordisStackSnapshot> =>
    ipcRenderer.invoke(IpcChannels.harness.getCordisStack),
  harnessReloadCordisStack: (): Promise<import('@shared').CordisStackSnapshot> =>
    ipcRenderer.invoke(IpcChannels.harness.reloadCordisStack),
  harnessOpenCordisRoot: (): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.harness.openCordisRoot),
  harnessGetSandboxBackend: (): Promise<import('@shared').SandboxBackendInfo> =>
    ipcRenderer.invoke(IpcChannels.harness.getSandboxBackend),
  harnessLspDefinition: (
    path: string,
    line: number,
    column: number,
  ): Promise<import('@shared').LspLocation | null> =>
    ipcRenderer.invoke(IpcChannels.harness.lspDefinition, { path, line, column }),
  harnessLspCompletion: (
    path: string,
    line: number,
    column: number,
  ): Promise<import('@shared').LspCompletionItem[]> =>
    ipcRenderer.invoke(IpcChannels.harness.lspCompletion, { path, line, column }),
  harnessGetDshWebUrl: (): Promise<string> => ipcRenderer.invoke(IpcChannels.harness.getDshWebUrl),
  harnessSetDshWebUrl: (url: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.harness.setDshWebUrl, url),
  harnessGetEmbeddedDshWebPreferred: (): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.harness.getEmbeddedDshWebPreferred),
  harnessSetEmbeddedDshWebPreferred: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.harness.setEmbeddedDshWebPreferred, enabled),
  harnessListCordisProfiles: (): Promise<string[]> =>
    ipcRenderer.invoke(IpcChannels.harness.listCordisProfiles),
  harnessListCordisBundles: (): Promise<string[]> =>
    ipcRenderer.invoke(IpcChannels.harness.listCordisBundles),
  harnessSaveCordisSettings: (
    payload: import('@shared').SaveCordisSettingsInput,
  ): Promise<import('@shared').CordisStackSnapshot> =>
    ipcRenderer.invoke(IpcChannels.harness.saveCordisSettings, payload),
  harnessCreateCordisProfile: (
    payload: import('@shared').CreateCordisProfileInput,
  ): Promise<string> => ipcRenderer.invoke(IpcChannels.harness.createCordisProfile, payload),
  harnessCreateCordisBundle: (
    payload: import('@shared').CreateCordisBundleInput,
  ): Promise<string> => ipcRenderer.invoke(IpcChannels.harness.createCordisBundle, payload),
  reembedKnowledgeDocument: (id: string): Promise<import('@shared').KnowledgeDocument> =>
    ipcRenderer.invoke(IpcChannels.knowledge.reembedDocument, id),
  reembedKnowledgeCollection: (
    collectionId?: string,
  ): Promise<{ ok: number; failed: number; errors: string[]; skipped?: number }> =>
    ipcRenderer.invoke(IpcChannels.knowledge.reembedCollection, collectionId),
  reembedKnowledgeFailed: (
    collectionId?: string,
  ): Promise<{ ok: number; failed: number; errors: string[]; skipped?: number }> =>
    ipcRenderer.invoke(IpcChannels.knowledge.reembedFailed, collectionId),
  generateImage: (payload: {
    prompt: string
    size?: string
    model?: string
    style?: string
    quality?: string
  }): Promise<{
    ok: boolean
    url?: string
    error?: string
    revisedPrompt?: string
    providerId?: string
    model?: string
  }> =>
    ipcRenderer.invoke(IpcChannels.image.generate, payload),
  getImageToolsSettings: (): Promise<import('@shared').ImageToolsSettings> =>
    ipcRenderer.invoke(IpcChannels.imageTools.getSettings),
  setImageToolsSettings: (
    partial: Partial<import('@shared').ImageToolsSettings>,
  ): Promise<import('@shared').ImageToolsSettings> =>
    ipcRenderer.invoke(IpcChannels.imageTools.setSettings, partial),
  listImageVisionModels: (): Promise<import('@shared').VisionModelState[]> =>
    ipcRenderer.invoke(IpcChannels.imageTools.listModels),
  installImageVisionModel: (id: string): Promise<import('@shared').VisionModelState> =>
    ipcRenderer.invoke(IpcChannels.imageTools.installModel, id),
  importImageVisionModel: (id: string): Promise<import('@shared').VisionModelState | null> =>
    ipcRenderer.invoke(IpcChannels.imageTools.importModel, id),
  uninstallImageVisionModel: (id: string): Promise<import('@shared').VisionModelState> =>
    ipcRenderer.invoke(IpcChannels.imageTools.uninstallModel, id),
  openImageVisionModelsDir: (): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.imageTools.openModelsDir),
  pickImageVisionModelsRoot: (): Promise<import('@shared').ImageToolsSettings | null> =>
    ipcRenderer.invoke(IpcChannels.imageTools.pickModelsRoot),
  onImageVisionInstallProgress: (
    callback: (payload: import('@shared').VisionInstallProgress) => void,
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: import('@shared').VisionInstallProgress) => {
      callback(payload)
    }
    ipcRenderer.on(IpcChannels.imageTools.installProgress, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.imageTools.installProgress, handler)
    }
  },
  getLocalLlmSnapshot: (): Promise<import('@shared').LocalLlmSnapshot> =>
    ipcRenderer.invoke(IpcChannels.localLlm.getSnapshot),
  openLocalLlmRuntimeInstall: (runtime?: 'ollama' | 'lmstudio'): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.localLlm.openRuntimeInstall, runtime),
  openLocalLlmLibrary: (model?: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.localLlm.openLibrary, model),
  openLocalLlmFamilyInstall: (
    familyId: string,
  ): Promise<{ ok: boolean; url?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.localLlm.openFamilyInstall, familyId),
  startLocalLlmRuntime: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.localLlm.startRuntime),
  listLocalLlmRemoteTags: (
    ollamaModel: string,
  ): Promise<{ ok: boolean; tags: import('@shared').LocalLlmRemoteTag[]; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.localLlm.listRemoteTags, ollamaModel),
  pullLocalLlmModel: (model: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.localLlm.pullModel, model),
  cancelLocalLlmPull: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IpcChannels.localLlm.cancelPull),
  deleteLocalLlmModel: (model: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.localLlm.deleteModel, model),
  showLocalLlmModel: (model: string): Promise<import('@shared').LocalLlmModelDetails | null> =>
    ipcRenderer.invoke(IpcChannels.localLlm.showModel, model),
  unloadLocalLlmModel: (model: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.localLlm.unloadModel, model),
  applyLocalLlmToWorkbench: (
    preferredModel?: string,
  ): Promise<{ ok: boolean; providerId: string; model: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.localLlm.applyToWorkbench, preferredModel),
  onLocalLlmPullProgress: (
    callback: (payload: import('@shared').LocalLlmPullProgress) => void,
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: import('@shared').LocalLlmPullProgress,
    ) => {
      callback(payload)
    }
    ipcRenderer.on(IpcChannels.localLlm.pullProgress, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.localLlm.pullProgress, handler)
    }
  },
  runImageSmart: (
    payload: import('@shared').ImageSmartRunRequest,
  ): Promise<import('@shared').ImageSmartRunResult> =>
    ipcRenderer.invoke(IpcChannels.imageTools.runSmart, payload),
  readImageVisionModelWeight: (
    id: string,
  ): Promise<
    | { ok: true; modelId: string; fileName: string; data: Uint8Array }
    | { ok: false; error: string }
  > => ipcRenderer.invoke(IpcChannels.imageTools.readModelWeight, id),
  getImageVisionModelPublicPath: (id: string): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.imageTools.getModelPublicPath, id),
  saveImageFile: (
    payload: import('@shared').ImageSaveRequest,
  ): Promise<import('@shared').ImageSaveResult> =>
    ipcRenderer.invoke(IpcChannels.imageTools.saveImage, payload),
  upsertCustomVisionEngine: (payload: {
    id?: string
    name: string
    task: import('@shared').ImageSmartTask
    kind: 'onnx' | 'http'
    enabled?: boolean
    onnxSourcePath?: string
    endpointUrl?: string
    apiKey?: string
    notes?: string
  }): Promise<import('@shared').ImageToolsSettings> =>
    ipcRenderer.invoke(IpcChannels.imageTools.upsertCustomEngine, payload),
  removeCustomVisionEngine: (id: string): Promise<import('@shared').ImageToolsSettings> =>
    ipcRenderer.invoke(IpcChannels.imageTools.removeCustomEngine, id),
  pickCustomVisionOnnx: (): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.imageTools.pickCustomOnnx),
  getDebugActivity: (
    query?: import('@shared').ActivityLogQuery,
  ): Promise<import('@shared').ActivityLogSnapshot> =>
    ipcRenderer.invoke(IpcChannels.debug.getActivity, query),
  appendDebugActivity: (
    input: import('@shared').ActivityLogAppendInput,
  ): Promise<import('@shared').ActivityLogEntry> =>
    ipcRenderer.invoke(IpcChannels.debug.appendActivity, input),
  clearDebugActivity: (): Promise<import('@shared').ActivityLogSnapshot> =>
    ipcRenderer.invoke(IpcChannels.debug.clearActivity),
  openDebugMainLog: (): Promise<string> => ipcRenderer.invoke(IpcChannels.debug.openMainLog),
  readDebugMainLogTail: (maxBytes?: number): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.debug.readMainLogTail, maxBytes),
  onDebugActivityAppended: (
    callback: (entry: import('@shared').ActivityLogEntry) => void,
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      entry: import('@shared').ActivityLogEntry,
    ) => {
      callback(entry)
    }
    ipcRenderer.on(IpcChannels.debug.activityAppended, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.debug.activityAppended, handler)
    }
  },
  pickAudioFile: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.media.pickAudioFile),
  transcribeAudio: (payload: {
    filePath: string
    model?: string
    language?: string
  }): Promise<{ ok: boolean; text?: string; url?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.media.transcribe, payload),
  generateVideo: (payload: {
    prompt: string
    model?: string
    durationSec?: number
    aspectRatio?: string
    resolution?: string
  }): Promise<{ ok: boolean; text?: string; url?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.media.generateVideo, payload),
  extractDocument: (payload: {
    fileName: string
    dataBase64: string
    mime?: string
  }): Promise<{ ok: boolean; text?: string; mime?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.tools.extractDocument, payload),
  saveTextFile: (payload: {
    content: string
    defaultName?: string
    extensions?: string[]
  }): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.tools.saveTextFile, payload),
  saveMediaFile: (payload: {
    url: string
    defaultName?: string
  }): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.tools.saveMediaFile, payload),
  checkVideoFfmpeg: (): Promise<{
    ok: boolean
    ffmpeg?: string
    ffprobe?: string
    error?: string
  }> => ipcRenderer.invoke(IpcChannels.videoTools.checkFfmpeg),
  pickLocalVideo: (): Promise<{
    ok: boolean
    cancelled?: boolean
    path?: string
    previewUrl?: string
    name?: string
    size?: number
    probe?: {
      ok: boolean
      duration?: number
      width?: number
      height?: number
      videoCodec?: string
      audioCodec?: string
      bitrate?: number
      error?: string
    }
    error?: string
  }> => ipcRenderer.invoke(IpcChannels.videoTools.pickVideo),
  importLocalVideo: (payload: {
    fileName: string
    dataBase64: string
  }): Promise<{
    ok: boolean
    path?: string
    previewUrl?: string
    name?: string
    size?: number
    probe?: {
      ok: boolean
      duration?: number
      width?: number
      height?: number
      videoCodec?: string
      audioCodec?: string
      bitrate?: number
      error?: string
    }
    error?: string
  }> => ipcRenderer.invoke(IpcChannels.videoTools.importVideo, payload),
  processLocalVideo: (payload: {
    inputPath: string
    startSec?: number
    endSec?: number
    mute?: boolean
    format: 'mp4' | 'webm' | 'mov' | 'gif' | 'mp3' | 'wav'
    maxEdge?: number
    speed?: number
    rotateDeg?: 0 | 90 | 180 | 270
    watermarkText?: string
    watermarkPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
    watermarkImagePath?: string
    watermarkImageScale?: number
    subtitlePath?: string
    subtitleFontSize?: number
    subtitleColor?: string
    brightness?: number
    contrast?: number
    saturation?: number
    volume?: number
    fadeInSec?: number
    fadeOutSec?: number
  }): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.videoTools.process, payload),
  concatLocalVideos: (payload?: {
    inputPaths?: string[]
  }): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.videoTools.concat, payload),
  renderMultiTrackVideo: (payload: {
    clips: Array<{
      path: string
      kind: 'video' | 'audio' | 'image'
      track: 'V1' | 'A1' | 'OV1'
      inSec?: number
      outSec?: number
      startSec?: number
      volume?: number
    }>
    width?: number
    height?: number
    fps?: number
    muteVideoAudio?: boolean
  }): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.videoTools.multiTrack, payload),
  pickVideoImage: (): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.videoTools.pickImage),
  pickVideoSubtitle: (): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.videoTools.pickSubtitle),
  pickLocalAudio: (): Promise<{
    ok: boolean
    cancelled?: boolean
    path?: string
    previewUrl?: string
    name?: string
    size?: number
    probe?: {
      ok: boolean
      duration?: number
      audioCodec?: string
      bitrate?: number
      sampleRate?: number
      channels?: number
      error?: string
    }
    error?: string
  }> => ipcRenderer.invoke(IpcChannels.audioTools.pickAudio),
  importLocalAudio: (payload: {
    fileName: string
    dataBase64: string
  }): Promise<{
    ok: boolean
    path?: string
    previewUrl?: string
    name?: string
    size?: number
    probe?: {
      ok: boolean
      duration?: number
      audioCodec?: string
      bitrate?: number
      sampleRate?: number
      channels?: number
      error?: string
    }
    error?: string
  }> => ipcRenderer.invoke(IpcChannels.audioTools.importAudio, payload),
  processLocalAudio: (payload: {
    inputPath: string
    startSec?: number
    endSec?: number
    format: 'mp3' | 'wav' | 'aac' | 'm4a' | 'ogg' | 'flac'
    volume?: number
    fadeInSec?: number
    fadeOutSec?: number
    normalize?: boolean
    speed?: number
  }): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.audioTools.process, payload),
  concatLocalAudios: (payload?: {
    inputPaths?: string[]
    format?: 'mp3' | 'wav' | 'aac' | 'm4a' | 'ogg' | 'flac'
  }): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.audioTools.concat, payload),
  mergePdfs: (payload?: {
    paths?: string[]
  }): Promise<{
    ok: boolean
    path?: string
    error?: string
    pageCount?: number
  }> => ipcRenderer.invoke(IpcChannels.tools.mergePdfs, payload),
  splitPdf: (payload?: {
    path?: string
    ranges?: string
  }): Promise<{
    ok: boolean
    path?: string
    error?: string
    pageCount?: number
  }> => ipcRenderer.invoke(IpcChannels.tools.splitPdf, payload),
  exportTextPdf: (payload: {
    content: string
    defaultName?: string
  }): Promise<{
    ok: boolean
    path?: string
    error?: string
    pageCount?: number
  }> => ipcRenderer.invoke(IpcChannels.tools.exportPdf, payload),
  exportTextDocx: (payload: {
    content: string
    defaultName?: string
  }): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.tools.exportDocx, payload),
  compressPdf: (payload?: {
    path?: string
    jpegQuality?: number
  }): Promise<{
    ok: boolean
    path?: string
    error?: string
    pageCount?: number
    bytesBefore?: number
    bytesAfter?: number
  }> => ipcRenderer.invoke(IpcChannels.tools.compressPdf, payload),
  encryptPdf: (payload: {
    path?: string
    userPassword: string
    ownerPassword?: string
    allowPrinting?: boolean
    allowCopying?: boolean
  }): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.tools.encryptPdf, payload),
  checkLibreOffice: (): Promise<{
    ok: boolean
    path?: string
    version?: string
    error?: string
    customPath?: string
    source?: 'custom' | 'auto' | 'none'
  }> => ipcRenderer.invoke(IpcChannels.tools.checkLibreOffice),
  convertLibreOffice: (payload: {
    inputPath?: string
    target: 'pdf' | 'docx' | 'odt' | 'pptx' | 'odp' | 'xlsx' | 'ods' | 'html' | 'txt'
  }): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.tools.convertLibreOffice, payload),
  pickLibreOffice: (): Promise<{
    ok: boolean
    path?: string
    version?: string
    error?: string
    customPath?: string
    source?: 'custom' | 'auto' | 'none'
  }> => ipcRenderer.invoke(IpcChannels.tools.pickLibreOffice),
  clearLibreOffice: (): Promise<{
    ok: boolean
    path?: string
    version?: string
    error?: string
    customPath?: string
    source?: 'custom' | 'auto' | 'none'
  }> => ipcRenderer.invoke(IpcChannels.tools.clearLibreOffice),
  openLibreOfficeDownload: (): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.tools.openLibreOfficeDownload),
  crawlUrl: (payload: {
    url: string
    mode?: 'auto' | 'text' | 'tables' | 'links'
    maxChars?: number
    encoding?: string
    referer?: string
  }): Promise<{
    ok: boolean
    url: string
    finalUrl?: string
    status?: number
    contentType?: string | null
    encoding?: string
    title?: string
    text?: string
    tables?: Array<{ headers: string[]; rows: string[][]; caption?: string }>
    links?: Array<{ href: string; text: string }>
    truncated?: boolean
    retrievedAt: string
    error?: string
  }> => ipcRenderer.invoke(IpcChannels.tools.crawlUrl, payload),
  onVideoProcessProgress: (
    callback: (payload: { ratio: number; label: string }) => void,
  ): (() => void) => {
    const handler = (_: unknown, payload: { ratio: number; label: string }): void => {
      callback(payload)
    }
    ipcRenderer.on(IpcChannels.videoTools.progress, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.videoTools.progress, handler)
    }
  },
  onAudioProcessProgress: (
    callback: (payload: { ratio: number; label: string }) => void,
  ): (() => void) => {
    const handler = (_: unknown, payload: { ratio: number; label: string }): void => {
      callback(payload)
    }
    ipcRenderer.on(IpcChannels.audioTools.progress, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.audioTools.progress, handler)
    }
  },
  generateMusic: (payload: {
    prompt: string
    model?: string
    durationSec?: number
    style?: string
    instrumental?: boolean
  }): Promise<{ ok: boolean; text?: string; url?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.media.generateMusic, payload),
  getMediaCapabilities: (): Promise<import('@shared').MediaCapabilitiesSnapshot> =>
    ipcRenderer.invoke(IpcChannels.media.getCapabilities),
  listKnowledgeDocuments: (collectionId?: string): Promise<import('@shared').KnowledgeDocument[]> =>
    ipcRenderer.invoke(IpcChannels.knowledge.listDocuments, collectionId),
  ingestKnowledgeText: (
    payload: import('@shared').KnowledgeIngestInput,
  ): Promise<import('@shared').KnowledgeDocument> =>
    ipcRenderer.invoke(IpcChannels.knowledge.ingestText, payload),
  ingestKnowledgeFile: (
    payload: import('@shared').KnowledgeIngestFileInput,
  ): Promise<import('@shared').KnowledgeDocument> =>
    ipcRenderer.invoke(IpcChannels.knowledge.ingestFile, payload),
  deleteKnowledgeDocument: (id: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.knowledge.deleteDocument, id),
  getKnowledgeDocumentFile: (id: string): Promise<import('@shared').KnowledgeDocumentFile | null> =>
    ipcRenderer.invoke(IpcChannels.knowledge.getDocumentFile, id),
  searchKnowledge: (payload: {
    query: string
    limit?: number
    collectionId?: string
  }): Promise<import('@shared').KnowledgeSearchResult> =>
    ipcRenderer.invoke(IpcChannels.knowledge.search, payload),
  listKnowledgeCollections: (): Promise<import('@shared').KnowledgeCollection[]> =>
    ipcRenderer.invoke(IpcChannels.knowledge.listCollections),
  createKnowledgeCollection: (payload: {
    name: string
    description?: string
    color?: string
    parentId?: string | null
  }): Promise<import('@shared').KnowledgeCollection> =>
    ipcRenderer.invoke(IpcChannels.knowledge.createCollection, payload),
  renameKnowledgeCollection: (payload: {
    id: string
    name: string
  }): Promise<import('@shared').KnowledgeCollection | null> =>
    ipcRenderer.invoke(IpcChannels.knowledge.renameCollection, payload),
  deleteKnowledgeCollection: (
    id: string,
    opts?: { mode?: 'cascade' | 'move' },
  ): Promise<boolean> => ipcRenderer.invoke(IpcChannels.knowledge.deleteCollection, id, opts),
  getKnowledgeSettings: (): Promise<import('@shared').KnowledgeSettings> =>
    ipcRenderer.invoke(IpcChannels.knowledge.getSettings),
  setKnowledgeSettings: (
    partial: Partial<import('@shared').KnowledgeSettings>,
  ): Promise<import('@shared').KnowledgeSettings> =>
    ipcRenderer.invoke(IpcChannels.knowledge.setSettings, partial),
  getKnowledgeStats: (): Promise<{
    collections: number
    documents: number
    chunks: number
    embeddings: number
  }> => ipcRenderer.invoke(IpcChannels.knowledge.stats),
  getMcpSettings: (): Promise<import('@shared').McpSettings> =>
    ipcRenderer.invoke(IpcChannels.mcp.getSettings),
  setMcpSettings: (next: import('@shared').McpSettings): Promise<import('@shared').McpSettings> =>
    ipcRenderer.invoke(IpcChannels.mcp.setSettings, next),
  listMcpTools: (): Promise<import('@shared').LlmToolSpec[]> =>
    ipcRenderer.invoke(IpcChannels.mcp.listTools),
  getMcpStatus: (): Promise<import('@shared').McpStatusSnapshot> =>
    ipcRenderer.invoke(IpcChannels.mcp.getStatus),
  refreshMcpStatus: (): Promise<import('@shared').McpStatusSnapshot> =>
    ipcRenderer.invoke(IpcChannels.mcp.refreshStatus),
  getStocksWatchlist: (): Promise<WatchlistItem[]> => ipcRenderer.invoke(IpcChannels.stocks.getWatchlist),
  addStocksWatchlistItem: (payload: { market: StockMarket; symbol: string; name?: string; note?: string }): Promise<WatchlistItem> =>
    ipcRenderer.invoke(IpcChannels.stocks.addWatchlistItem, payload),
  removeStocksWatchlistItem: (payload: { market: StockMarket; symbol: string }): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.stocks.removeWatchlistItem, payload),
  getStocksScannerPool: (): Promise<ScannerPoolItem[]> => ipcRenderer.invoke(IpcChannels.stocks.getScannerPool),
  addStocksScannerPoolItem: (payload: { market: StockMarket; symbol: string; name?: string }): Promise<ScannerPoolItem> =>
    ipcRenderer.invoke(IpcChannels.stocks.addScannerPoolItem, payload),
  removeStocksScannerPoolItem: (payload: { market: StockMarket; symbol: string }): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.stocks.removeScannerPoolItem, payload),
  importStocksWatchlistCsv: (): Promise<{ ok: boolean; count?: number; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.stocks.importWatchlistCsv),
  exportStocksWatchlistCsv: (): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.stocks.exportWatchlistCsv),
  importStocksScannerCsv: (): Promise<{ ok: boolean; count?: number; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.stocks.importScannerCsv),
  exportStocksScannerCsv: (): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.stocks.exportScannerCsv),
  generateStocksReport: (): Promise<StocksReport> => ipcRenderer.invoke(IpcChannels.stocks.generateReport),
  getLatestStocksReport: (): Promise<StocksReport | null> => ipcRenderer.invoke(IpcChannels.stocks.getLatestReport),
  listStocksReports: (limit?: number): Promise<StocksReportSummary[]> =>
    ipcRenderer.invoke(IpcChannels.stocks.listReports, limit),
  getStocksReportByDate: (date: string): Promise<StocksReport | null> =>
    ipcRenderer.invoke(IpcChannels.stocks.getReportByDate, date),
  getStockQuote: (payload: { market: StockMarket; symbol: string; name?: string }): Promise<StockQuoteDetail> =>
    ipcRenderer.invoke(IpcChannels.stocks.getQuote, payload),
  refreshStocksScanner: (): Promise<{
    ok: boolean
    added: number
    scanned: number
    errors: string[]
    meta?: { newsProbed: number }
  }> => ipcRenderer.invoke(IpcChannels.stocks.refreshScanner),
  listSkills: (): Promise<
    Array<{
      id: string
      name: string
      description: string
      source: string
      sourceRef?: string
      prompt: string
    }>
  > => ipcRenderer.invoke(IpcChannels.skills.list),
  listSkillCatalogs: (): Promise<Array<{ id: string; name: string; url: string; hint: string }>> =>
    ipcRenderer.invoke(IpcChannels.skills.catalogs),
  installSkillFromGithub: (ref: string): Promise<{
    id: string
    name: string
    description: string
    prompt: string
  }> => ipcRenderer.invoke(IpcChannels.skills.installGithub, ref),
  installSkillFromMarkdown: (markdown: string): Promise<{
    id: string
    name: string
    description: string
    prompt: string
  }> => ipcRenderer.invoke(IpcChannels.skills.installMarkdown, markdown),
  uninstallSkill: (id: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.skills.uninstall, id),
  getSchedulesSnapshot: (): Promise<import('@shared').SchedulesSnapshot> =>
    ipcRenderer.invoke(IpcChannels.schedules.getSnapshot),
  listScheduleTasks: (): Promise<import('@shared').ScheduleTask[]> =>
    ipcRenderer.invoke(IpcChannels.schedules.listTasks),
  upsertScheduleTask: (
    input: import('@shared').UpsertScheduleTaskInput,
  ): Promise<import('@shared').ScheduleTask> =>
    ipcRenderer.invoke(IpcChannels.schedules.upsertTask, input),
  deleteScheduleTask: (id: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.schedules.deleteTask, id),
  setScheduleTaskEnabled: (id: string, enabled: boolean): Promise<import('@shared').ScheduleTask | null> =>
    ipcRenderer.invoke(IpcChannels.schedules.setTaskEnabled, { id, enabled }),
  runScheduleTaskNow: (id: string): Promise<import('@shared').SchedulesSnapshot> =>
    ipcRenderer.invoke(IpcChannels.schedules.runTaskNow, id),
  getInboxSnapshot: (): Promise<import('@shared').InboxSnapshot> =>
    ipcRenderer.invoke(IpcChannels.inbox.getSnapshot),
  listInboxItems: (): Promise<import('@shared').InboxItem[]> =>
    ipcRenderer.invoke(IpcChannels.inbox.list),
  markInboxRead: (id: string): Promise<import('@shared').InboxItem | null> =>
    ipcRenderer.invoke(IpcChannels.inbox.markRead, id),
  markAllInboxRead: (): Promise<number> => ipcRenderer.invoke(IpcChannels.inbox.markAllRead),
  removeInboxItem: (id: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.inbox.remove, id),
  clearInbox: (): Promise<number> => ipcRenderer.invoke(IpcChannels.inbox.clear),
  onInboxAppended: (cb: (item: import('@shared').InboxItem) => void): (() => void) => {
    const handler = (_: unknown, item: import('@shared').InboxItem): void => cb(item)
    ipcRenderer.on(IpcChannels.inbox.appended, handler)
    return () => ipcRenderer.removeListener(IpcChannels.inbox.appended, handler)
  },
  onInboxOpen: (cb: (payload: { id: string }) => void): (() => void) => {
    const handler = (_: unknown, payload: { id: string }): void => cb(payload)
    ipcRenderer.on(IpcChannels.inbox.open, handler)
    return () => ipcRenderer.removeListener(IpcChannels.inbox.open, handler)
  },
}

contextBridge.exposeInMainWorld('treasureChest', api)

export type TreasureChestApi = typeof api
