import { app, net } from 'electron'
import { execFile, execFileSync } from 'node:child_process'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import { appendActivity } from '../debug/ActivityLog'
import { logger } from '../../utils/logger'

const execFileAsync = promisify(execFile)

/** Pinned Node LTS used when the OS has no usable node/npx. */
export const BUNDLED_NODE_VERSION = '22.14.0'

export type NodeRuntimeInfo = {
  source: 'system' | 'bundled'
  versionHint: string
  binDir: string
  nodePath: string
  npxPath: string
  npmPath: string
}

let cached: NodeRuntimeInfo | null = null
let ensurePromise: Promise<NodeRuntimeInfo> | null = null

function runtimeRoot(): string {
  return join(app.getPath('userData'), 'runtimes', `node-v${BUNDLED_NODE_VERSION}`)
}

function binName(base: 'node' | 'npx' | 'npm'): string {
  if (process.platform === 'win32') {
    if (base === 'node') return 'node.exe'
    return `${base}.cmd`
  }
  return base
}

function whichOnPath(name: string): string | null {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const out = execFileSync(cmd, [name], {
      encoding: 'utf8',
      timeout: 4000,
      env: process.env,
    })
    const line = out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s && existsSync(s))
    return line || null
  } catch {
    return null
  }
}

function home(...parts: string[]): string {
  return join(homedir(), ...parts)
}

/** Common locations GUI Electron apps often miss (Homebrew / nvm / fnm / volta). */
function candidateBins(base: 'node' | 'npx' | 'npm'): string[] {
  const file = binName(base)
  const list: string[] = []
  if (process.platform === 'darwin') {
    list.push(
      `/opt/homebrew/bin/${file}`,
      `/usr/local/bin/${file}`,
      home('.nvm/current/bin', file),
      home('.fnm/current/bin', file),
      home('.volta/bin', file),
      home('.local/share/fnm/current/bin', file),
    )
  } else if (process.platform === 'linux') {
    list.push(
      `/usr/local/bin/${file}`,
      `/usr/bin/${file}`,
      home('.nvm/current/bin', file),
      home('.fnm/current/bin', file),
      home('.volta/bin', file),
      home('.local/share/fnm/current/bin', file),
    )
  } else if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles || 'C:\\Program Files'
    const la = process.env.LOCALAPPDATA || ''
    list.push(
      join(pf, 'nodejs', file),
      join(la, 'Programs', 'node', file),
      join(homedir(), 'AppData', 'Roaming', 'npm', file),
    )
  }
  try {
    const nvmVersions = home('.nvm', 'versions', 'node')
    if (existsSync(nvmVersions)) {
      const vers = readdirSync(nvmVersions)
        .filter((v) => v.startsWith('v'))
        .sort()
        .reverse()
        .slice(0, 5)
      for (const v of vers) list.push(join(nvmVersions, v, 'bin', file))
    }
  } catch {
    /* ignore */
  }
  return list
}

function findExisting(base: 'node' | 'npx' | 'npm'): string | null {
  for (const p of candidateBins(base)) {
    if (p && existsSync(p)) return p
  }
  return whichOnPath(binName(base)) || whichOnPath(base)
}

function bundledPaths(): { binDir: string; node: string; npx: string; npm: string } | null {
  const root = runtimeRoot()
  const binDir = process.platform === 'win32' ? root : join(root, 'bin')
  const node = join(binDir, binName('node'))
  const npx = join(binDir, binName('npx'))
  const npm = join(binDir, binName('npm'))
  if (existsSync(node) && existsSync(npx)) {
    return { binDir, node, npx, npm }
  }
  return null
}

function platformArchive(): { fileName: string; stripComponents: number } {
  const v = BUNDLED_NODE_VERSION
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : process.arch
  if (process.platform === 'darwin') {
    return { fileName: `node-v${v}-darwin-${arch}.tar.gz`, stripComponents: 1 }
  }
  if (process.platform === 'linux') {
    return { fileName: `node-v${v}-linux-${arch}.tar.xz`, stripComponents: 1 }
  }
  if (process.platform === 'win32') {
    return {
      fileName: `node-v${v}-win-${arch === 'arm64' ? 'arm64' : 'x64'}.zip`,
      stripComponents: 1,
    }
  }
  throw new Error(`unsupported_platform:${process.platform}/${process.arch}`)
}

function downloadUrls(fileName: string): string[] {
  const v = BUNDLED_NODE_VERSION
  return [
    `https://npmmirror.com/mirrors/node/v${v}/${fileName}`,
    `https://nodejs.org/dist/v${v}/${fileName}`,
  ]
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await net.fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'treasure-chest-node-runtime/1.0',
      Accept: '*/*',
    },
  })
  if (!response.ok || !response.body) {
    throw new Error(`download_failed_${response.status}:${url}`)
  }
  const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream)
  await pipeline(nodeStream, createWriteStream(dest))
  const st = statSync(dest)
  if (st.size < 1_000_000) {
    throw new Error(`download_too_small:${st.size}`)
  }
}

async function extractArchive(archive: string, dest: string, stripComponents: number): Promise<void> {
  mkdirSync(dest, { recursive: true })
  if (process.platform === 'win32') {
    const staging = `${dest}.extract`
    rmSync(staging, { recursive: true, force: true })
    mkdirSync(staging, { recursive: true })
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${archive.replace(/'/g, "''")}' -DestinationPath '${staging.replace(/'/g, "''")}' -Force`,
      ],
      { timeout: 120_000 },
    )
    const kids = readdirSync(staging)
    const inner = kids.length === 1 ? join(staging, kids[0]!) : staging
    for (const name of readdirSync(inner)) {
      const from = join(inner, name)
      const to = join(dest, name)
      rmSync(to, { recursive: true, force: true })
      renameSync(from, to)
    }
    rmSync(staging, { recursive: true, force: true })
    return
  }

  const args = archive.endsWith('.tar.xz')
    ? ['-xJf', archive, '-C', dest, `--strip-components=${stripComponents}`]
    : ['-xzf', archive, '-C', dest, `--strip-components=${stripComponents}`]
  await execFileAsync('tar', args, { timeout: 120_000 })
}

async function installBundledNode(): Promise<NodeRuntimeInfo> {
  const { fileName, stripComponents } = platformArchive()
  const root = runtimeRoot()
  const parent = dirname(root)
  mkdirSync(parent, { recursive: true })
  const tmpRoot = `${root}.installing`
  const archive = join(parent, fileName)

  rmSync(tmpRoot, { recursive: true, force: true })
  mkdirSync(tmpRoot, { recursive: true })

  appendActivity({
    scope: 'mcp',
    level: 'info',
    message: 'Installing portable Node.js for MCP (npx)',
    detail: `version=${BUNDLED_NODE_VERSION}; file=${fileName}`,
  })
  logger.info(`node runtime: downloading ${fileName}`)

  let lastErr: Error | null = null
  for (const url of downloadUrls(fileName)) {
    try {
      rmSync(archive, { force: true })
      await downloadFile(url, archive)
      lastErr = null
      break
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      logger.warn(`node runtime mirror failed: ${url} ${lastErr.message}`)
    }
  }
  if (lastErr) throw lastErr

  try {
    await extractArchive(archive, tmpRoot, stripComponents)
    rmSync(root, { recursive: true, force: true })
    renameSync(tmpRoot, root)
  } finally {
    rmSync(archive, { force: true })
    rmSync(tmpRoot, { recursive: true, force: true })
  }

  const bundled = bundledPaths()
  if (!bundled) {
    throw new Error('node_runtime_extract_incomplete')
  }

  if (process.platform !== 'win32') {
    try {
      await execFileAsync('chmod', ['+x', bundled.node, bundled.npx, bundled.npm], {
        timeout: 5000,
      })
    } catch {
      /* ignore */
    }
  }

  appendActivity({
    scope: 'mcp',
    level: 'info',
    message: 'Portable Node.js ready',
    detail: `bin=${bundled.binDir}`,
  })
  logger.info(`node runtime ready at ${bundled.binDir}`)

  return {
    source: 'bundled',
    versionHint: BUNDLED_NODE_VERSION,
    binDir: bundled.binDir,
    nodePath: bundled.node,
    npxPath: bundled.npx,
    npmPath: bundled.npm,
  }
}

function fromSystem(): NodeRuntimeInfo | null {
  const node = findExisting('node')
  const npx = findExisting('npx')
  if (!node || !npx) return null
  const npm =
    findExisting('npm') ||
    (process.platform === 'win32'
      ? npx.replace(/npx\.cmd$/i, 'npm.cmd')
      : join(dirname(npx), 'npm'))
  return {
    source: 'system',
    versionHint: 'system',
    binDir: dirname(node),
    nodePath: node,
    npxPath: npx,
    npmPath: existsSync(npm) ? npm : npx,
  }
}

/**
 * Resolve node/npx: prefer OS install (including Homebrew paths Electron GUI often misses),
 * otherwise download a portable Node into userData.
 */
export async function ensureNodeRuntime(): Promise<NodeRuntimeInfo> {
  if (cached) return cached
  if (ensurePromise) return ensurePromise

  ensurePromise = (async () => {
    const system = fromSystem()
    if (system) {
      cached = system
      logger.info(`node runtime: using system npx=${system.npxPath}`)
      return system
    }

    const existing = bundledPaths()
    if (existing) {
      cached = {
        source: 'bundled',
        versionHint: BUNDLED_NODE_VERSION,
        binDir: existing.binDir,
        nodePath: existing.node,
        npxPath: existing.npx,
        npmPath: existing.npm,
      }
      logger.info(`node runtime: using bundled npx=${existing.npx}`)
      return cached
    }

    cached = await installBundledNode()
    return cached
  })().finally(() => {
    ensurePromise = null
  })

  return ensurePromise
}

export function getCachedNodeRuntime(): NodeRuntimeInfo | null {
  return cached
}

export type PreparedMcpLaunch = {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
  runtime: NodeRuntimeInfo
}

function nodeRuntimeEnv(
  runtime: NodeRuntimeInfo,
  extra?: Record<string, string>,
): NodeJS.ProcessEnv {
  const { ELECTRON_RUN_AS_NODE: _drop, ...rest } = process.env
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
  const prev = rest[pathKey] || rest.PATH || ''
  const nextPath = prev.includes(runtime.binDir)
    ? prev
    : `${runtime.binDir}${process.platform === 'win32' ? ';' : ':'}${prev}`
  const merged: NodeJS.ProcessEnv = {
    ...rest,
    ...extra,
    [pathKey]: nextPath,
    PATH: nextPath,
  }
  return merged
}

/**
 * Resolve MCP stdio command. Bare `npx` / `npm` / `node` become absolute paths
 * with a PATH that can find the matching Node binaries.
 */
export async function prepareMcpLaunch(
  command: string,
  args: string[],
  serverEnv?: Record<string, string>,
): Promise<PreparedMcpLaunch> {
  const runtime = await ensureNodeRuntime()
  const env = nodeRuntimeEnv(runtime, serverEnv)
  const bare = command.trim()
  const lower = bare.toLowerCase()

  let resolved = bare
  if (lower === 'npx' || lower === 'npx.cmd') resolved = runtime.npxPath
  else if (lower === 'npm' || lower === 'npm.cmd') resolved = runtime.npmPath
  else if (lower === 'node' || lower === 'node.exe') resolved = runtime.nodePath
  else if (!bare.includes('/') && !bare.includes('\\')) {
    const found = whichOnPath(bare) || whichOnPath(binName(bare as 'node'))
    if (found) resolved = found
  }

  return { command: resolved, args: [...args], env, runtime }
}

/** Warm the runtime in background (optional). */
export function warmNodeRuntime(): void {
  void ensureNodeRuntime().catch((err) => {
    logger.warn('node runtime warm failed', err)
  })
}
