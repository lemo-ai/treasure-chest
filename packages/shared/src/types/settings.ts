import type { AppLocale, ThemeMode } from '../constants/ipc'
import type { CalendarMode } from './calendar'
import type { FortuneSettings } from './fortune'
import type { StocksSettings } from './stocks'
import type { McpSettings } from './mcp'

export type { AppLocale, ThemeMode }

/** App UI brand / accent palette (independent of light / dark mode). */
export type ThemeAccent =
  | 'teal'
  | 'azure'
  | 'rose'
  | 'violet'
  | 'forest'
  | 'amber'
  | 'coral'
  | 'slate'

export const THEME_ACCENTS: ThemeAccent[] = [
  'teal',
  'azure',
  'rose',
  'violet',
  'forest',
  'amber',
  'coral',
  'slate',
]

export const DEFAULT_THEME_ACCENT: ThemeAccent = 'teal'

/** Built-in circular dial faces for the desktop widget. */
export type DialFaceStyle =
  | 'teal'
  | 'ink'
  | 'dawn'
  | 'minimal'
  | 'azure'
  | 'rose'
  | 'violet'
  | 'forest'

export const DIAL_FACE_STYLES: DialFaceStyle[] = [
  'teal',
  'ink',
  'dawn',
  'minimal',
  'azure',
  'rose',
  'violet',
  'forest',
]

export interface DesktopWidgetSettings {
  /** Prefer showing the dial on app launch (closing the window does not clear this). */
  enabled: boolean
  /** Keep dial alive when the main window is closed. */
  keepAlive: boolean
  /** Selected dial face style. */
  dialFace: DialFaceStyle
  /** Absolute path to the active custom dial background image (under userData). */
  backgroundImagePath: string | null
  /** Absolute paths of previously used dial backgrounds (newest first). */
  backgroundImageHistory: string[]
  /** Whether to draw tick marks / hour numbers on the dial. */
  showTicks: boolean
}

export interface DialBackgroundHistoryItem {
  path: string
  url: string
}

/** Runtime view of widget settings, with a renderable background URL. */
export interface DesktopWidgetView extends DesktopWidgetSettings {
  backgroundImageUrl: string | null
  backgroundHistory: DialBackgroundHistoryItem[]
}

/** What to show right after the app launches. */
export type LaunchBehavior = 'main' | 'tray' | 'widget'

export interface NotificationSettings {
  /** Push a desktop notification when today's fortune is ready. */
  fortuneDaily: boolean
  /** Hour (0–23) to notify if the app is running; also fires on first open after this hour. */
  fortuneNotifyHour: number
  /** Push when a daily stocks report finishes (auto or after first run of the day). */
  stocksDaily: boolean
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  fortuneDaily: false,
  fortuneNotifyHour: 8,
  stocksDaily: false,
}

export interface AppSettingsSnapshot {
  theme: ThemeMode
  /** Brand color palette for UI chrome (buttons, chips, highlights). */
  accent: ThemeAccent
  locale: AppLocale
  calendarMode: CalendarMode
  desktopWidget: DesktopWidgetSettings
  launchAtLogin: boolean
  launchBehavior: LaunchBehavior
  notifications: NotificationSettings
  fortune: FortuneSettings
  stocks: StocksSettings
  mcp: McpSettings
}

export const DEFAULT_LAUNCH_AT_LOGIN = true

export const DEFAULT_LAUNCH_BEHAVIOR: LaunchBehavior = 'main'

export const DEFAULT_DESKTOP_WIDGET: DesktopWidgetSettings = {
  enabled: false,
  keepAlive: true,
  dialFace: 'teal',
  backgroundImagePath: null,
  backgroundImageHistory: [],
  showTicks: true,
}
