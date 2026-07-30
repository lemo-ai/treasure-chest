import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IpcChannels,
  type AppLocale,
  type AppSettingsSnapshot,
  type CalendarMode,
  type DesktopWidgetSettings,
  type DesktopWidgetView,
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
}

contextBridge.exposeInMainWorld('treasureChest', api)

export type TreasureChestApi = typeof api
