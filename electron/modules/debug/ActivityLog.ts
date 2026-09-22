import { shell } from 'electron'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { inspect } from 'node:util'
import log from 'electron-log/main'
import type {
  ActivityLogAppendInput,
  ActivityLogEntry,
  ActivityLogLevel,
  ActivityLogQuery,
  ActivityLogSnapshot,
  DebugLogSettings,
  DebugWriteLevel,
} from '@shared'
import { DEFAULT_DEBUG_LOG_SETTINGS, IpcChannels } from '@shared'
import { BrowserWindow } from 'electron'
import { getSetting, setSetting } from '../../db/AppSettingsRepo'
import { logger } from '../../utils/logger'

const SETTINGS_KEY = 'debug.log'
const buffer: ActivityLogEntry[] = []
let seq = 0
let settings: DebugLogSettings = { ...DEFAULT_DEBUG_LOG_SETTINGS }
let transportAttached = false

/** When appendActivity writes to electron-log, skip mirroring that line back into the buffer. */
let suppressLoggerMirror = false

const LEVEL_RANK: Record<ActivityLogLevel, number> = {
  info: 0,
  warn: 1,
  error: 2,
}

const WRITE_LEVEL_RANK: Record<DebugWriteLevel, number> = {
  error: 3,
  warn: 2,
  info: 1,
  debug: 0,
}

function emit(entry: ActivityLogEntry): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.debug.activityAppended, entry)
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function parseWriteLevel(value: unknown): DebugWriteLevel {
  if (value === 'error' || value === 'warn' || value === 'info' || value === 'debug') return value
  return DEFAULT_DEBUG_LOG_SETTINGS.writeLevel
}

export function parseDebugLogSettings(raw: unknown): DebugLogSettings {
  const src = (raw ?? {}) as Partial<DebugLogSettings>
  return {
    writeLevel: parseWriteLevel(src.writeLevel),
    retentionDays: clampInt(src.retentionDays, 1, 90, DEFAULT_DEBUG_LOG_SETTINGS.retentionDays),
    maxFileSizeMb: clampInt(src.maxFileSizeMb, 1, 50, DEFAULT_DEBUG_LOG_SETTINGS.maxFileSizeMb),
    maxActivityEntries: clampInt(
      src.maxActivityEntries,
      200,
      5000,
      DEFAULT_DEBUG_LOG_SETTINGS.maxActivityEntries,
    ),
  }
}

function trimBuffer(): void {
  const max = settings.maxActivityEntries
  if (buffer.length > max) buffer.splice(0, buffer.length - max)
}

function pushEntry(input: {
  level: ActivityLogLevel
  scope: string
  message: string
  detail?: string
  ts?: number
}): ActivityLogEntry {
  const entry: ActivityLogEntry = {
    id: `act_${Date.now().toString(36)}_${(++seq).toString(36)}`,
    ts: input.ts ?? Date.now(),
    level: input.level,
    scope: input.scope || 'app',
    message: input.message,
    detail: input.detail,
  }
  buffer.push(entry)
  trimBuffer()
  emit(entry)
  return entry
}

function formatLogData(data: unknown[]): { message: string; detail?: string } {
  if (!data.length) return { message: '' }
  const parts = data.map((item) => {
    if (typeof item === 'string') return item
    if (item instanceof Error) return item.stack || item.message
    try {
      return inspect(item, { depth: 3, breakLength: 120, compact: true })
    } catch {
      return String(item)
    }
  })
  const joined = parts.join(' ').trim()
  if (joined.length <= 400) return { message: joined || '(empty)' }
  return { message: `${joined.slice(0, 400)}…`, detail: joined.slice(0, 2000) }
}

function toActivityLevel(level: string): ActivityLogLevel | null {
  if (level === 'error') return 'error'
  if (level === 'warn') return 'warn'
  if (level === 'info' || level === 'verbose' || level === 'debug' || level === 'silly') {
    return 'info'
  }
  return null
}

function electronLevel(level: DebugWriteLevel): DebugWriteLevel {
  return level
}

function logDir(): string {
  try {
    return dirname(log.transports.file.getFile().path)
  } catch {
    return ''
  }
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** Delete rotated log files older than retentionDays. */
export function pruneOldLogFiles(): number {
  const dir = logDir()
  if (!dir || !existsSync(dir)) return 0
  const cutoff = Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000
  let removed = 0
  for (const name of readdirSync(dir)) {
    // Keep the active main.log / renderer.log; prune archives and dated rotations.
    if (name === 'main.log' || name === 'renderer.log') continue
    if (!name.includes('.log')) continue
    const full = join(dir, name)
    try {
      const st = statSync(full)
      if (!st.isFile()) continue
      if (st.mtimeMs < cutoff) {
        unlinkSync(full)
        removed += 1
      }
    } catch {
      /* ignore */
    }
  }
  return removed
}

function installArchiveFn(): void {
  log.transports.file.archiveLogFn = (oldLogFile) => {
    try {
      const info = oldLogFile as { path: string }
      const archived = `${info.path}.${stamp()}`
      if (existsSync(info.path)) renameSync(info.path, archived)
    } catch {
      /* fall through */
    }
    pruneOldLogFiles()
  }
}

export function applyDebugLogSettings(next: DebugLogSettings): DebugLogSettings {
  settings = parseDebugLogSettings(next)
  const level = electronLevel(settings.writeLevel)
  log.transports.file.level = level
  log.transports.console.level = level
  if (log.transports.activity) log.transports.activity.level = level
  log.transports.file.maxSize = settings.maxFileSizeMb * 1024 * 1024
  installArchiveFn()
  trimBuffer()
  pruneOldLogFiles()
  return { ...settings }
}

export function getDebugLogSettings(): DebugLogSettings {
  return { ...settings }
}

export function loadAndApplyDebugLogSettings(): DebugLogSettings {
  try {
    settings = parseDebugLogSettings(getSetting(SETTINGS_KEY, DEFAULT_DEBUG_LOG_SETTINGS))
  } catch {
    settings = { ...DEFAULT_DEBUG_LOG_SETTINGS }
  }
  return applyDebugLogSettings(settings)
}

export function setDebugLogSettings(partial: Partial<DebugLogSettings>): DebugLogSettings {
  const next = parseDebugLogSettings({ ...settings, ...partial })
  try {
    setSetting(SETTINGS_KEY, next)
  } catch {
    /* DB may not be ready yet; still apply in-memory */
  }
  return applyDebugLogSettings(next)
}

/**
 * Mirror every main-process electron-log line into the in-app activity buffer
 * so Settings → Debug shows the same stream as main.log (recent window).
 */
export function attachLoggerActivityTransport(): void {
  if (transportAttached) return
  transportAttached = true

  const transport = ((message: {
    data: unknown[]
    date: Date
    level: string
    scope?: string
  }) => {
    if (suppressLoggerMirror) return
    const level = toActivityLevel(message.level)
    if (!level) return
    // Respect write-level threshold for the activity mirror as well.
    const mapped: DebugWriteLevel =
      message.level === 'error'
        ? 'error'
        : message.level === 'warn'
          ? 'warn'
          : message.level === 'info'
            ? 'info'
            : 'debug'
    if (WRITE_LEVEL_RANK[mapped] < WRITE_LEVEL_RANK[settings.writeLevel]) return
    const { message: text, detail } = formatLogData(message.data)
    if (!text) return
    pushEntry({
      level,
      scope: message.scope?.trim() || 'main',
      message: text,
      detail,
      ts: message.date?.getTime?.() || Date.now(),
    })
  }) as typeof log.transports.console

  transport.level = electronLevel(settings.writeLevel)
  transport.transforms = []
  log.transports.activity = transport
}

export function appendActivity(input: ActivityLogAppendInput): ActivityLogEntry {
  const level: ActivityLogLevel = input.level ?? 'info'
  const entry = pushEntry({
    level,
    scope: input.scope || 'app',
    message: input.message,
    detail: input.detail,
  })

  const line = `[${entry.scope}] ${entry.message}${entry.detail ? ` | ${entry.detail}` : ''}`
  suppressLoggerMirror = true
  try {
    if (level === 'error') logger.error(line)
    else if (level === 'warn') logger.warn(line)
    else logger.info(line)
  } finally {
    suppressLoggerMirror = false
  }

  return entry
}

export function listActivity(query: ActivityLogQuery = {}): ActivityLogEntry[] {
  let rows = buffer
  if (query.scope) {
    const prefix = query.scope
    rows = rows.filter((e) => e.scope === prefix || e.scope.startsWith(`${prefix}.`))
  }
  if (query.level) {
    const min = LEVEL_RANK[query.level]
    rows = rows.filter((e) => LEVEL_RANK[e.level] >= min)
  }
  if (typeof query.sinceTs === 'number' && Number.isFinite(query.sinceTs)) {
    rows = rows.filter((e) => e.ts >= query.sinceTs!)
  }
  const limit = Math.min(Math.max(query.limit ?? 300, 1), settings.maxActivityEntries)
  return rows.slice(-limit)
}

export function clearActivity(): void {
  buffer.length = 0
}

export function getMainLogPath(): string {
  try {
    return log.transports.file.getFile().path
  } catch {
    return ''
  }
}

export function openMainLogFile(): string {
  const path = getMainLogPath()
  if (path) {
    const dir = dirname(path)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    void shell.showItemInFolder(path)
  }
  return path
}

export function readMainLogTail(maxBytes = 180_000): string {
  const path = getMainLogPath()
  if (!path || !existsSync(path)) return ''
  const size = statSync(path).size
  const start = Math.max(0, size - maxBytes)
  const buf = readFileSync(path)
  return buf.subarray(start).toString('utf8')
}

export function getActivitySnapshot(query?: ActivityLogQuery): ActivityLogSnapshot {
  return {
    entries: listActivity(query),
    mainLogPath: getMainLogPath(),
    settings: getDebugLogSettings(),
  }
}

/** Seed a boot line so Debug is never empty on first open. */
export function initActivityLog(): void {
  attachLoggerActivityTransport()
  loadAndApplyDebugLogSettings()
  appendActivity({
    scope: 'app',
    level: 'info',
    message: 'Activity log ready',
    detail: `mainLog=${getMainLogPath()}; level=${settings.writeLevel}; retain=${settings.retentionDays}d`,
  })
}
