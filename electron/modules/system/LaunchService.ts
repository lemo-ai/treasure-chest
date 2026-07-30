import { app } from 'electron'
import { settingsStore } from '../settings/SettingsStore'
import { logger } from '../../utils/logger'

export function syncLaunchAtLogin(): void {
  const openAtLogin = settingsStore.getLaunchAtLogin()
  try {
    app.setLoginItemSettings({
      openAtLogin,
      openAsHidden: settingsStore.getLaunchBehavior() === 'tray',
    })
    logger.info(`launch at login=${openAtLogin}`)
  } catch (err) {
    logger.warn('setLoginItemSettings failed', err)
  }
}

export function readSystemLaunchAtLogin(): boolean {
  try {
    return app.getLoginItemSettings().openAtLogin
  } catch {
    return settingsStore.getLaunchAtLogin()
  }
}
