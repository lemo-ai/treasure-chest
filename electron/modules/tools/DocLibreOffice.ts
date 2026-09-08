import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { BrowserWindow, dialog, shell } from 'electron'
import { getSetting, setSetting } from '../../db/AppSettingsRepo'
import { logger } from '../../utils/logger'

export type OfficeConvertTarget =
  | 'pdf'
  | 'docx'
  | 'odt'
  | 'pptx'
  | 'odp'
  | 'xlsx'
  | 'ods'
  | 'html'
  | 'txt'

export type LibreOfficeStatus = {
  ok: boolean
  path?: string
  version?: string
  error?: string
  /** User-configured path (may be empty when using auto-detect). */
  customPath?: string
  source?: 'custom' | 'auto' | 'none'
}

type LibreOfficeSettings = {
  customPath: string
}

const SETTINGS_KEY = 'libreOffice'
const DOWNLOAD_URL = 'https://www.libreoffice.org/download/download-libreoffice/'

const CANDIDATES: string[] = [
  process.env.LIBREOFFICE_PATH || '',
  process.env.SOFFICE_PATH || '',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/local/bin/soffice',
  '/opt/homebrew/bin/soffice',
  '/usr/bin/soffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
]

function readSettings(): LibreOfficeSettings {
  const raw = getSetting<Partial<LibreOfficeSettings>>(SETTINGS_KEY, { customPath: '' })
  return {
    customPath: typeof raw.customPath === 'string' ? raw.customPath.trim() : '',
  }
}

function writeSettings(next: LibreOfficeSettings): void {
  setSetting(SETTINGS_KEY, next)
}

export function getLibreOfficeCustomPath(): string {
  return readSettings().customPath
}

export function setLibreOfficeCustomPath(path: string): LibreOfficeSettings {
  const customPath = path.trim()
  writeSettings({ customPath })
  return { customPath }
}

export function clearLibreOfficeCustomPath(): LibreOfficeSettings {
  writeSettings({ customPath: '' })
  return { customPath: '' }
}

function whichOnPath(bin: string): string | null {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], {
      encoding: 'utf8',
      windowsHide: true,
    })
    const line = out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean)
    return line && existsSync(line) ? line : null
  } catch {
    return null
  }
}

/** Prefer user custom path; otherwise auto-detect common installs / PATH. */
export function resolveSofficePath(): {
  path: string | null
  source: 'custom' | 'auto' | 'none'
  customPath: string
} {
  const customPath = getLibreOfficeCustomPath()
  if (customPath) {
    return {
      path: existsSync(customPath) ? customPath : null,
      source: 'custom',
      customPath,
    }
  }
  for (const p of CANDIDATES) {
    if (p && existsSync(p)) return { path: p, source: 'auto', customPath: '' }
  }
  const fromPath = whichOnPath('soffice') || whichOnPath('libreoffice')
  if (fromPath) return { path: fromPath, source: 'auto', customPath: '' }
  return { path: null, source: 'none', customPath: '' }
}

function runSoffice(
  bin: string,
  args: string[],
  timeoutMs = 120_000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('libreoffice_timeout'))
    }, timeoutMs)
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString()
    })
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString()
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

export async function checkLibreOffice(): Promise<LibreOfficeStatus> {
  const resolved = resolveSofficePath()
  if (!resolved.path) {
    return {
      ok: false,
      error: resolved.source === 'custom' ? 'custom_path_missing' : 'libreoffice_not_found',
      customPath: resolved.customPath || undefined,
      source: resolved.source,
      path: resolved.customPath || undefined,
    }
  }
  try {
    const { code, stdout, stderr } = await runSoffice(resolved.path, ['--version'], 15_000)
    const text = `${stdout}\n${stderr}`.trim()
    const version = text.split(/\r?\n/).find(Boolean) || undefined
    if (code !== 0 && !version) {
      return {
        ok: false,
        path: resolved.path,
        customPath: resolved.customPath || undefined,
        source: resolved.source,
        error: stderr.slice(-200) || `exit ${code}`,
      }
    }
    return {
      ok: true,
      path: resolved.path,
      version,
      customPath: resolved.customPath || undefined,
      source: resolved.source,
    }
  } catch (err) {
    return {
      ok: false,
      path: resolved.path,
      customPath: resolved.customPath || undefined,
      source: resolved.source,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function pickLibreOfficeBinary(): Promise<LibreOfficeStatus> {
  const win = BrowserWindow.getFocusedWindow()
  const isMac = process.platform === 'darwin'
  const opts: Electron.OpenDialogOptions = isMac
    ? {
        properties: ['openFile'],
        message: 'Select LibreOffice soffice binary (or LibreOffice.app)',
        filters: [
          { name: 'LibreOffice', extensions: ['app', '*'] },
          { name: 'All', extensions: ['*'] },
        ],
      }
    : {
        properties: ['openFile'],
        filters: [
          { name: 'soffice', extensions: process.platform === 'win32' ? ['exe'] : ['*'] },
          { name: 'All', extensions: ['*'] },
        ],
      }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (result.canceled || !result.filePaths[0]) {
    return checkLibreOffice()
  }
  let selected = result.filePaths[0]
  // macOS: user may pick LibreOffice.app
  if (isMac && selected.endsWith('.app')) {
    const nested = join(selected, 'Contents/MacOS/soffice')
    if (existsSync(nested)) selected = nested
  }
  if (!existsSync(selected)) {
    return {
      ok: false,
      error: 'custom_path_missing',
      customPath: selected,
      source: 'custom',
      path: selected,
    }
  }
  setLibreOfficeCustomPath(selected)
  return checkLibreOffice()
}

export async function openLibreOfficeDownload(): Promise<void> {
  await shell.openExternal(DOWNLOAD_URL)
}

const TARGET_FILTER: Record<OfficeConvertTarget, string[]> = {
  pdf: ['pdf'],
  docx: ['docx'],
  odt: ['odt'],
  pptx: ['pptx'],
  odp: ['odp'],
  xlsx: ['xlsx'],
  ods: ['ods'],
  html: ['html', 'htm'],
  txt: ['txt'],
}

const SOURCE_FILTER = [
  {
    name: 'Office',
    extensions: [
      'doc',
      'docx',
      'odt',
      'ppt',
      'pptx',
      'odp',
      'xls',
      'xlsx',
      'ods',
      'rtf',
      'csv',
      'html',
      'htm',
      'txt',
    ],
  },
  { name: 'PDF', extensions: ['pdf'] },
]

async function pickOfficeInput(): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow()
  const opts: Electron.OpenDialogOptions = {
    properties: ['openFile'],
    filters: SOURCE_FILTER,
  }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
}

async function chooseOutputPath(defaultPath: string, extensions: string[]): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow()
  const opts: Electron.SaveDialogOptions = {
    defaultPath,
    filters: [{ name: 'Document', extensions }],
  }
  const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (result.canceled || !result.filePath) return null
  return result.filePath
}

function findConvertedFile(outDir: string, baseName: string, targetExt: string): string | null {
  const expected = join(outDir, `${baseName}.${targetExt}`)
  if (existsSync(expected)) return expected
  const files = readdirSync(outDir)
  const match = files.find((f) => f.toLowerCase().endsWith(`.${targetExt}`))
  return match ? join(outDir, match) : null
}

/**
 * Convert Office/PDF documents via LibreOffice headless.
 * Requires a system install of LibreOffice (`soffice`).
 */
export async function convertWithLibreOffice(payload: {
  inputPath?: string
  target: OfficeConvertTarget
}): Promise<{ ok: boolean; path?: string; error?: string }> {
  const status = await checkLibreOffice()
  if (!status.ok || !status.path) {
    return { ok: false, error: status.error || 'libreoffice_not_found' }
  }

  let inputPath = payload.inputPath
  if (!inputPath || !existsSync(inputPath)) {
    inputPath = (await pickOfficeInput()) || undefined
  }
  if (!inputPath) return { ok: false, error: 'cancelled' }

  const target = payload.target
  const ext = TARGET_FILTER[target]?.[0] || 'pdf'
  const defaultName = `${basename(inputPath, extname(inputPath))}.${ext}`
  const outPath = await chooseOutputPath(
    join(dirname(inputPath), defaultName),
    TARGET_FILTER[target],
  )
  if (!outPath) return { ok: false, error: 'cancelled' }

  const workDir = await mkdtemp(join(tmpdir(), 'treasure-lo-'))
  try {
    const inputCopy = join(workDir, basename(inputPath))
    await copyFile(inputPath, inputCopy)
    const { code, stderr } = await runSoffice(
      status.path,
      [
        '--headless',
        '--nologo',
        '--nofirststartwizard',
        '--norestore',
        '--convert-to',
        target,
        '--outdir',
        workDir,
        inputCopy,
      ],
      180_000,
    )
    if (code !== 0) {
      logger.warn(`LibreOffice convert failed: ${stderr.slice(-400)}`)
      return { ok: false, error: stderr.slice(-240) || `soffice exit ${code}` }
    }
    const base = basename(inputCopy, extname(inputCopy))
    const produced = findConvertedFile(workDir, base, ext)
    if (!produced) {
      return { ok: false, error: 'convert_output_missing' }
    }
    await copyFile(produced, outPath)
    return { ok: true, path: outPath }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`LibreOffice convert error: ${msg}`)
    return { ok: false, error: msg }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
