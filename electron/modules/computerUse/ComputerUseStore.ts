import type { ComputerUseSettings, LlmToolSpec } from '@shared'
import { DEFAULT_COMPUTER_USE_SETTINGS } from '@shared'
import { getSetting, setSetting } from '../../db/AppSettingsRepo'

export type { ComputerUseSettings }

const KEY = 'computerUse.settings'

export function getComputerUseSettings(): ComputerUseSettings {
  const raw = getSetting<Partial<ComputerUseSettings>>(KEY, DEFAULT_COMPUTER_USE_SETTINGS)
  return {
    enabled: Boolean(raw?.enabled),
    allowHosts: Array.isArray(raw?.allowHosts)
      ? raw!.allowHosts.map((h) => String(h).trim().toLowerCase()).filter(Boolean).slice(0, 80)
      : [],
  }
}

export function setComputerUseSettings(next: Partial<ComputerUseSettings>): ComputerUseSettings {
  const cur = getComputerUseSettings()
  const merged: ComputerUseSettings = {
    enabled: next.enabled !== undefined ? Boolean(next.enabled) : cur.enabled,
    allowHosts:
      next.allowHosts !== undefined
        ? next.allowHosts.map((h) => String(h).trim().toLowerCase()).filter(Boolean).slice(0, 80)
        : cur.allowHosts,
  }
  setSetting(KEY, merged)
  return merged
}

export function isHostAllowed(urlStr: string, settings = getComputerUseSettings()): boolean {
  let host = ''
  try {
    const u = new URL(urlStr)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    host = u.hostname.toLowerCase()
  } catch {
    return false
  }
  if (!settings.allowHosts.length) return true
  return settings.allowHosts.some((rule) => {
    if (rule.startsWith('.')) return host === rule.slice(1) || host.endsWith(rule)
    return host === rule || host.endsWith(`.${rule}`)
  })
}

export const computerUseToolSpecs: LlmToolSpec[] = [
  {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description:
        'Open a URL in the app’s controlled browser (hidden window). Requires Computer Use enabled in Settings. Always confirm with the user for sensitive sites.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'http(s) URL to open' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_click',
      description: 'Click a CSS selector in the controlled browser (after browser_navigate).',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_type',
      description: 'Type text into an input matching a CSS selector in the controlled browser.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector' },
          text: { type: 'string', description: 'Text to type' },
          clear: { type: 'boolean', description: 'Clear existing value first (default true)' },
        },
        required: ['selector', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_read_text',
      description: 'Read visible text from the current page (optional CSS selector scope).',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'Optional CSS selector; default body' },
          maxChars: { type: 'number', description: 'Max characters (default 8000)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_screenshot',
      description: 'Capture a PNG screenshot of the controlled browser page; returns a data URL.',
      parameters: {
        type: 'object',
        properties: {
          fullPage: { type: 'boolean', description: 'Capture full page if supported (default false)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'os_open_url',
      description:
        'Open a URL in the user’s default system browser (not the controlled session). Use sparingly; requires approval.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'http(s) URL' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'os_open_path',
      description:
        'Open a local file or folder with the OS default app (user-selected paths / sandbox paths only). Requires approval.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path or path relative to coding project' },
        },
        required: ['path'],
      },
    },
  },
]

export const COMPUTER_USE_TOOL_NAMES = new Set(computerUseToolSpecs.map((t) => t.function.name))
