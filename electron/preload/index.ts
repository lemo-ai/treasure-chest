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
} from '@shared'

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke(IpcChannels.app.getVersion),
  getTheme: (): Promise<ThemeMode> => ipcRenderer.invoke(IpcChannels.settings.getTheme),
  setTheme: (theme: ThemeMode): Promise<ThemeMode> =>
    ipcRenderer.invoke(IpcChannels.settings.setTheme, theme),
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
  ): Promise<LlmChatResponse> => {
    const streamId = `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
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
        finish({
          ok: false,
          error: ev.error,
          model: ev.model,
          providerName: ev.providerName,
          toolSteps: lastToolSteps,
        })
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
  }): Promise<boolean> => ipcRenderer.invoke(IpcChannels.workbench.resolveToolApproval, payload),
  reembedKnowledgeDocument: (id: string): Promise<import('@shared').KnowledgeDocument> =>
    ipcRenderer.invoke(IpcChannels.knowledge.reembedDocument, id),
  reembedKnowledgeCollection: (
    collectionId?: string,
  ): Promise<{ ok: number; failed: number; errors: string[] }> =>
    ipcRenderer.invoke(IpcChannels.knowledge.reembedCollection, collectionId),
  generateImage: (payload: {
    prompt: string
    size?: string
    model?: string
    style?: string
    quality?: string
  }): Promise<{ ok: boolean; url?: string; error?: string; revisedPrompt?: string }> =>
    ipcRenderer.invoke(IpcChannels.image.generate, payload),
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
  }): Promise<import('@shared').KnowledgeCollection> =>
    ipcRenderer.invoke(IpcChannels.knowledge.createCollection, payload),
  renameKnowledgeCollection: (payload: {
    id: string
    name: string
  }): Promise<import('@shared').KnowledgeCollection | null> =>
    ipcRenderer.invoke(IpcChannels.knowledge.renameCollection, payload),
  deleteKnowledgeCollection: (id: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.knowledge.deleteCollection, id),
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
}

contextBridge.exposeInMainWorld('treasureChest', api)

export type TreasureChestApi = typeof api
