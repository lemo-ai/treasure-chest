/** In-app activity / debug log entries (ring buffer in main). */

export type ActivityLogLevel = 'info' | 'warn' | 'error'

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
  level?: ActivityLogLevel
  limit?: number
}

export interface ActivityLogSnapshot {
  entries: ActivityLogEntry[]
  mainLogPath: string
}
