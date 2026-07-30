import type {
  AppLocale,
  AppSettingsSnapshot,
  BirthProfile,
  CalendarMode,
  DesktopWidgetSettings,
  DesktopWidgetView,
  LaunchBehavior,
  NotificationSettings,
  ThemeMode,
} from '@shared'

interface TreasureChestApi {
  getVersion: () => Promise<string>
  getTheme: () => Promise<ThemeMode>
  setTheme: (theme: ThemeMode) => Promise<ThemeMode>
  getLocale: () => Promise<AppLocale>
  setLocale: (locale: AppLocale) => Promise<AppLocale>
  getSettingsSnapshot: () => Promise<AppSettingsSnapshot>
  getDesktopWidget: () => Promise<DesktopWidgetView>
  setDesktopWidget: (partial: Partial<DesktopWidgetSettings>) => Promise<DesktopWidgetView>
  pickDialBackground: () => Promise<DesktopWidgetView>
  clearDialBackground: () => Promise<DesktopWidgetView>
  onDesktopWidgetUpdated: (listener: (settings: DesktopWidgetView) => void) => () => void
  openCalendarWindow: () => Promise<boolean>
  closeCalendarWindow: () => Promise<boolean>
  showMainWindow: () => Promise<boolean>
  startDialDrag: () => void
  endDialDrag: () => void
  getCalendarMode: () => Promise<CalendarMode>
  setCalendarMode: (mode: CalendarMode) => Promise<CalendarMode>
  getBirthProfile: () => Promise<BirthProfile | null>
  saveBirthProfile: (profile: BirthProfile) => Promise<BirthProfile>
  clearBirthProfile: () => Promise<boolean>
  exportBackup: () => Promise<{ ok: boolean; path?: string; error?: string }>
  importBackup: () => Promise<{ ok: boolean; error?: string }>
  getLaunchAtLogin: () => Promise<{ configured: boolean; system: boolean }>
  setLaunchAtLogin: (enabled: boolean) => Promise<{ configured: boolean; system: boolean }>
  setLaunchBehavior: (behavior: LaunchBehavior) => Promise<LaunchBehavior>
  setNotifications: (partial: Partial<NotificationSettings>) => Promise<NotificationSettings>
}

declare global {
  interface Window {
    treasureChest: TreasureChestApi
  }
}

export {}
