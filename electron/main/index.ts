import { app, BrowserWindow } from 'electron'
import { createMainWindow } from '../windows/createMainWindow'
import { createCalendarWindow, getCalendarWindow } from '../windows/createCalendarWindow'
import { getMainWindow, showMainWindow } from '../windows/mainWindowRef'
import { registerAllIpc } from '../ipc'
import { initSettingsStore, settingsStore } from '../modules/settings/SettingsStore'
import { destroyTray, ensureTray, syncTrayVisibility } from '../modules/tray/TrayService'
import { logger } from '../utils/logger'

app.whenReady().then(() => {
  logger.info('app ready')
  initSettingsStore()
  registerAllIpc()
  createMainWindow()

  const widget = settingsStore.getDesktopWidget()
  if (widget.enabled) {
    createCalendarWindow()
  }
  if (widget.enabled || widget.keepAlive) {
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
