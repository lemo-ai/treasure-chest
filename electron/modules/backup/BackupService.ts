import { app, dialog } from 'electron'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import type { AppSettingsSnapshot, BirthProfile, HarnessBackupSection, KnowledgeSettings, WatchlistItem } from '@shared'
import { DEFAULT_KNOWLEDGE_SETTINGS } from '@shared'
import { settingsStore } from '../settings/SettingsStore'
import { fortuneStore } from '../fortune/FortuneStore'
import { stocksStore } from '../stocks/StocksStore'
import { getKnowledgeSettings, setKnowledgeSettings } from '../knowledge/KnowledgeStore'
import { syncLaunchAtLogin } from '../system/LaunchService'
import { logger } from '../../utils/logger'
import { getMainWindow } from '../../windows/mainWindowRef'
import {
  notifyDesktopWidgetUpdated,
  syncDesktopWidgetFromSettings,
} from '../../windows/createCalendarWindow'
import { exportHarnessBackup, importHarnessBackup } from '../harness/HarnessBackup'

const BACKUP_MAGIC = 'treasure-chest-backup'
const FORMAT_VERSION = 3

export interface BackupPayload {
  magic: typeof BACKUP_MAGIC
  formatVersion: number
  appVersion: string
  exportedAt: string
  platform: NodeJS.Platform
  sections: {
    app_settings: AppSettingsSnapshot
    bazi_profiles: BirthProfile[]
    watchlist?: WatchlistItem[]
    knowledge_settings?: KnowledgeSettings
    harness?: HarnessBackupSection
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
      watchlist: stocksStore.getWatchlist(),
      knowledge_settings: getKnowledgeSettings(),
      harness: exportHarnessBackup(),
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
  const opts = {
    title: 'Export backup',
    defaultPath: `treasure-chest-backup-${stamp}.tchest`,
    filters: [{ name: 'Treasure Chest Backup', extensions: ['tchest', 'json'] }],
  }
  const { canceled, filePath } = parent
    ? await dialog.showSaveDialog(parent, opts)
    : await dialog.showSaveDialog(opts)
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
  const opts = {
    title: 'Import backup',
    filters: [{ name: 'Treasure Chest Backup', extensions: ['tchest', 'json'] }],
    properties: ['openFile' as const],
  }
  const { canceled, filePaths } = parent
    ? await dialog.showOpenDialog(parent, opts)
    : await dialog.showOpenDialog(opts)
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
    if (Array.isArray(data.sections.watchlist)) {
      for (const item of data.sections.watchlist) {
        try {
          stocksStore.upsertWatchlistItem({
            market: item.market,
            symbol: item.symbol,
            name: item.name,
            note: item.note,
          })
        } catch {
          /* skip invalid */
        }
      }
    }
    if (data.sections.knowledge_settings) {
      setKnowledgeSettings({
        ...DEFAULT_KNOWLEDGE_SETTINGS,
        ...data.sections.knowledge_settings,
      })
    }
    if (data.sections.harness) {
      importHarnessBackup(data.sections.harness)
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
