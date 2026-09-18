/// <reference types="vite/client" />

import type {
  AppLocale,
  AppSettingsSnapshot,
  BirthProfile,
  CalendarMode,
  DesktopWidgetSettings,
  DesktopWidgetView,
  LaunchBehavior,
  NotificationSettings,
  DataSourceConfig,
  DataSourcesSettings,
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
  ThemeAccent,
  ScheduleTask,
  SchedulesSnapshot,
  UpsertScheduleTaskInput,
  InboxItem,
  InboxSnapshot,
} from '@shared'

interface TreasureChestApi {
  getVersion: () => Promise<string>
  getTheme: () => Promise<ThemeMode>
  setTheme: (theme: ThemeMode) => Promise<ThemeMode>
  getAccent: () => Promise<ThemeAccent>
  setAccent: (accent: ThemeAccent) => Promise<ThemeAccent>
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
  setDataSources: (partial: Partial<DataSourcesSettings>) => Promise<DataSourcesSettings>
  upsertDataSource: (input: DataSourceConfig) => Promise<DataSourceConfig>
  deleteDataSource: (id: string) => Promise<boolean>
  previewDataSource: (id: string) => Promise<{ ok: boolean; text?: string; error?: string }>
  testDataSource: (
    input: DataSourceConfig,
  ) => Promise<{ ok: boolean; text?: string; error?: string; latencyMs?: number }>
  pickDataSourceFile: () => Promise<string | null>
  listDataSourceDrivers: () => Promise<import('@shared').DataSourceDriverInfo[]>
  ensureDataSourceDriver: (
    kind: string,
    version?: string,
  ) => Promise<{ ok: boolean; status?: unknown; error?: string }>
  testDingTalkNotify: () => Promise<{ ok: boolean; error?: string }>
  testEmailNotify: () => Promise<{ ok: boolean; error?: string }>
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
    onSessionEvent?: (event: import('@shared').SessionEvent) => void,
    onStreamStart?: (streamId: string) => void,
  ) => Promise<LlmChatResponse>
  resolveToolApproval: (payload: {
    streamId: string
    toolCallId: string
    approved: boolean
  }) => Promise<boolean>
  cancelWorkbenchStream: (streamId: string) => Promise<boolean>
  harnessGetStore: () => Promise<import('@shared').HarnessStoreSnapshot>
  harnessMigrateLocal: (payload: import('@shared').MigrateLocalHarnessInput) => Promise<{ imported: number }>
  harnessCreateSession: (agentId: string, title: string, id?: string) => Promise<import('@shared').AgentSession>
  harnessRenameSession: (id: string, title: string) => Promise<boolean>
  harnessDeleteSession: (id: string) => Promise<boolean>
  harnessSetActiveSession: (id: string | null, agentId?: string) => Promise<boolean>
  harnessListMessages: (sessionId: string) => Promise<import('@shared').HarnessMessage[]>
  harnessAppendUserMessage: (sessionId: string, content: string) => Promise<import('@shared').HarnessMessage>
  harnessAppendSystemMessage: (sessionId: string, content: string) => Promise<import('@shared').HarnessMessage>
  harnessListEvents: (sessionId: string) => Promise<import('@shared').SessionEvent[]>
  harnessForkSession: (payload: import('@shared').ForkSessionInput) => Promise<import('@shared').AgentSession | null>
  harnessListGoals: (sessionId: string, includeDone?: boolean) => Promise<import('@shared').AgentGoal[]>
  harnessSetGoal: (sessionId: string, title: string, detail?: string) => Promise<import('@shared').AgentGoal>
  harnessReloadPlugins: () => Promise<{ plugins: import('@shared').HarnessPluginInfo[]; tools: unknown[] }>
  harnessListPlugins: () => Promise<import('@shared').HarnessPluginInfo[]>
  harnessGetSandboxRoot: () => Promise<string>
  harnessSetSandboxRoot: (path: string) => Promise<string>
  harnessPickSandboxRoot: () => Promise<string | null>
  harnessClearSandboxRoot: () => Promise<string>
  harnessGetPluginsDir: () => Promise<string>
  harnessGetDiagnostics: (path?: string) => Promise<import('@shared').SandboxDiagnostic[]>
  harnessListPluginCatalog: () => Promise<import('@shared').HarnessPluginCatalogEntry[]>
  harnessInstallPlugin: (payload: {
    bundledId?: string
    sourcePath?: string
  }) => Promise<import('@shared').HarnessPluginInfo>
  harnessPickInstallPlugin: () => Promise<import('@shared').HarnessPluginInfo | null>
  harnessOpenPluginsDir: () => Promise<string>
  harnessPtyCreate: (
    cols: number,
    rows: number,
    onEvent: (ev: import('@shared').HarnessPtyEvent) => void,
  ) => Promise<import('@shared').HarnessPtySessionInfo>
  harnessPtyWrite: (ptyId: string, data: string) => Promise<boolean>
  harnessPtyResize: (ptyId: string, cols: number, rows: number) => Promise<boolean>
  harnessPtyKill: (ptyId: string) => Promise<boolean>
  harnessGetCordisStack: () => Promise<import('@shared').CordisStackSnapshot>
  harnessReloadCordisStack: () => Promise<import('@shared').CordisStackSnapshot>
  harnessOpenCordisRoot: () => Promise<string>
  harnessGetSandboxBackend: () => Promise<import('@shared').SandboxBackendInfo>
  harnessLspDefinition: (
    path: string,
    line: number,
    column: number,
  ) => Promise<import('@shared').LspLocation | null>
  harnessLspCompletion: (
    path: string,
    line: number,
    column: number,
  ) => Promise<import('@shared').LspCompletionItem[]>
  harnessGetDshWebUrl: () => Promise<string>
  harnessSetDshWebUrl: (url: string) => Promise<string>
  harnessGetEmbeddedDshWebPreferred: () => Promise<boolean>
  harnessSetEmbeddedDshWebPreferred: (enabled: boolean) => Promise<boolean>
  harnessListCordisProfiles: () => Promise<string[]>
  harnessListCordisBundles: () => Promise<string[]>
  harnessSaveCordisSettings: (
    payload: import('@shared').SaveCordisSettingsInput,
  ) => Promise<import('@shared').CordisStackSnapshot>
  harnessCreateCordisProfile: (payload: import('@shared').CreateCordisProfileInput) => Promise<string>
  harnessCreateCordisBundle: (payload: import('@shared').CreateCordisBundleInput) => Promise<string>
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
    parentId?: string | null
  }) => Promise<import('@shared').KnowledgeCollection>
  renameKnowledgeCollection: (payload: {
    id: string
    name: string
  }) => Promise<import('@shared').KnowledgeCollection | null>
  deleteKnowledgeCollection: (
    id: string,
    opts?: { mode?: 'cascade' | 'move' },
  ) => Promise<boolean>
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
  }) => Promise<{
    ok: boolean
    url?: string
    error?: string
    revisedPrompt?: string
    providerId?: string
    model?: string
  }>
  getImageToolsSettings: () => Promise<import('@shared').ImageToolsSettings>
  setImageToolsSettings: (
    partial: Partial<import('@shared').ImageToolsSettings>,
  ) => Promise<import('@shared').ImageToolsSettings>
  listImageVisionModels: () => Promise<import('@shared').VisionModelState[]>
  installImageVisionModel: (id: string) => Promise<import('@shared').VisionModelState>
  importImageVisionModel: (id: string) => Promise<import('@shared').VisionModelState | null>
  uninstallImageVisionModel: (id: string) => Promise<import('@shared').VisionModelState>
  openImageVisionModelsDir: () => Promise<string>
  pickImageVisionModelsRoot: () => Promise<import('@shared').ImageToolsSettings | null>
  onImageVisionInstallProgress: (
    callback: (payload: import('@shared').VisionInstallProgress) => void,
  ) => () => void
  runImageSmart: (
    payload: import('@shared').ImageSmartRunRequest,
  ) => Promise<import('@shared').ImageSmartRunResult>
  readImageVisionModelWeight: (
    id: string,
  ) => Promise<
    | { ok: true; modelId: string; fileName: string; data: Uint8Array }
    | { ok: false; error: string }
  >
  getImageVisionModelPublicPath: (id: string) => Promise<string | null>
  saveImageFile: (
    payload: import('@shared').ImageSaveRequest,
  ) => Promise<import('@shared').ImageSaveResult>
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
  }) => Promise<import('@shared').ImageToolsSettings>
  removeCustomVisionEngine: (id: string) => Promise<import('@shared').ImageToolsSettings>
  pickCustomVisionOnnx: () => Promise<string | null>
  getDebugActivity: (
    query?: import('@shared').ActivityLogQuery,
  ) => Promise<import('@shared').ActivityLogSnapshot>
  appendDebugActivity: (
    input: import('@shared').ActivityLogAppendInput,
  ) => Promise<import('@shared').ActivityLogEntry>
  clearDebugActivity: () => Promise<import('@shared').ActivityLogSnapshot>
  openDebugMainLog: () => Promise<string>
  readDebugMainLogTail: (maxBytes?: number) => Promise<string>
  onDebugActivityAppended: (
    callback: (entry: import('@shared').ActivityLogEntry) => void,
  ) => () => void
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
  extractDocument: (payload: {
    fileName: string
    dataBase64: string
    mime?: string
  }) => Promise<{ ok: boolean; text?: string; mime?: string; error?: string }>
  saveTextFile: (payload: {
    content: string
    defaultName?: string
    extensions?: string[]
  }) => Promise<{ ok: boolean; path?: string; error?: string }>
  saveMediaFile: (payload: {
    url: string
    defaultName?: string
  }) => Promise<{ ok: boolean; path?: string; error?: string }>
  checkVideoFfmpeg: () => Promise<{
    ok: boolean
    ffmpeg?: string
    ffprobe?: string
    error?: string
  }>
  pickLocalVideo: () => Promise<{
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
  }>
  importLocalVideo: (payload: {
    fileName: string
    dataBase64: string
  }) => Promise<{
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
  }>
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
  }) => Promise<{ ok: boolean; path?: string; error?: string }>
  concatLocalVideos: (payload?: {
    inputPaths?: string[]
  }) => Promise<{ ok: boolean; path?: string; error?: string }>
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
  }) => Promise<{ ok: boolean; path?: string; error?: string }>
  pickVideoImage: () => Promise<string | null>
  pickVideoSubtitle: () => Promise<string | null>
  pickLocalAudio: () => Promise<{
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
  }>
  importLocalAudio: (payload: {
    fileName: string
    dataBase64: string
  }) => Promise<{
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
  }>
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
  }) => Promise<{ ok: boolean; path?: string; error?: string }>
  concatLocalAudios: (payload?: {
    inputPaths?: string[]
    format?: 'mp3' | 'wav' | 'aac' | 'm4a' | 'ogg' | 'flac'
  }) => Promise<{ ok: boolean; path?: string; error?: string }>
  mergePdfs: (payload?: {
    paths?: string[]
  }) => Promise<{ ok: boolean; path?: string; error?: string; pageCount?: number }>
  splitPdf: (payload?: {
    path?: string
    ranges?: string
  }) => Promise<{ ok: boolean; path?: string; error?: string; pageCount?: number }>
  exportTextPdf: (payload: {
    content: string
    defaultName?: string
  }) => Promise<{ ok: boolean; path?: string; error?: string; pageCount?: number }>
  exportTextDocx: (payload: {
    content: string
    defaultName?: string
  }) => Promise<{ ok: boolean; path?: string; error?: string }>
  compressPdf: (payload?: {
    path?: string
    jpegQuality?: number
  }) => Promise<{
    ok: boolean
    path?: string
    error?: string
    pageCount?: number
    bytesBefore?: number
    bytesAfter?: number
  }>
  encryptPdf: (payload: {
    path?: string
    userPassword: string
    ownerPassword?: string
    allowPrinting?: boolean
    allowCopying?: boolean
  }) => Promise<{ ok: boolean; path?: string; error?: string }>
  checkLibreOffice: () => Promise<{
    ok: boolean
    path?: string
    version?: string
    error?: string
    customPath?: string
    source?: 'custom' | 'auto' | 'none'
  }>
  convertLibreOffice: (payload: {
    inputPath?: string
    target: 'pdf' | 'docx' | 'odt' | 'pptx' | 'odp' | 'xlsx' | 'ods' | 'html' | 'txt'
  }) => Promise<{ ok: boolean; path?: string; error?: string }>
  pickLibreOffice: () => Promise<{
    ok: boolean
    path?: string
    version?: string
    error?: string
    customPath?: string
    source?: 'custom' | 'auto' | 'none'
  }>
  clearLibreOffice: () => Promise<{
    ok: boolean
    path?: string
    version?: string
    error?: string
    customPath?: string
    source?: 'custom' | 'auto' | 'none'
  }>
  openLibreOfficeDownload: () => Promise<void>
  onVideoProcessProgress: (
    callback: (payload: { ratio: number; label: string }) => void,
  ) => () => void
  onAudioProcessProgress: (
    callback: (payload: { ratio: number; label: string }) => void,
  ) => () => void
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
  getSchedulesSnapshot: () => Promise<SchedulesSnapshot>
  listScheduleTasks: () => Promise<ScheduleTask[]>
  upsertScheduleTask: (input: UpsertScheduleTaskInput) => Promise<ScheduleTask>
  deleteScheduleTask: (id: string) => Promise<boolean>
  setScheduleTaskEnabled: (id: string, enabled: boolean) => Promise<ScheduleTask | null>
  runScheduleTaskNow: (id: string) => Promise<SchedulesSnapshot>
  getInboxSnapshot: () => Promise<InboxSnapshot>
  listInboxItems: () => Promise<InboxItem[]>
  markInboxRead: (id: string) => Promise<InboxItem | null>
  markAllInboxRead: () => Promise<number>
  removeInboxItem: (id: string) => Promise<boolean>
  clearInbox: () => Promise<number>
  onInboxAppended: (cb: (item: InboxItem) => void) => () => void
  onInboxOpen: (cb: (payload: { id: string }) => void) => () => void
}

declare global {
  interface Window {
    treasureChest: TreasureChestApi
  }
}

export {}
