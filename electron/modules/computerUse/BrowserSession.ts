import { BrowserWindow, shell } from 'electron'
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import {
  COMPUTER_USE_TOOL_NAMES,
  getComputerUseSettings,
  isHostAllowed,
} from './ComputerUseStore'
import { getConfiguredSandboxRoot } from '../harness/coding/Sandbox'
import { logger } from '../../utils/logger'

let browserWin: BrowserWindow | null = null

function ensureBrowser(): BrowserWindow {
  if (browserWin && !browserWin.isDestroyed()) return browserWin
  browserWin = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: true,
    },
  })
  browserWin.on('closed', () => {
    browserWin = null
  })
  return browserWin
}

function jsonError(message: string): string {
  return JSON.stringify({ error: message })
}

async function waitLoad(win: BrowserWindow, timeoutMs = 45_000): Promise<void> {
  if (win.webContents.isLoading()) {
    await Promise.race([
      new Promise<void>((res) => {
        win.webContents.once('did-finish-load', () => res())
      }),
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('navigation_timeout')), timeoutMs)
      }),
    ])
  }
}

export async function executeComputerUseTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  if (!COMPUTER_USE_TOOL_NAMES.has(name)) {
    return jsonError(`unknown computer-use tool: ${name}`)
  }
  const settings = getComputerUseSettings()
  if (!settings.enabled) {
    return jsonError(
      'Computer Use is disabled. Enable it under Settings → Computer use (default off).',
    )
  }

  try {
    if (name === 'browser_navigate') {
      const url = String(args.url || '').trim()
      if (!url) return jsonError('url required')
      if (!isHostAllowed(url, settings)) {
        return jsonError(`host not in allowlist: ${url}`)
      }
      const win = ensureBrowser()
      await win.loadURL(url)
      await waitLoad(win)
      return JSON.stringify({ ok: true, url: win.webContents.getURL(), title: win.getTitle() })
    }

    if (name === 'browser_click') {
      const selector = String(args.selector || '').trim()
      if (!selector) return jsonError('selector required')
      const win = ensureBrowser()
      const result = await win.webContents.executeJavaScript(
        `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { ok: false, error: 'selector_not_found' };
          el.click();
          return { ok: true };
        })()`,
      )
      return JSON.stringify(result)
    }

    if (name === 'browser_type') {
      const selector = String(args.selector || '').trim()
      const text = String(args.text ?? '')
      const clear = args.clear !== false
      if (!selector) return jsonError('selector required')
      const win = ensureBrowser()
      const result = await win.webContents.executeJavaScript(
        `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { ok: false, error: 'selector_not_found' };
          if (${clear ? 'true' : 'false'} && 'value' in el) el.value = '';
          if ('value' in el) {
            el.focus();
            el.value = ${JSON.stringify(text)};
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            el.textContent = ${JSON.stringify(text)};
          }
          return { ok: true };
        })()`,
      )
      return JSON.stringify(result)
    }

    if (name === 'browser_read_text') {
      const selector = String(args.selector || 'body').trim() || 'body'
      const maxChars = Math.min(20_000, Math.max(200, Number(args.maxChars) || 8000))
      const win = ensureBrowser()
      const result = await win.webContents.executeJavaScript(
        `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { ok: false, error: 'selector_not_found' };
          const text = (el.innerText || el.textContent || '').trim();
          return {
            ok: true,
            text: text.slice(0, ${maxChars}),
            truncated: text.length > ${maxChars},
            url: location.href,
            title: document.title,
          };
        })()`,
      )
      return JSON.stringify(result)
    }

    if (name === 'browser_screenshot') {
      const win = ensureBrowser()
      const image = await win.webContents.capturePage()
      const png = image.toPNG()
      const dataUrl = `data:image/png;base64,${png.toString('base64')}`
      return JSON.stringify({
        ok: true,
        mime: 'image/png',
        bytes: png.byteLength,
        dataUrl: dataUrl.slice(0, 200_000),
        truncated: dataUrl.length > 200_000,
        url: win.webContents.getURL(),
      })
    }

    if (name === 'os_open_url') {
      const url = String(args.url || '').trim()
      if (!url) return jsonError('url required')
      if (!isHostAllowed(url, settings)) {
        return jsonError(`host not in allowlist: ${url}`)
      }
      await shell.openExternal(url)
      return JSON.stringify({ ok: true, url })
    }

    if (name === 'os_open_path') {
      const raw = String(args.path || '').trim()
      if (!raw) return jsonError('path required')
      let abs = raw
      if (!isAbsolute(raw)) {
        const root = getConfiguredSandboxRoot()
        if (!root) return jsonError('relative path requires an open coding project folder')
        abs = resolve(root, raw)
      }
      if (!existsSync(abs)) return jsonError(`path not found: ${abs}`)
      const err = await shell.openPath(abs)
      if (err) return jsonError(err)
      return JSON.stringify({ ok: true, path: abs })
    }

    return jsonError(`unhandled tool: ${name}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`[computer-use] ${name} failed: ${msg}`)
    return jsonError(msg)
  }
}

export function disposeComputerUseBrowser(): void {
  if (browserWin && !browserWin.isDestroyed()) {
    browserWin.destroy()
  }
  browserWin = null
}
