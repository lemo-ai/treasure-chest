import { BrowserWindow, dialog, ipcMain, app, screen } from 'electron'
import {
  IpcChannels,
  type AppLocale,
  type BirthProfile,
  type CalendarMode,
  type DesktopWidgetSettings,
  type FortuneAiConnectionTestInput,
  type DailyFortune,
  type LlmChatRequest,
  type LlmChatStreamEvent,
  type LlmChatStreamStart,
  type StockMarket,
  type StocksReport,
  type LaunchBehavior,
  type NotificationSettings,
  type FortuneSettings,
  type ThemeMode,
  type ThemeAccent,
  type StocksSettings,
  type StocksReportSummary,
  type StockQuoteDetail,
} from '@shared'
import { settingsStore } from '../modules/settings/SettingsStore'
import {
  clearActiveDialBackground,
  deleteDialBackground,
  pickDialBackground,
  selectDialBackground,
} from '../modules/settings/DialBackground'
import { fortuneStore } from '../modules/fortune/FortuneStore'
import { generateFortuneAiAnalysis, testAiProviderConnection } from '../modules/fortune/FortuneAiService'
import {
  runWorkbenchChat,
  runWorkbenchChatStream,
  resolvePendingToolApproval,
  waitForToolApprovalFromIpc,
} from '../modules/llm/WorkbenchChatService'
import {
  createKnowledgeCollection,
  deleteKnowledgeCollection,
  deleteKnowledgeDocument,
  getKnowledgeDocumentFile,
  getKnowledgeSettings,
  ingestKnowledgeFile,
  ingestKnowledgeText,
  knowledgeStats,
  listKnowledgeCollections,
  listKnowledgeDocuments,
  reembedKnowledgeCollection,
  reembedKnowledgeDocument,
  renameKnowledgeCollection,
  searchKnowledge,
  setKnowledgeSettings,
} from '../modules/knowledge/KnowledgeStore'
import { generateImage } from '../modules/llm/ImageGenService'
import {
  generateMusic,
  generateVideo,
  transcribeAudioFile,
} from '../modules/llm/MediaGenService'
import { assessMediaCapabilities } from '../modules/llm/MediaCapabilities'
import {
  disposeAllMcpSessions,
  getMcpStatusSnapshot,
  listMcpToolsAsSpecs,
  refreshMcpStatus,
} from '../modules/mcp/McpHub'
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
  ipcMain.handle(IpcChannels.settings.getAccent, () => settingsStore.getAccent())
  ipcMain.handle(IpcChannels.settings.setAccent, (_e, accent: ThemeAccent) =>
    settingsStore.setAccent(accent),
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
    afterWidgetChange({ backgroundImagePath: path })
    return settingsStore.getDesktopWidgetView()
  })
  ipcMain.handle(IpcChannels.settings.clearDialBackground, () => {
    clearActiveDialBackground()
    afterWidgetChange({ backgroundImagePath: null })
    return settingsStore.getDesktopWidgetView()
  })
  ipcMain.handle(IpcChannels.settings.selectDialBackground, (_e, path: string) => {
    selectDialBackground(path)
    afterWidgetChange({ backgroundImagePath: path })
    return settingsStore.getDesktopWidgetView()
  })
  ipcMain.handle(IpcChannels.settings.deleteDialBackground, (_e, path: string) => {
    deleteDialBackground(path)
    afterWidgetChange({ backgroundImagePath: path })
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
  ipcMain.handle(IpcChannels.workbench.chat, async (_e, payload: LlmChatRequest) => {
    const fortuneSettings = settingsStore.getFortuneSettings()
    return runWorkbenchChat(payload, fortuneSettings)
  })
  ipcMain.handle(
    IpcChannels.workbench.chatStream,
    async (event, payload: LlmChatRequest): Promise<LlmChatStreamStart> => {
      const streamId =
        payload.streamId?.trim() ||
        `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      const fortuneSettings = settingsStore.getFortuneSettings()
      const send = (ev: LlmChatStreamEvent): void => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IpcChannels.workbench.chatStreamEvent, ev)
        }
      }

      // Kick off stream without blocking the invoke return.
      void (async () => {
        try {
          const result = await runWorkbenchChatStream(
            payload,
            fortuneSettings,
            (delta) => {
              send({ streamId, type: 'delta', text: delta })
            },
            (status) => {
              send({ streamId, type: 'status', text: status })
            },
            (citations) => {
              send({ streamId, type: 'citations', citations })
            },
            (step) => {
              send({ streamId, type: 'tool_step', step })
            },
            async (request) => {
              send({ streamId, type: 'tool_approval', request })
              return waitForToolApprovalFromIpc(streamId, request.toolCallId)
            },
          )
          if (result.ok && result.text?.trim()) {
            send({
              streamId,
              type: 'done',
              text: result.text.trim(),
              model: result.model,
              providerName: result.providerName,
              citations: result.citations,
              toolSteps: result.toolSteps,
            })
          } else {
            send({
              streamId,
              type: 'error',
              error: result.error || 'Empty AI response.',
              model: result.model,
              providerName: result.providerName,
            })
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          send({ streamId, type: 'error', error: msg })
        }
      })()

      return { streamId }
    },
  )
  ipcMain.handle(
    IpcChannels.workbench.resolveToolApproval,
    (
      _e,
      payload: { streamId: string; toolCallId: string; approved: boolean },
    ): boolean => {
      return resolvePendingToolApproval(
        payload.streamId,
        payload.toolCallId,
        Boolean(payload.approved),
      )
    },
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
  ipcMain.handle(IpcChannels.stocks.refreshScanner, () =>
    import('../modules/stocks/ScannerService').then((m) => m.refreshScannerPool()),
  )
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
  ipcMain.handle(IpcChannels.mcp.getSettings, () => settingsStore.getMcpSettings())
  ipcMain.handle(IpcChannels.mcp.setSettings, (_e, next: import('@shared').McpSettings) => {
    disposeAllMcpSessions()
    const saved = settingsStore.setMcpSettings(next)
    void refreshMcpStatus().catch(() => undefined)
    return saved
  })
  ipcMain.handle(IpcChannels.mcp.listTools, () => listMcpToolsAsSpecs())
  ipcMain.handle(IpcChannels.mcp.getStatus, () => getMcpStatusSnapshot())
  ipcMain.handle(IpcChannels.mcp.refreshStatus, () => refreshMcpStatus())

  ipcMain.handle(IpcChannels.skills.list, () =>
    import('../modules/skills/SkillsStore').then((m) => m.listSkills()),
  )
  ipcMain.handle(IpcChannels.skills.catalogs, () =>
    import('../modules/skills/SkillsStore').then((m) => m.SKILL_CATALOGS),
  )
  ipcMain.handle(IpcChannels.skills.installGithub, (_e, ref: string) =>
    import('../modules/skills/SkillsStore').then((m) => m.installSkillFromGithub(ref)),
  )
  ipcMain.handle(IpcChannels.skills.installMarkdown, (_e, markdown: string) =>
    import('../modules/skills/SkillsStore').then((m) => m.installSkillFromMarkdown(markdown)),
  )
  ipcMain.handle(IpcChannels.skills.uninstall, (_e, id: string) =>
    import('../modules/skills/SkillsStore').then((m) => m.uninstallSkill(id)),
  )

  ipcMain.handle(IpcChannels.knowledge.listDocuments, (_e, collectionId?: string) =>
    listKnowledgeDocuments(collectionId),
  )
  ipcMain.handle(
    IpcChannels.knowledge.ingestText,
    (_e, payload: import('@shared').KnowledgeIngestInput) => ingestKnowledgeText(payload),
  )
  ipcMain.handle(
    IpcChannels.knowledge.ingestFile,
    (_e, payload: import('@shared').KnowledgeIngestFileInput) => ingestKnowledgeFile(payload),
  )
  ipcMain.handle(IpcChannels.knowledge.deleteDocument, (_e, id: string) =>
    deleteKnowledgeDocument(id),
  )
  ipcMain.handle(IpcChannels.knowledge.getDocumentFile, (_e, id: string) =>
    getKnowledgeDocumentFile(id),
  )
  ipcMain.handle(
    IpcChannels.knowledge.search,
    (_e, payload: { query: string; limit?: number; collectionId?: string }) =>
      searchKnowledge(payload.query, payload.limit ?? 5, payload.collectionId),
  )
  ipcMain.handle(IpcChannels.knowledge.listCollections, () => listKnowledgeCollections())
  ipcMain.handle(
    IpcChannels.knowledge.createCollection,
    (_e, payload: { name: string; description?: string; color?: string }) =>
      createKnowledgeCollection(payload),
  )
  ipcMain.handle(
    IpcChannels.knowledge.renameCollection,
    (_e, payload: { id: string; name: string }) => renameKnowledgeCollection(payload.id, payload.name),
  )
  ipcMain.handle(IpcChannels.knowledge.deleteCollection, (_e, id: string) =>
    deleteKnowledgeCollection(id),
  )
  ipcMain.handle(IpcChannels.knowledge.getSettings, () => getKnowledgeSettings())
  ipcMain.handle(
    IpcChannels.knowledge.setSettings,
    (_e, partial: Partial<import('@shared').KnowledgeSettings>) => setKnowledgeSettings(partial),
  )
  ipcMain.handle(IpcChannels.knowledge.stats, () => knowledgeStats())
  ipcMain.handle(IpcChannels.knowledge.reembedDocument, (_e, id: string) =>
    reembedKnowledgeDocument(id),
  )
  ipcMain.handle(IpcChannels.knowledge.reembedCollection, (_e, collectionId?: string) =>
    reembedKnowledgeCollection(collectionId),
  )
  ipcMain.handle(
    IpcChannels.image.generate,
    async (
      _e,
      payload: { prompt: string; size?: string; model?: string; style?: string; quality?: string },
    ) => {
      const fortuneSettings = settingsStore.getFortuneSettings()
      return generateImage(payload.prompt, fortuneSettings, {
        size: payload.size,
        model: payload.model,
        style: payload.style,
        quality: payload.quality,
      })
    },
  )
  ipcMain.handle(IpcChannels.media.getCapabilities, () =>
    assessMediaCapabilities(settingsStore.getFortuneSettings()),
  )
  ipcMain.handle(IpcChannels.media.pickAudioFile, async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Select audio / video for transcription',
          properties: ['openFile'],
          filters: [
            {
              name: 'Audio/Video',
              extensions: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'flac'],
            },
          ],
        })
      : await dialog.showOpenDialog({
          title: 'Select audio / video for transcription',
          properties: ['openFile'],
          filters: [
            {
              name: 'Audio/Video',
              extensions: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'flac'],
            },
          ],
        })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })
  ipcMain.handle(
    IpcChannels.media.transcribe,
    async (_e, payload: { filePath: string; model?: string; language?: string }) => {
      const fortuneSettings = settingsStore.getFortuneSettings()
      return transcribeAudioFile(payload.filePath, fortuneSettings, {
        model: payload.model,
        language: payload.language,
      })
    },
  )
  ipcMain.handle(
    IpcChannels.media.generateVideo,
    async (
      _e,
      payload: {
        prompt: string
        model?: string
        durationSec?: number
        aspectRatio?: string
        resolution?: string
      },
    ) => {
      const fortuneSettings = settingsStore.getFortuneSettings()
      return generateVideo(payload.prompt, fortuneSettings, {
        model: payload.model,
        durationSec: payload.durationSec,
        aspectRatio: payload.aspectRatio,
        resolution: payload.resolution,
      })
    },
  )
  ipcMain.handle(
    IpcChannels.media.generateMusic,
    async (
      _e,
      payload: {
        prompt: string
        model?: string
        durationSec?: number
        style?: string
        instrumental?: boolean
      },
    ) => {
      const fortuneSettings = settingsStore.getFortuneSettings()
      return generateMusic(payload.prompt, fortuneSettings, {
        model: payload.model,
        durationSec: payload.durationSec,
        style: payload.style,
        instrumental: payload.instrumental,
      })
    },
  )
}
