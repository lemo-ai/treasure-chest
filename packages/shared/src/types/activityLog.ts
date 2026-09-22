/** In-app activity / debug log entries (ring buffer in main). */

export type ActivityLogLevel = 'info' | 'warn' | 'error'

/** Minimum level written to disk / mirrored into the activity buffer. */
export type DebugWriteLevel = 'error' | 'warn' | 'info' | 'debug'

export interface DebugLogSettings {
  /** File + activity write threshold (electron-log level). */
  writeLevel: DebugWriteLevel
  /** Keep rotated log files for this many days (1–90). */
  retentionDays: number
  /** Rotate main.log when it exceeds this size in MB (1–50). */
  maxFileSizeMb: number
  /** Max in-memory activity rows retained for Settings → Debug. */
  maxActivityEntries: number
}

export const DEFAULT_DEBUG_LOG_SETTINGS: DebugLogSettings = {
  writeLevel: 'info',
  retentionDays: 14,
  maxFileSizeMb: 5,
  maxActivityEntries: 2000,
}

export interface ActivityLogEntry {
  id: string
  ts: number
  level: ActivityLogLevel
  /** Dot-separated scope, e.g. image.smart, image.install */
  scope: string
  message: string
  detail?: string
}

export interface ActivityLogAppendInput {
  level?: ActivityLogLevel
  scope: string
  message: string
  detail?: string
}

export interface ActivityLogQuery {
  scope?: string
  /** Minimum level to include (info ⊆ warn ⊆ error). */
  level?: ActivityLogLevel
  /** Only entries at/after this timestamp (ms). */
  sinceTs?: number
  limit?: number
}

export interface ActivityLogSnapshot {
  entries: ActivityLogEntry[]
  mainLogPath: string
  settings: DebugLogSettings
}
