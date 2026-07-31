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
    selectDialBackground: 'settings:selectDialBackground',
    deleteDialBackground: 'settings:deleteDialBackground',
    setLaunchBehavior: 'settings:setLaunchBehavior',
    setNotifications: 'settings:setNotifications',
    setFortuneSettings: 'settings:setFortuneSettings',
    setStocksSettings: 'settings:setStocksSettings',
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
    generateAiAnalysis: 'fortune:generateAiAnalysis',
    testAiConnection: 'fortune:testAiConnection',
  },
  workbench: {
    chat: 'workbench:chat',
  },
  stocks: {
    getWatchlist: 'stocks:getWatchlist',
    addWatchlistItem: 'stocks:addWatchlistItem',
    removeWatchlistItem: 'stocks:removeWatchlistItem',
    getScannerPool: 'stocks:getScannerPool',
    addScannerPoolItem: 'stocks:addScannerPoolItem',
    removeScannerPoolItem: 'stocks:removeScannerPoolItem',
    importWatchlistCsv: 'stocks:importWatchlistCsv',
    exportWatchlistCsv: 'stocks:exportWatchlistCsv',
    importScannerCsv: 'stocks:importScannerCsv',
    exportScannerCsv: 'stocks:exportScannerCsv',
    generateReport: 'stocks:generateReport',
    getLatestReport: 'stocks:getLatestReport',
    listReports: 'stocks:listReports',
    getReportByDate: 'stocks:getReportByDate',
    getQuote: 'stocks:getQuote',
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
