import { app, BrowserWindow } from 'electron'
import { initDatabase, closeDatabase } from '../db/Database'
import { createMainWindow } from '../windows/createMainWindow'
import { createCalendarWindow, getCalendarWindow } from '../windows/createCalendarWindow'
import { getMainWindow, showMainWindow } from '../windows/mainWindowRef'
import { registerAllIpc } from '../ipc'
import { initSettingsStore, settingsStore } from '../modules/settings/SettingsStore'
import { initFortuneStore } from '../modules/fortune/FortuneStore'
import { syncLaunchAtLogin } from '../modules/system/LaunchService'
import { startFortuneNotificationScheduler, stopFortuneNotificationScheduler } from '../modules/notifications/FortuneNotificationService'
import { destroyTray, ensureTray, syncTrayVisibility } from '../modules/tray/TrayService'
import { logger } from '../utils/logger'

app.whenReady().then(() => {
  logger.info('app ready')
  initDatabase()
  initSettingsStore()
  initFortuneStore()
  syncLaunchAtLogin()
  registerAllIpc()
  startFortuneNotificationScheduler()

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
  stopFortuneNotificationScheduler()
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
