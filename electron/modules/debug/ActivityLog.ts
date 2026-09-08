import { shell } from 'electron'
import { existsSync, readFileSync, statSync } from 'node:fs'
import log from 'electron-log/main'
import type {
  ActivityLogAppendInput,
  ActivityLogEntry,
  ActivityLogLevel,
  ActivityLogQuery,
  ActivityLogSnapshot,
} from '@shared'
import { IpcChannels } from '@shared'
import { BrowserWindow } from 'electron'
import { logger } from '../../utils/logger'

const MAX_ENTRIES = 800
const buffer: ActivityLogEntry[] = []
let seq = 0

function emit(entry: ActivityLogEntry): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.debug.activityAppended, entry)
  }
}

export function appendActivity(input: ActivityLogAppendInput): ActivityLogEntry {
  const level: ActivityLogLevel = input.level ?? 'info'
  const entry: ActivityLogEntry = {
    id: `act_${Date.now().toString(36)}_${(++seq).toString(36)}`,
    ts: Date.now(),
    level,
    scope: input.scope || 'app',
    message: input.message,
    detail: input.detail,
  }
  buffer.push(entry)
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES)
  }

  const line = `[${entry.scope}] ${entry.message}${entry.detail ? ` | ${entry.detail}` : ''}`
  if (level === 'error') logger.error(line)
  else if (level === 'warn') logger.warn(line)
  else logger.info(line)

  emit(entry)
  return entry
}

export function listActivity(query: ActivityLogQuery = {}): ActivityLogEntry[] {
  let rows = buffer
  if (query.scope) {
    const prefix = query.scope
    rows = rows.filter((e) => e.scope === prefix || e.scope.startsWith(`${prefix}.`))
  }
  if (query.level) {
    rows = rows.filter((e) => e.level === query.level)
  }
  const limit = Math.min(Math.max(query.limit ?? 300, 1), MAX_ENTRIES)
  return rows.slice(-limit)
}

export function clearActivity(): void {
  buffer.length = 0
}

export function getMainLogPath(): string {
  return log.transports.file.getFile().path
}

export function openMainLogFile(): string {
  const path = getMainLogPath()
  void shell.showItemInFolder(path)
  return path
}

export function readMainLogTail(maxBytes = 180_000): string {
  const path = getMainLogPath()
  if (!existsSync(path)) return ''
  const size = statSync(path).size
  const start = Math.max(0, size - maxBytes)
  const buf = readFileSync(path)
  return buf.subarray(start).toString('utf8')
}

export function getActivitySnapshot(query?: ActivityLogQuery): ActivityLogSnapshot {
  return {
    entries: listActivity(query),
    mainLogPath: getMainLogPath(),
  }
}

/** Seed a boot line so Debug is never empty on first open. */
export function initActivityLog(): void {
  appendActivity({
    scope: 'app',
    level: 'info',
    message: 'Activity log ready',
    detail: `mainLog=${getMainLogPath()}`,
  })
}
