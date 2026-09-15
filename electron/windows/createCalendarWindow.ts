import { BrowserWindow, nativeTheme, screen, shell } from 'electron'
import { join } from 'node:path'
import { IpcChannels, type CalendarMode } from '@shared'
import { settingsStore } from '../modules/settings/SettingsStore'
import { logger } from '../utils/logger'

let calendarWindow: BrowserWindow | null = null

const MODE_BOUNDS: Record<
  CalendarMode,
  {
    width: number
    height: number
    minWidth: number
    minHeight: number
    alwaysOnTop: boolean
    skipTaskbar: boolean
  }
> = {
  widget: {
    width: 248,
    height: 200,
    minWidth: 236,
    minHeight: 180,
    alwaysOnTop: true,
    skipTaskbar: true,
  },
  large: {
    width: 640,
    height: 560,
    minWidth: 480,
    minHeight: 440,
    alwaysOnTop: true,
    skipTaskbar: true,
  },
}

export function getCalendarWindow(): BrowserWindow | null {
  return calendarWindow && !calendarWindow.isDestroyed() ? calendarWindow : null
}

function workAreaFor(win: BrowserWindow): Electron.Rectangle {
  return screen.getDisplayMatching(win.getBounds()).workArea
}

function placeWidget(win: BrowserWindow, width: number, height: number): void {
  const { x, y, width: aw, height: ah } = workAreaFor(win)
  const nx = Math.round(x + aw - width - 20)
  const ny = Math.round(y + Math.min(28, ah * 0.04))
  win.setBounds({ x: nx, y: ny, width, height }, false)
}

/** Keep window fully inside the current display work area. */
function ensureOnScreen(win: BrowserWindow): void {
  const bounds = win.getBounds()
  const { x, y, width: aw, height: ah } = workAreaFor(win)
  const width = Math.min(bounds.width, aw)
  const height = Math.min(bounds.height, ah)
  const nx = Math.min(Math.max(bounds.x, x), x + aw - width)
  const ny = Math.min(Math.max(bounds.y, y), y + ah - height)
  win.setBounds(
    {
      x: Math.round(nx),
      y: Math.round(ny),
      width: Math.round(width),
      height: Math.round(height),
    },
    false,
  )
}

function fitLargeSize(win: BrowserWindow): { width: number; height: number } {
  const cfg = MODE_BOUNDS.large
  const { width: aw, height: ah } = workAreaFor(win)
  return {
    width: Math.min(cfg.width, Math.max(cfg.minWidth, aw - 40)),
    height: Math.min(cfg.height, Math.max(cfg.minHeight, ah - 40)),
  }
}

export function applyCalendarMode(mode: CalendarMode): void {
  const win = getCalendarWindow()
  if (!win) return
  const cfg = MODE_BOUNDS[mode]
  win.setAlwaysOnTop(cfg.alwaysOnTop, cfg.alwaysOnTop ? 'floating' : 'normal')
  win.setSkipTaskbar(cfg.skipTaskbar)

  if (mode === 'widget') {
    win.setBackgroundColor('#00000000')
    win.setHasShadow(false)
    win.setMinimumSize(cfg.minWidth, cfg.minHeight)
    win.setMaximumSize(cfg.width, cfg.height)
    win.setResizable(false)
    placeWidget(win, cfg.width, cfg.height)
    return
  }

  // Expanded card: opaque fill so transparent dial chrome doesn't show through.
  win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1a1f27' : '#f4f6f8')
  win.setHasShadow(true)
  const size = fitLargeSize(win)
  win.setMaximumSize(0, 0)
  win.setMinimumSize(cfg.minWidth, Math.min(cfg.minHeight, size.height))
  win.setResizable(true)
  win.setSize(size.width, size.height, true)
  ensureOnScreen(win)
}

export function closeCalendarWindow(): void {
  const win = getCalendarWindow()
  if (win) win.close()
}

export function createCalendarWindow(): BrowserWindow {
  if (calendarWindow && !calendarWindow.isDestroyed()) {
    calendarWindow.show()
    calendarWindow.focus()
    return calendarWindow
  }

  const startMode: CalendarMode = 'widget'
  settingsStore.setCalendarMode(startMode)
  const cfg = MODE_BOUNDS[startMode]

  calendarWindow = new BrowserWindow({
    width: cfg.width,
    height: cfg.height,
    minWidth: cfg.minWidth,
    minHeight: cfg.minHeight,
    maxWidth: cfg.width,
    maxHeight: cfg.height,
    show: false,
    title: '万年历挂件',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    alwaysOnTop: cfg.alwaysOnTop,
    skipTaskbar: cfg.skipTaskbar,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  })

  calendarWindow.setAlwaysOnTop(true, 'floating')

  calendarWindow.on('ready-to-show', () => {
    if (!calendarWindow) return
    placeWidget(calendarWindow, cfg.width, cfg.height)
    calendarWindow.showInactive()
  })

  calendarWindow.on('closed', () => {
    calendarWindow = null
  })

  calendarWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const hash = '#/calendar/widget'
  if (process.env.ELECTRON_RENDERER_URL) {
    void calendarWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}${hash}`)
  } else {
    void calendarWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: '/calendar/widget',
    })
  }

  logger.info('calendar dial window created')
  return calendarWindow
}

export function syncDesktopWidgetFromSettings(): void {
  const { enabled } = settingsStore.getDesktopWidget()
  if (enabled) createCalendarWindow()
  else closeCalendarWindow()
}

export function notifyDesktopWidgetUpdated(): void {
  const win = getCalendarWindow()
  if (!win) return
  win.webContents.send(
    IpcChannels.settings.desktopWidgetUpdated,
    settingsStore.getDesktopWidgetView(),
  )
}
