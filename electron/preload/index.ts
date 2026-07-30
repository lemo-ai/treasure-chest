import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IpcChannels,
  type AppLocale,
  type AppSettingsSnapshot,
  type BirthProfile,
  type CalendarMode,
  type DesktopWidgetSettings,
  type DesktopWidgetView,
  type LaunchBehavior,
  type NotificationSettings,
  type FortuneSettings,
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
  getBirthProfile: (): Promise<BirthProfile | null> =>
    ipcRenderer.invoke(IpcChannels.fortune.getProfile),
  saveBirthProfile: (profile: BirthProfile): Promise<BirthProfile> =>
    ipcRenderer.invoke(IpcChannels.fortune.saveProfile, profile),
  clearBirthProfile: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.fortune.clearProfile),
  exportBackup: (): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.backup.export),
  importBackup: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.backup.import),
  getLaunchAtLogin: (): Promise<{ configured: boolean; system: boolean }> =>
    ipcRenderer.invoke(IpcChannels.system.getLaunchAtLogin),
  setLaunchAtLogin: (enabled: boolean): Promise<{ configured: boolean; system: boolean }> =>
    ipcRenderer.invoke(IpcChannels.system.setLaunchAtLogin, enabled),
  setLaunchBehavior: (behavior: LaunchBehavior): Promise<LaunchBehavior> =>
    ipcRenderer.invoke(IpcChannels.settings.setLaunchBehavior, behavior),
  setNotifications: (partial: Partial<NotificationSettings>): Promise<NotificationSettings> =>
    ipcRenderer.invoke(IpcChannels.settings.setNotifications, partial),
  setFortuneSettings: (partial: Partial<FortuneSettings>): Promise<FortuneSettings> =>
    ipcRenderer.invoke(IpcChannels.settings.setFortuneSettings, partial),
}

contextBridge.exposeInMainWorld('treasureChest', api)

export type TreasureChestApi = typeof api
