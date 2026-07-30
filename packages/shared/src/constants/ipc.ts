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
} as const

export type ThemeMode = 'light' | 'dark' | 'system'
export type AppLocale = 'zh-CN' | 'en-US'
