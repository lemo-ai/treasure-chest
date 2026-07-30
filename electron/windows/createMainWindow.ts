import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { settingsStore } from '../modules/settings/SettingsStore'
import { ensureTray, syncTrayVisibility } from '../modules/tray/TrayService'
import { closeCalendarWindow } from './createCalendarWindow'
import { registerMainWindowFactory, setMainWindow } from './mainWindowRef'
import { logger } from '../utils/logger'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: '百宝箱',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  setMainWindow(win)

  win.on('ready-to-show', () => {
    if (settingsStore.getLaunchBehavior() !== 'tray') {
      win.show()
    }
  })

  win.on('close', (event) => {
    const { keepAlive } = settingsStore.getDesktopWidget()
    if (keepAlive) {
      event.preventDefault()
      win.hide()
      // Do not force-reopen the dial; only keep process/tray alive.
      // If the dial is already open it stays; if user closed it, it stays closed.
      ensureTray()
      syncTrayVisibility()
      logger.info('main window hidden; keep-alive')
      return
    }
    closeCalendarWindow()
  })

  win.on('closed', () => {
    setMainWindow(null)
  })

  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  logger.info('main window created')
  return win
}

registerMainWindowFactory(createMainWindow)
