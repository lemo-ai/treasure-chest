import { BrowserWindow, ipcMain, app, screen } from 'electron'
import {
  IpcChannels,
  type AppLocale,
  type BirthProfile,
  type CalendarMode,
  type DesktopWidgetSettings,
  type FortuneAiConnectionTestInput,
  type DailyFortune,
  type StockMarket,
  type StocksReport,
  type LaunchBehavior,
  type NotificationSettings,
  type FortuneSettings,
  type ThemeMode,
  type StocksSettings,
  type StocksReportSummary,
  type StockQuoteDetail,
} from '@shared'
import { settingsStore } from '../modules/settings/SettingsStore'
import {
  clearDialBackgroundFile,
  pickDialBackground,
} from '../modules/settings/DialBackground'
import { fortuneStore } from '../modules/fortune/FortuneStore'
import { generateFortuneAiAnalysis, testAiProviderConnection } from '../modules/fortune/FortuneAiService'
import { exportBackup, importBackup } from '../modules/backup/BackupService'
import { readSystemLaunchAtLogin, syncLaunchAtLogin } from '../modules/system/LaunchService'
import {
  applyCalendarMode,
  closeCalendarWindow,
  createCalendarWindow,
  notifyDesktopWidgetUpdated,
  syncDesktopWidgetFromSettings,
} from '../windows/createCalendarWindow'
import { showMainWindow, getMainWindow } from '../windows/mainWindowRef'
import { ensureTray, syncTrayVisibility } from '../modules/tray/TrayService'
import { stocksStore } from '../modules/stocks/StocksStore'
import { generateStocksReportFromWatchlist } from '../modules/stocks/StocksService'
import { exportStocksCsv, importStocksCsv } from '../modules/stocks/StocksCsvService'
import { notifyStocksReportIfNeeded } from '../modules/stocks/StocksScheduler'
import { getQuoteSnapshot } from '../modules/stocks/PriceRangeService'

function afterWidgetChange(partial?: Partial<DesktopWidgetSettings>): void {
  if (partial?.enabled !== undefined) {
    syncDesktopWidgetFromSettings()
  }
  if (
    partial?.dialFace !== undefined ||
    partial?.backgroundImagePath !== undefined ||
    partial?.showTicks !== undefined ||
    partial === undefined
  ) {
    notifyDesktopWidgetUpdated()
  }
  const next = settingsStore.getDesktopWidget()
  if (next.enabled || next.keepAlive) ensureTray()
  syncTrayVisibility()
}

export function registerAllIpc(): void {
  ipcMain.handle(IpcChannels.app.getVersion, () => app.getVersion())

  ipcMain.handle(IpcChannels.settings.getTheme, () => settingsStore.getTheme())
  ipcMain.handle(IpcChannels.settings.setTheme, (_e, theme: ThemeMode) =>
    settingsStore.setTheme(theme),
  )
  ipcMain.handle(IpcChannels.settings.getLocale, () => settingsStore.getLocale())
  ipcMain.handle(IpcChannels.settings.setLocale, (_e, locale: AppLocale) =>
    settingsStore.setLocale(locale),
  )
  ipcMain.handle(IpcChannels.settings.getSnapshot, () => settingsStore.getSnapshot())
  ipcMain.handle(IpcChannels.settings.getDesktopWidget, () => settingsStore.getDesktopWidgetView())
  ipcMain.handle(
    IpcChannels.settings.setDesktopWidget,
    (_e, partial: Partial<DesktopWidgetSettings>) => {
      settingsStore.setDesktopWidget(partial)
      afterWidgetChange(partial)
      return settingsStore.getDesktopWidgetView()
    },
  )
  ipcMain.handle(IpcChannels.settings.pickDialBackground, async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow()
    const path = await pickDialBackground(parent)
    if (!path) return settingsStore.getDesktopWidgetView()
    settingsStore.setDesktopWidget({ backgroundImagePath: path })
    afterWidgetChange({ backgroundImagePath: path })
    return settingsStore.getDesktopWidgetView()
  })
  ipcMain.handle(IpcChannels.settings.clearDialBackground, () => {
    clearDialBackgroundFile()
    settingsStore.setDesktopWidget({ backgroundImagePath: null })
    afterWidgetChange({ backgroundImagePath: null })
    return settingsStore.getDesktopWidgetView()
  })

  ipcMain.handle(IpcChannels.window.openCalendar, () => {
    createCalendarWindow()
    ensureTray()
    return true
  })
  ipcMain.handle(IpcChannels.window.closeCalendar, () => {
    closeCalendarWindow()
    return true
  })
  ipcMain.handle(IpcChannels.window.showMain, () => {
    showMainWindow()
    return true
  })

  let dialDragTimer: ReturnType<typeof setInterval> | null = null
  let dialDragOffset = { x: 0, y: 0 }

  ipcMain.on(IpcChannels.window.dialDragStart, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    const cursor = screen.getCursorScreenPoint()
    const [wx, wy] = win.getPosition()
    dialDragOffset = { x: cursor.x - wx, y: cursor.y - wy }
    if (dialDragTimer) clearInterval(dialDragTimer)
    dialDragTimer = setInterval(() => {
      if (!win || win.isDestroyed()) {
        if (dialDragTimer) clearInterval(dialDragTimer)
        dialDragTimer = null
        return
      }
      const point = screen.getCursorScreenPoint()
      win.setPosition(point.x - dialDragOffset.x, point.y - dialDragOffset.y)
    }, 16)
  })

  ipcMain.on(IpcChannels.window.dialDragEnd, () => {
    if (dialDragTimer) clearInterval(dialDragTimer)
    dialDragTimer = null
  })

  ipcMain.handle(IpcChannels.calendar.getMode, () => settingsStore.getCalendarMode())
  ipcMain.handle(IpcChannels.calendar.setMode, (_e, mode: CalendarMode) => {
    const next = settingsStore.setCalendarMode(mode)
    applyCalendarMode(next)
    return next
  })

  ipcMain.handle(IpcChannels.fortune.getProfile, () => fortuneStore.getProfile())
  ipcMain.handle(IpcChannels.fortune.saveProfile, (_e, profile: BirthProfile) =>
    fortuneStore.saveProfile(profile),
  )
  ipcMain.handle(IpcChannels.fortune.clearProfile, () => {
    fortuneStore.clearProfile()
    return true
  })
  ipcMain.handle(
    IpcChannels.fortune.generateAiAnalysis,
    async (_e, payload: { fortune: DailyFortune; locale: string }) => {
      const fortuneSettings = settingsStore.getFortuneSettings()
      return generateFortuneAiAnalysis(payload.fortune, payload.locale, fortuneSettings)
    },
  )
  ipcMain.handle(IpcChannels.fortune.testAiConnection, (_e, payload: FortuneAiConnectionTestInput) =>
    testAiProviderConnection(payload),
  )

  ipcMain.handle(IpcChannels.stocks.getWatchlist, () => stocksStore.getWatchlist())
  ipcMain.handle(
    IpcChannels.stocks.addWatchlistItem,
    (_e, payload: { market: StockMarket; symbol: string; name?: string; note?: string }) =>
      stocksStore.upsertWatchlistItem(payload),
  )
  ipcMain.handle(
    IpcChannels.stocks.removeWatchlistItem,
    (_e, payload: { market: StockMarket; symbol: string }) => {
      stocksStore.removeWatchlistItem(payload.market, payload.symbol)
      return true
    },
  )
  ipcMain.handle(IpcChannels.stocks.getScannerPool, () => stocksStore.getScannerPool())
  ipcMain.handle(
    IpcChannels.stocks.addScannerPoolItem,
    (_e, payload: { market: StockMarket; symbol: string; name?: string }) =>
      stocksStore.upsertScannerPoolItem(payload),
  )
  ipcMain.handle(
    IpcChannels.stocks.removeScannerPoolItem,
    (_e, payload: { market: StockMarket; symbol: string }) => {
      stocksStore.removeScannerPoolItem(payload.market, payload.symbol)
      return true
    },
  )
  ipcMain.handle(IpcChannels.stocks.importWatchlistCsv, () => importStocksCsv('watchlist'))
  ipcMain.handle(IpcChannels.stocks.exportWatchlistCsv, () => exportStocksCsv('watchlist'))
  ipcMain.handle(IpcChannels.stocks.importScannerCsv, () => importStocksCsv('scanner'))
  ipcMain.handle(IpcChannels.stocks.exportScannerCsv, () => exportStocksCsv('scanner'))
  ipcMain.handle(IpcChannels.stocks.generateReport, async (): Promise<StocksReport> => {
    const report = await generateStocksReportFromWatchlist()
    notifyStocksReportIfNeeded(report.recommendations.length)
    return report
  })
  ipcMain.handle(IpcChannels.stocks.getLatestReport, (): StocksReport | null => stocksStore.getLatestReport())
  ipcMain.handle(IpcChannels.stocks.listReports, (_e, limit?: number): StocksReportSummary[] =>
    stocksStore.listReports(typeof limit === 'number' ? limit : 30),
  )
  ipcMain.handle(IpcChannels.stocks.getReportByDate, (_e, date: string): StocksReport | null =>
    stocksStore.getReportByDate(date),
  )
  ipcMain.handle(
    IpcChannels.stocks.getQuote,
    async (_e, payload: { market: StockMarket; symbol: string; name?: string }): Promise<StockQuoteDetail> => {
      const quote = await getQuoteSnapshot({
        market: payload.market,
        symbol: payload.symbol,
        name: payload.name,
        enabled: true,
        updatedAt: new Date().toISOString(),
      })
      return {
        market: payload.market,
        symbol: payload.symbol,
        name: payload.name,
        price: quote.price,
        currency: quote.currency,
        ranges: quote.ranges,
        sparkline: quote.sparkline,
        bars: quote.bars.slice(-120),
        fromCache: quote.fromCache,
      }
    },
  )

  ipcMain.handle(IpcChannels.backup.export, () => exportBackup())
  ipcMain.handle(IpcChannels.backup.import, () => importBackup())

  ipcMain.handle(IpcChannels.system.getLaunchAtLogin, () => ({
    configured: settingsStore.getLaunchAtLogin(),
    system: readSystemLaunchAtLogin(),
  }))
  ipcMain.handle(IpcChannels.system.setLaunchAtLogin, (_e, enabled: boolean) => {
    settingsStore.setLaunchAtLogin(enabled)
    syncLaunchAtLogin()
    return {
      configured: settingsStore.getLaunchAtLogin(),
      system: readSystemLaunchAtLogin(),
    }
  })
  ipcMain.handle(IpcChannels.settings.setLaunchBehavior, (_e, behavior: LaunchBehavior) => {
    settingsStore.setLaunchBehavior(behavior)
    syncLaunchAtLogin()
    return settingsStore.getLaunchBehavior()
  })
  ipcMain.handle(IpcChannels.settings.setNotifications, (_e, partial: Partial<NotificationSettings>) =>
    settingsStore.setNotifications(partial),
  )
  ipcMain.handle(IpcChannels.settings.setFortuneSettings, (_e, partial: Partial<FortuneSettings>) =>
    settingsStore.setFortuneSettings(partial),
  )
  ipcMain.handle(IpcChannels.settings.setStocksSettings, (_e, partial: Partial<StocksSettings>) =>
    settingsStore.setStocksSettings(partial),
  )
}
