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
  ) => Promise<LlmChatResponse>
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
}

declare global {
  interface Window {
    treasureChest: TreasureChestApi
  }
}

export {}
