import { app, BrowserWindow } from 'electron'
import { initDatabase, closeDatabase } from '../db/Database'
import { disposeAllMcpSessions } from '../modules/mcp/McpHub'
import { createMainWindow } from '../windows/createMainWindow'
import { createCalendarWindow, getCalendarWindow } from '../windows/createCalendarWindow'
import { getMainWindow, showMainWindow } from '../windows/mainWindowRef'
import { registerAllIpc } from '../ipc'
import { initSettingsStore, settingsStore } from '../modules/settings/SettingsStore'
import { initFortuneStore } from '../modules/fortune/FortuneStore'
import { syncLaunchAtLogin } from '../modules/system/LaunchService'
import { destroyTray, ensureTray, syncTrayVisibility } from '../modules/tray/TrayService'
import { applyAppDockIcon } from '../utils/appIcon'
import { logger } from '../utils/logger'
import {
  attachVisionAssetProtocol,
  registerVisionAssetScheme,
  startVisionAssetHttpServer,
} from '../modules/imageTools/ImageToolsStore'
import { startGeneratedMediaHttpServer } from '../modules/llm/media/GeneratedMediaStore'

app.setName('袖里乾坤')
registerVisionAssetScheme()


const isHarnessHeadless = process.argv.includes('--harness-headless')

if (isHarnessHeadless) {
  void import('../harness-cli/runHeadless').then((m) => m.runHeadless())
} else {
  app.whenReady().then(() => {
  void startVisionAssetHttpServer().catch((error) => {
    logger.error('vision http start failed', error)
  })
  void startGeneratedMediaHttpServer().catch((error) => {
    logger.error('generated-media http start failed', error)
  })
  attachVisionAssetProtocol()
  logger.info('app ready')
  applyAppDockIcon()
  // Re-apply after a tick; Dock sometimes ignores the first setIcon on cold start.
  setTimeout(() => applyAppDockIcon(), 300)
  initDatabase()
  void import('../modules/debug/ActivityLog').then((m) => m.initActivityLog())
  void import('../modules/harness/SessionRepo').then((m) => {
    const recovered = m.recoverInterruptedTurns()
    if (recovered.turns > 0) {
      void import('../utils/logger').then(({ logger }) =>
        logger.info(
          `recovered ${recovered.turns} interrupted turn(s) across ${recovered.sessions} session(s)`,
        ),
      )
    }
  })
  void import('../modules/harness/cordis/CordisConfig').then((c) => {
    c.applyCordisStack()
  })
  void import('../modules/harness/coding/DshWebService').then((m) => m.ensureEmbeddedDshWebServer())
  initSettingsStore()
  initFortuneStore()
  syncLaunchAtLogin()
  registerAllIpc()
  void import('../modules/schedules/SchedulesStore').then((m) => m.migrateSchedulesFromSettings())
  void import('../modules/dataSources/BuiltinLotteryDataSource').then((m) =>
    m.ensureBuiltinLotteryDataSource(),
  )
  void import('../modules/schedules/ScheduleRunner').then((m) => m.startScheduleRunner())
  // Builtin fortune/stocks ticks are owned by ScheduleRunner now.

  const behavior = settingsStore.getLaunchBehavior()
  const widget = settingsStore.getDesktopWidget()

  createMainWindow()
  const main = getMainWindow()
  if (main && behavior === 'tray') {
    main.hide()
  }

  if (widget.enabled || behavior === 'widget') {
    createCalendarWindow()
  }
  if (widget.enabled || widget.keepAlive || behavior === 'tray') {
    ensureTray()
  }
  syncTrayVisibility()

  app.on('activate', () => {
    showMainWindow()
  })
  })
}

if (!isHarnessHeadless) {
app.on('window-all-closed', () => {
  const { keepAlive } = settingsStore.getDesktopWidget()
  if (keepAlive && getCalendarWindow()) {
    ensureTray()
    return
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void import('../modules/schedules/ScheduleRunner').then((m) => m.stopScheduleRunner())
  disposeAllMcpSessions()
  void import('../modules/harness/coding/LspService').then((m) => m.shutdownLsp())
  void import('../modules/harness/coding/DshWebService').then((m) => m.stopEmbeddedDshWeb())
  void import('../modules/computerUse/BrowserSession').then((m) => m.disposeComputerUseBrowser())
  closeDatabase()
  const main = getMainWindow()
  if (main && !main.isDestroyed()) {
    main.removeAllListeners('close')
  }
  for (const win of BrowserWindow.getAllWindows()) {
    win.destroy()
  }
  destroyTray()
})
}

app.on('browser-window-created', (_event, window) => {
  if (!app.isPackaged) {
    window.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12') {
        window.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
  }
})
