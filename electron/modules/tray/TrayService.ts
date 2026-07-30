import { Menu, Tray, app, nativeImage } from 'electron'
import { join } from 'node:path'
import { createCalendarWindow, getCalendarWindow } from '../../windows/createCalendarWindow'
import { getMainWindow, showMainWindow } from '../../windows/mainWindowRef'
import { settingsStore } from '../settings/SettingsStore'
import { logger } from '../../utils/logger'

let tray: Tray | null = null

function trayIcon(): Electron.NativeImage {
  const candidates = [
    join(app.getAppPath(), 'resources', 'tray.png'),
    join(__dirname, '../../resources/tray.png'),
    join(__dirname, '../../../resources/tray.png'),
  ]
  for (const path of candidates) {
    const img = nativeImage.createFromPath(path)
    if (!img.isEmpty()) return img.resize({ width: 18, height: 18 })
  }
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA50lEQVR4nO1W0QnEIAx1gQzQCVykG7hBN+gWGSDfjuAmHeFGcIRyhxBBSrmql7uUw8CDUmzf07zEGDNiREcAoQXCGQgdIz3bb5NOQLgAoQfCDQgjEO6MyO88r5mkydMuA5M9L7DzWidFvgLho4L4iPTNKkEeO8gzYrcIPvaenZ+dRFs62HBBgDwjNBmTnVxjuFqkfy0tArwgeYavJbdc09ICtqpmxV3tE+e/q4i5RoATzn/pg+tquIMA9RTomtBol6G5SSPSbcVG+zIqROhdxwcROgNJIUJvJCtE6A2lJ2J+P5aP+Nt4AamMlSbc61D9AAAAAElFTkSuQmCC',
  )
}

function buildContextMenu(): Menu {
  const open = Boolean(getCalendarWindow())
  return Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => showMainWindow(),
    },
    {
      label: open ? '关闭桌面挂件' : '打开桌面挂件',
      click: () => {
        if (open) {
          getCalendarWindow()?.close()
        } else {
          createCalendarWindow()
        }
        refreshTrayMenu()
      },
    },
    { type: 'separator' },
    {
      label: '退出百宝箱',
      click: () => {
        app.quit()
      },
    },
  ])
}

function refreshTrayMenu(): void {
  tray?.setContextMenu(buildContextMenu())
}

export function ensureTray(): void {
  if (tray) {
    refreshTrayMenu()
    return
  }
  tray = new Tray(trayIcon())
  tray.setToolTip('百宝箱')
  tray.on('click', () => {
    const main = getMainWindow()
    if (main && !main.isDestroyed()) {
      if (main.isVisible()) main.focus()
      else showMainWindow()
    } else {
      showMainWindow()
    }
  })
  refreshTrayMenu()
  logger.info('tray ready')
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}

export function syncTrayVisibility(): void {
  const { enabled, keepAlive } = settingsStore.getDesktopWidget()
  const mainHidden = (() => {
    const main = getMainWindow()
    return !main || main.isDestroyed() || !main.isVisible()
  })()
  if (enabled || keepAlive || mainHidden) {
    ensureTray()
  }
}
