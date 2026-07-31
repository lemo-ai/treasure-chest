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
}

contextBridge.exposeInMainWorld('treasureChest', api)

export type TreasureChestApi = typeof api
