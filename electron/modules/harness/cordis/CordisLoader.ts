import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, readdirSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import type { CordisStackSnapshot, CordisBundleFile, CordisPatchFile, CordisProfileFile } from './types'
import { logger } from '../../../utils/logger'
import { ensurePluginsDir } from '../plugins/PluginLoader'
import { tryResolveDevcontainer } from '../coding/ContainerSandbox'

let cachedStack: CordisStackSnapshot | null = null

function cordisRoot(): string {
  return join(app.getPath('userData'), 'harness-cordis')
}

function bundledCordisRoot(): string {
  return join(app.getAppPath(), 'resources', 'harness-cordis')
}

function expandVars(raw: string): string {
  return raw.replace(/\$\{userData\}/g, app.getPath('userData'))
}

function readYaml<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return yaml.load(readFileSync(path, 'utf8')) as T
  } catch (err) {
    logger.warn(`cordis yaml parse failed: ${path}`, err)
    return null
  }
}

function seedCordisIfMissing(): void {
  const root = cordisRoot()
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  const patchPath = join(root, 'patch.yml')
  if (existsSync(patchPath)) return
  const bundled = bundledCordisRoot()
  if (!existsSync(bundled)) return
  try {
    cpSync(bundled, root, { recursive: true })
    logger.info('seeded harness cordis stack from resources')
  } catch (err) {
    logger.warn('seed cordis stack failed', err)
  }
}

function installBundlePlugins(bundle: CordisBundleFile, bundleDir: string): void {
  const destRoot = ensurePluginsDir()
  for (const plugin of bundle.plugins ?? []) {
    const src = join(bundleDir, plugin.path)
    const manifestPath = join(src, 'plugin.json')
    if (!existsSync(manifestPath)) continue
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { id?: string }
      const id = manifest.id || plugin.id
      cpSync(src, join(destRoot, id), { recursive: true })
    } catch (err) {
      logger.warn(`cordis bundle plugin install failed: ${plugin.id}`, err)
    }
  }
}

export function loadCordisStack(force = false): CordisStackSnapshot {
  if (cachedStack && !force) return cachedStack

  seedCordisIfMissing()
  const root = cordisRoot()
  const patchPath = join(root, 'patch.yml')
  const patch = readYaml<CordisPatchFile>(patchPath) ?? { version: 1, profile: 'default', bundles: [] }

  const profileId = patch.profile?.trim() || 'default'
  const profilePath = join(root, 'profiles', profileId, 'profile.yml')
  const profile = readYaml<CordisProfileFile>(profilePath) ?? { id: profileId }

  const bundleIds = (patch.bundles ?? []).map((b) => b.trim()).filter(Boolean)
  const bundlePaths: string[] = []
  for (const bundleId of bundleIds) {
    const bundleDir = join(root, 'bundles', bundleId)
    const bundlePath = join(bundleDir, 'bundle.yml')
    bundlePaths.push(bundlePath)
    const bundle = readYaml<CordisBundleFile>(bundlePath)
    if (bundle) installBundlePlugins(bundle, bundleDir)
  }

  const pluginsDirRaw = patch.plugins?.dir?.trim()
  const pluginsDir = pluginsDirRaw ? expandVars(pluginsDirRaw) : ensurePluginsDir()

  const sandboxMode =
    profile.sandbox?.mode === 'ssh'
      ? 'ssh'
      : profile.sandbox?.mode === 'container'
        ? 'container'
        : 'local'
  const ssh =
    sandboxMode === 'ssh' && profile.sandbox?.ssh?.host && profile.sandbox?.ssh?.user
      ? {
          host: profile.sandbox.ssh.host.trim(),
          user: profile.sandbox.ssh.user.trim(),
          remotePath: (profile.sandbox.ssh.remotePath || '.').trim(),
          port: profile.sandbox.ssh.port,
        }
      : undefined

  let container =
    sandboxMode === 'container' && profile.sandbox?.container?.containerName
      ? {
          containerName: profile.sandbox.container.containerName.trim(),
          workspacePath: (profile.sandbox.container.workspacePath || '/workspace').trim(),
        }
      : undefined
  if (sandboxMode === 'container' && !container) {
    const dev = tryResolveDevcontainer(patch.overrides?.sandboxRoot ?? profile.sandbox?.root ?? undefined)
    if (dev?.containerName) {
      container = {
        containerName: dev.containerName,
        workspacePath: dev.workspacePath || '/workspace',
      }
    }
  }

  cachedStack = {
    cordisRoot: root,
    patchPath,
    profileId,
    profilePath,
    bundleIds,
    bundlePaths,
    pluginsDir,
    harness: {
      ...(profile.harness ?? {}),
      ...(patch.overrides?.harness ?? {}),
    },
    sandboxMode,
    sandboxRoot: patch.overrides?.sandboxRoot ?? profile.sandbox?.root ?? null,
    ssh,
    container,
    dshWebUrl: patch.overrides?.dshWebUrl,
    enablePluginTools: patch.overrides?.enablePluginTools,
  }
  return cachedStack
}

export function getCordisStack(): CordisStackSnapshot {
  return loadCordisStack(false)
}

export function reloadCordisStack(): CordisStackSnapshot {
  cachedStack = null
  return loadCordisStack(true)
}

export function listCordisProfiles(): string[] {
  seedCordisIfMissing()
  const dir = join(cordisRoot(), 'profiles')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

export function listCordisBundles(): string[] {
  seedCordisIfMissing()
  const dir = join(cordisRoot(), 'bundles')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

export function getCordisRootPath(): string {
  seedCordisIfMissing()
  return cordisRoot()
}
