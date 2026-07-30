import { BrowserWindow } from 'electron'

let mainWindow: BrowserWindow | null = null
let createMainWindowFn: (() => BrowserWindow) | null = null

export function registerMainWindowFactory(fn: () => BrowserWindow): void {
  createMainWindowFn = fn
}

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

export function showMainWindow(): BrowserWindow {
  const existing = getMainWindow()
  if (existing) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    return existing
  }
  if (!createMainWindowFn) {
    throw new Error('main window factory not registered')
  }
  return createMainWindowFn()
}
