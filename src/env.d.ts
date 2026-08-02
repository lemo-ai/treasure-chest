import type {
  AppLocale,
  AppSettingsSnapshot,
  BirthProfile,
  CalendarMode,
  DesktopWidgetSettings,
  DesktopWidgetView,
  LaunchBehavior,
  NotificationSettings,
  FortuneSettings,
  DailyFortune,
  FortuneAiConnectionTestInput,
  FortuneAiConnectionTestResponse,
  FortuneAiResponse,
  LlmChatRequest,
  LlmChatResponse,
  StockMarket,
  ScannerPoolItem,
  StocksReport,
  StocksReportSummary,
  StocksSettings,
  StockQuoteDetail,
  WatchlistItem,
  ThemeMode,
} from '@shared'

interface TreasureChestApi {
  getVersion: () => Promise<string>
  getTheme: () => Promise<ThemeMode>
  setTheme: (theme: ThemeMode) => Promise<ThemeMode>
  getLocale: () => Promise<AppLocale>
  setLocale: (locale: AppLocale) => Promise<AppLocale>
  getSettingsSnapshot: () => Promise<AppSettingsSnapshot>
  getDesktopWidget: () => Promise<DesktopWidgetView>
  setDesktopWidget: (partial: Partial<DesktopWidgetSettings>) => Promise<DesktopWidgetView>
  pickDialBackground: () => Promise<DesktopWidgetView>
  clearDialBackground: () => Promise<DesktopWidgetView>
  selectDialBackground: (path: string) => Promise<DesktopWidgetView>
  deleteDialBackground: (path: string) => Promise<DesktopWidgetView>
  onDesktopWidgetUpdated: (listener: (settings: DesktopWidgetView) => void) => () => void
  openCalendarWindow: () => Promise<boolean>
  closeCalendarWindow: () => Promise<boolean>
  showMainWindow: () => Promise<boolean>
  startDialDrag: () => void
  endDialDrag: () => void
  getCalendarMode: () => Promise<CalendarMode>
  setCalendarMode: (mode: CalendarMode) => Promise<CalendarMode>
  getBirthProfile: () => Promise<BirthProfile | null>
  saveBirthProfile: (profile: BirthProfile) => Promise<BirthProfile>
  clearBirthProfile: () => Promise<boolean>
  exportBackup: () => Promise<{ ok: boolean; path?: string; error?: string }>
  importBackup: () => Promise<{ ok: boolean; error?: string }>
  getLaunchAtLogin: () => Promise<{ configured: boolean; system: boolean }>
  setLaunchAtLogin: (enabled: boolean) => Promise<{ configured: boolean; system: boolean }>
  setLaunchBehavior: (behavior: LaunchBehavior) => Promise<LaunchBehavior>
  setNotifications: (partial: Partial<NotificationSettings>) => Promise<NotificationSettings>
  setFortuneSettings: (partial: Partial<FortuneSettings>) => Promise<FortuneSettings>
  setStocksSettings: (partial: Partial<StocksSettings>) => Promise<StocksSettings>
  generateFortuneAiAnalysis: (fortune: DailyFortune, locale: string) => Promise<FortuneAiResponse>
  testFortuneAiConnection: (payload: FortuneAiConnectionTestInput) => Promise<FortuneAiConnectionTestResponse>
  workbenchChat: (payload: LlmChatRequest) => Promise<LlmChatResponse>
  workbenchChatStream: (
    payload: LlmChatRequest,
    onDelta: (text: string) => void,
    onStatus?: (text: string) => void,
    onCitations?: (citations: import('@shared').KnowledgeCitation[]) => void,
    onToolStep?: (step: import('@shared').LlmToolStep) => void,
    onToolApproval?: (request: import('@shared').ToolApprovalRequest) => void,
  ) => Promise<LlmChatResponse>
  resolveToolApproval: (payload: {
    streamId: string
    toolCallId: string
    approved: boolean
  }) => Promise<boolean>
  listKnowledgeDocuments: (collectionId?: string) => Promise<import('@shared').KnowledgeDocument[]>
  ingestKnowledgeText: (
    payload: import('@shared').KnowledgeIngestInput,
  ) => Promise<import('@shared').KnowledgeDocument>
  ingestKnowledgeFile: (
    payload: import('@shared').KnowledgeIngestFileInput,
  ) => Promise<import('@shared').KnowledgeDocument>
  deleteKnowledgeDocument: (id: string) => Promise<boolean>
  getKnowledgeDocumentFile: (id: string) => Promise<import('@shared').KnowledgeDocumentFile | null>
  searchKnowledge: (payload: {
    query: string
    limit?: number
    collectionId?: string
  }) => Promise<import('@shared').KnowledgeSearchResult>
  listKnowledgeCollections: () => Promise<import('@shared').KnowledgeCollection[]>
  createKnowledgeCollection: (payload: {
    name: string
    description?: string
    color?: string
  }) => Promise<import('@shared').KnowledgeCollection>
  renameKnowledgeCollection: (payload: {
    id: string
    name: string
  }) => Promise<import('@shared').KnowledgeCollection | null>
  deleteKnowledgeCollection: (id: string) => Promise<boolean>
  getKnowledgeSettings: () => Promise<import('@shared').KnowledgeSettings>
  setKnowledgeSettings: (
    partial: Partial<import('@shared').KnowledgeSettings>,
  ) => Promise<import('@shared').KnowledgeSettings>
  getKnowledgeStats: () => Promise<{
    collections: number
    documents: number
    chunks: number
    embeddings: number
  }>
  reembedKnowledgeDocument: (id: string) => Promise<import('@shared').KnowledgeDocument>
  reembedKnowledgeCollection: (
    collectionId?: string,
  ) => Promise<{ ok: number; failed: number; errors: string[] }>
  generateImage: (payload: {
    prompt: string
    size?: string
    model?: string
    style?: string
    quality?: string
  }) => Promise<{ ok: boolean; url?: string; error?: string; revisedPrompt?: string }>
  pickAudioFile: () => Promise<string | null>
  transcribeAudio: (payload: {
    filePath: string
    model?: string
    language?: string
  }) => Promise<{ ok: boolean; text?: string; url?: string; error?: string }>
  generateVideo: (payload: {
    prompt: string
    model?: string
    durationSec?: number
    aspectRatio?: string
    resolution?: string
  }) => Promise<{ ok: boolean; text?: string; url?: string; error?: string }>
  generateMusic: (payload: {
    prompt: string
    model?: string
    durationSec?: number
    style?: string
    instrumental?: boolean
  }) => Promise<{ ok: boolean; text?: string; url?: string; error?: string }>
  getMediaCapabilities: () => Promise<import('@shared').MediaCapabilitiesSnapshot>
  getMcpSettings: () => Promise<import('@shared').McpSettings>
  setMcpSettings: (next: import('@shared').McpSettings) => Promise<import('@shared').McpSettings>
  listMcpTools: () => Promise<import('@shared').LlmToolSpec[]>
  getMcpStatus: () => Promise<import('@shared').McpStatusSnapshot>
  refreshMcpStatus: () => Promise<import('@shared').McpStatusSnapshot>
  getStocksWatchlist: () => Promise<WatchlistItem[]>
  addStocksWatchlistItem: (payload: { market: StockMarket; symbol: string; name?: string; note?: string }) => Promise<WatchlistItem>
  removeStocksWatchlistItem: (payload: { market: StockMarket; symbol: string }) => Promise<boolean>
  getStocksScannerPool: () => Promise<ScannerPoolItem[]>
  addStocksScannerPoolItem: (payload: { market: StockMarket; symbol: string; name?: string }) => Promise<ScannerPoolItem>
  removeStocksScannerPoolItem: (payload: { market: StockMarket; symbol: string }) => Promise<boolean>
  importStocksWatchlistCsv: () => Promise<{ ok: boolean; count?: number; error?: string }>
  exportStocksWatchlistCsv: () => Promise<{ ok: boolean; path?: string; error?: string }>
  importStocksScannerCsv: () => Promise<{ ok: boolean; count?: number; error?: string }>
  exportStocksScannerCsv: () => Promise<{ ok: boolean; path?: string; error?: string }>
  generateStocksReport: () => Promise<StocksReport>
  getLatestStocksReport: () => Promise<StocksReport | null>
  listStocksReports: (limit?: number) => Promise<StocksReportSummary[]>
  getStocksReportByDate: (date: string) => Promise<StocksReport | null>
  getStockQuote: (payload: { market: StockMarket; symbol: string; name?: string }) => Promise<StockQuoteDetail>
  refreshStocksScanner: () => Promise<{
    ok: boolean
    added: number
    scanned: number
    errors: string[]
    meta?: { newsProbed: number }
  }>
  listSkills: () => Promise<
    Array<{
      id: string
      name: string
      description: string
      source: string
      sourceRef?: string
      prompt: string
    }>
  >
  listSkillCatalogs: () => Promise<Array<{ id: string; name: string; url: string; hint: string }>>
  installSkillFromGithub: (ref: string) => Promise<{
    id: string
    name: string
    description: string
    prompt: string
  }>
  installSkillFromMarkdown: (markdown: string) => Promise<{
    id: string
    name: string
    description: string
    prompt: string
  }>
  uninstallSkill: (id: string) => Promise<boolean>
}

declare global {
  interface Window {
    treasureChest: TreasureChestApi
  }
}

export {}
