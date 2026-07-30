import type { AppLocale, ThemeMode } from '../constants/ipc'
import type { CalendarMode } from './calendar'

export type { AppLocale, ThemeMode }

/** Built-in circular dial faces for the desktop widget. */
export type DialFaceStyle = 'teal' | 'ink' | 'dawn' | 'minimal'

export const DIAL_FACE_STYLES: DialFaceStyle[] = ['teal', 'ink', 'dawn', 'minimal']

export interface DesktopWidgetSettings {
  /** Prefer showing the dial on app launch (closing the window does not clear this). */
  enabled: boolean
  /** Keep dial alive when the main window is closed. */
  keepAlive: boolean
  /** Selected dial face style. */
  dialFace: DialFaceStyle
  /** Absolute path to a custom dial background image (copied under userData). */
  backgroundImagePath: string | null
  /** Whether to draw tick marks / hour numbers on the dial. */
  showTicks: boolean
}

/** Runtime view of widget settings, with a renderable background URL. */
export interface DesktopWidgetView extends DesktopWidgetSettings {
  backgroundImageUrl: string | null
}

export interface AppSettingsSnapshot {
  theme: ThemeMode
  locale: AppLocale
  calendarMode: CalendarMode
  desktopWidget: DesktopWidgetSettings
}

export const DEFAULT_DESKTOP_WIDGET: DesktopWidgetSettings = {
  enabled: false,
  keepAlive: true,
  dialFace: 'teal',
  backgroundImagePath: null,
  showTicks: true,
}
