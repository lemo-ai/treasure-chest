export const IpcChannels = {
  app: {
    getVersion: 'app:getVersion',
  },
  settings: {
    getTheme: 'settings:getTheme',
    setTheme: 'settings:setTheme',
    getLocale: 'settings:getLocale',
    setLocale: 'settings:setLocale',
    getSnapshot: 'settings:getSnapshot',
    getDesktopWidget: 'settings:getDesktopWidget',
    setDesktopWidget: 'settings:setDesktopWidget',
    desktopWidgetUpdated: 'settings:desktopWidgetUpdated',
    pickDialBackground: 'settings:pickDialBackground',
    clearDialBackground: 'settings:clearDialBackground',
    setLaunchBehavior: 'settings:setLaunchBehavior',
  },
  window: {
    openCalendar: 'window:openCalendar',
    closeCalendar: 'window:closeCalendar',
    showMain: 'window:showMain',
    dialDragStart: 'window:dialDragStart',
    dialDragEnd: 'window:dialDragEnd',
  },
  calendar: {
    getMode: 'calendar:getMode',
    setMode: 'calendar:setMode',
  },
  fortune: {
    getProfile: 'fortune:getProfile',
    saveProfile: 'fortune:saveProfile',
    clearProfile: 'fortune:clearProfile',
  },
  backup: {
    export: 'backup:export',
    import: 'backup:import',
  },
  system: {
    getLaunchAtLogin: 'system:getLaunchAtLogin',
    setLaunchAtLogin: 'system:setLaunchAtLogin',
  },
} as const

export type ThemeMode = 'light' | 'dark' | 'system'
export type AppLocale = 'zh-CN' | 'en-US'
