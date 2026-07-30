import { app, dialog } from 'electron'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import type { AppSettingsSnapshot, BirthProfile } from '@shared'
import { settingsStore } from '../settings/SettingsStore'
import { fortuneStore } from '../fortune/FortuneStore'
import { syncLaunchAtLogin } from '../system/LaunchService'
import { logger } from '../../utils/logger'
import { getMainWindow } from '../../windows/mainWindowRef'
import {
  notifyDesktopWidgetUpdated,
  syncDesktopWidgetFromSettings,
} from '../../windows/createCalendarWindow'

const BACKUP_MAGIC = 'treasure-chest-backup'
const FORMAT_VERSION = 1

export interface BackupPayload {
  magic: typeof BACKUP_MAGIC
  formatVersion: number
  appVersion: string
  exportedAt: string
  platform: NodeJS.Platform
  sections: {
    app_settings: AppSettingsSnapshot
    bazi_profiles: BirthProfile[]
  }
  checksum: string
}

function checksum(body: Omit<BackupPayload, 'checksum'>): string {
  const hash = createHash('sha256')
  hash.update(JSON.stringify(body))
  return `sha256:${hash.digest('hex')}`
}

function buildPayload(): BackupPayload {
  const profile = fortuneStore.getProfile()
  const body = {
    magic: BACKUP_MAGIC,
    formatVersion: FORMAT_VERSION,
    appVersion: app.getVersion(),
    exportedAt: new Date().toISOString(),
    platform: process.platform,
    sections: {
      app_settings: settingsStore.getSnapshot(),
      bazi_profiles: profile ? [profile] : [],
    },
  } satisfies Omit<BackupPayload, 'checksum'>
  return { ...body, checksum: checksum(body) }
}

function validatePayload(raw: unknown): BackupPayload {
  if (!raw || typeof raw !== 'object') throw new Error('invalid backup file')
  const data = raw as BackupPayload
  if (data.magic !== BACKUP_MAGIC) throw new Error('not a treasure-chest backup')
  if (data.formatVersion > FORMAT_VERSION) throw new Error('backup format too new')
  const expected = checksum({
    magic: data.magic,
    formatVersion: data.formatVersion,
    appVersion: data.appVersion,
    exportedAt: data.exportedAt,
    platform: data.platform,
    sections: data.sections,
  })
  if (data.checksum !== expected) throw new Error('checksum mismatch')
  return data
}

export async function exportBackup(): Promise<{ ok: boolean; path?: string; error?: string }> {
  const parent = getMainWindow()
  const stamp = new Date().toISOString().slice(0, 10)
  const { canceled, filePath } = parent
    ? await dialog.showSaveDialog(parent, {
        title: 'Export backup',
        defaultPath: `treasure-chest-backup-${stamp}.tchest`,
        filters: [{ name: 'Treasure Chest Backup', extensions: ['tchest', 'json'] }],
      })
    : await dialog.showSaveDialog({
        title: 'Export backup',
        defaultPath: `treasure-chest-backup-${stamp}.tchest`,
        filters: [{ name: 'Treasure Chest Backup', extensions: ['tchest', 'json'] }],
      })
  if (canceled || !filePath) return { ok: false }
  try {
    const payload = buildPayload()
    writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8')
    logger.info(`backup exported to ${filePath}`)
    return { ok: true, path: filePath }
  } catch (err) {
    logger.warn('backup export failed', err)
    return { ok: false, error: String(err) }
  }
}

export async function importBackup(): Promise<{ ok: boolean; error?: string }> {
  const parent = getMainWindow()
  const { canceled, filePaths } = parent
    ? await dialog.showOpenDialog(parent, {
        title: 'Import backup',
        filters: [{ name: 'Treasure Chest Backup', extensions: ['tchest', 'json'] }],
        properties: ['openFile'],
      })
    : await dialog.showOpenDialog({
        title: 'Import backup',
        filters: [{ name: 'Treasure Chest Backup', extensions: ['tchest', 'json'] }],
        properties: ['openFile'],
      })
  if (canceled || !filePaths[0]) return { ok: false }
  try {
    const raw = JSON.parse(readFileSync(filePaths[0], 'utf8')) as unknown
    const data = validatePayload(raw)
    const snap = data.sections.app_settings
    settingsStore.applySnapshot(snap)
    const profile = data.sections.bazi_profiles[0]
    if (profile) {
      fortuneStore.saveProfile(profile)
    } else {
      fortuneStore.clearProfile()
    }
    syncLaunchAtLogin()
    syncDesktopWidgetFromSettings()
    notifyDesktopWidgetUpdated()
    logger.info('backup imported')
    return { ok: true }
  } catch (err) {
    logger.warn('backup import failed', err)
    return { ok: false, error: String(err) }
  }
}
