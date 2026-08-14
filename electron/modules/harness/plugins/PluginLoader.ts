import { app, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, readdirSync, cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  HarnessPluginCatalogEntry,
  HarnessPluginInfo,
  HarnessPluginManifest,
  LlmToolSpec,
} from '@shared'
import { logger } from '../../../utils/logger'

export type HarnessHookName =
  | 'agent/pre-step'
  | 'turn/stopping'
  | 'agent/inject'
  | 'tools/pre-execute'
  | 'tools/post-execute'

import type { PluginRuntimeContext } from './PluginContext'

export interface LoadedPluginTool {
  spec: LlmToolSpec
  pluginId: string
  handler: string
  execute: (args: Record<string, unknown>, ctx?: PluginRuntimeContext) => Promise<string>
}

export interface LoadedPluginHook {
  pluginId: string
  name: HarnessHookName
  handler: (ctx: unknown) => Promise<unknown> | unknown
}

let cache: {
  plugins: HarnessPluginInfo[]
  tools: LoadedPluginTool[]
  hooks: LoadedPluginHook[]
  loadedAt: string
} | null = null

function pluginsDir(): string {
  return join(app.getPath('userData'), 'harness-plugins')
}

function readManifest(dir: string): HarnessPluginManifest | null {
  const manifestPath = join(dir, 'plugin.json')
  if (!existsSync(manifestPath)) return null
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8')) as HarnessPluginManifest
  } catch (err) {
    logger.warn(`plugin manifest parse failed: ${manifestPath}`, err)
    return null
  }
}

async function loadPluginModule(dir: string, entry: string): Promise<Record<string, unknown>> {
  const file = join(dir, entry)
  if (!existsSync(file)) throw new Error(`plugin entry missing: ${entry}`)
  const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>
  return mod
}

function seedBundledExampleIfEmpty(): void {
  const root = pluginsDir()
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  const hasAny = readdirSync(root, { withFileTypes: true }).some((d) => d.isDirectory())
  if (hasAny) return
  const bundled = join(app.getAppPath(), 'resources', 'harness-plugins', 'hello')
  if (!existsSync(bundled)) return
  try {
    cpSync(bundled, join(root, 'hello'), { recursive: true })
    logger.info('seeded harness example plugin hello')
  } catch (err) {
    logger.warn('seed harness example plugin failed', err)
  }
}

export async function reloadHarnessPlugins(): Promise<{
  plugins: HarnessPluginInfo[]
  tools: LoadedPluginTool[]
}> {
  seedBundledExampleIfEmpty()
  const root = pluginsDir()
  if (!existsSync(root)) {
    cache = { plugins: [], tools: [], hooks: [], loadedAt: new Date().toISOString() }
    return cache
  }

  const plugins: HarnessPluginInfo[] = []
  const tools: LoadedPluginTool[] = []
  const hooks: LoadedPluginHook[] = []
  const loadedAt = new Date().toISOString()
  const allowedHooks = new Set<HarnessHookName>([
    'agent/pre-step',
    'turn/stopping',
    'agent/inject',
    'tools/pre-execute',
    'tools/post-execute',
  ])

  for (const name of readdirSync(root, { withFileTypes: true })) {
    if (!name.isDirectory()) continue
    const dir = join(root, name.name)
    const manifest = readManifest(dir)
    if (!manifest?.id || !Array.isArray(manifest.tools)) continue

    let mod: Record<string, unknown> = {}
    try {
      mod = await loadPluginModule(dir, manifest.entry || 'index.mjs')
    } catch (err) {
      logger.warn(`plugin module load failed: ${manifest.id}`, err)
      continue
    }

    const toolNames: string[] = []
    for (const t of manifest.tools) {
      if (!t.name || !t.handler) continue
      const handlerFn = mod[t.handler]
      if (typeof handlerFn !== 'function') {
        logger.warn(`plugin ${manifest.id} missing handler ${t.handler}`)
        continue
      }
      toolNames.push(t.name)
      tools.push({
        pluginId: manifest.id,
        handler: t.handler,
        spec: {
          type: 'function',
          function: {
            name: `plugin__${manifest.id}__${t.name}`,
            description: `[Plugin:${manifest.name}] ${t.description || t.name}`,
            parameters: t.parameters ?? { type: 'object', properties: {} },
          },
        },
        execute: async (args, pluginCtx) => {
          const out = await (
            handlerFn as (
              a: Record<string, unknown>,
              ctx?: PluginRuntimeContext,
            ) => Promise<unknown> | unknown
          )(args, pluginCtx)
          return typeof out === 'string' ? out : JSON.stringify(out)
        },
      })
    }

    for (const h of manifest.hooks ?? []) {
      if (!h.name || !h.handler || !allowedHooks.has(h.name as HarnessHookName)) continue
      const handlerFn = mod[h.handler]
      if (typeof handlerFn !== 'function') {
        logger.warn(`plugin ${manifest.id} missing hook handler ${h.handler}`)
        continue
      }
      hooks.push({
        pluginId: manifest.id,
        name: h.name as HarnessHookName,
        handler: handlerFn as LoadedPluginHook['handler'],
      })
    }

    plugins.push({
      id: manifest.id,
      name: manifest.name || manifest.id,
      version: manifest.version || '0.0.0',
      toolNames,
      path: dir,
      loadedAt,
    })
  }

  cache = { plugins, tools, hooks, loadedAt }
  return cache
}

export function getLoadedPluginHooks(name: HarnessHookName): LoadedPluginHook[] {
  if (!cache) return []
  return cache.hooks.filter((h) => h.name === name)
}

export async function getHarnessPluginTools(): Promise<LoadedPluginTool[]> {
  if (!cache) await reloadHarnessPlugins()
  return cache!.tools
}

export async function listHarnessPlugins(): Promise<HarnessPluginInfo[]> {
  if (!cache) await reloadHarnessPlugins()
  return cache!.plugins
}

export function ensurePluginsDir(): string {
  const dir = pluginsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function bundledPluginsRoot(): string {
  return join(app.getAppPath(), 'resources', 'harness-plugins')
}

function isPluginInstalled(pluginId: string): boolean {
  return existsSync(join(pluginsDir(), pluginId, 'plugin.json'))
}

export function listPluginCatalog(): HarnessPluginCatalogEntry[] {
  ensurePluginsDir()
  const catalogPath = join(bundledPluginsRoot(), 'catalog.json')
  if (!existsSync(catalogPath)) return []
  try {
    const raw = JSON.parse(readFileSync(catalogPath, 'utf8')) as Array<{
      id: string
      name: string
      version: string
      description: string
      bundledPath: string
    }>
    return raw.map((entry) => ({
      ...entry,
      installed: isPluginInstalled(entry.id),
    }))
  } catch (err) {
    logger.warn('plugin catalog read failed', err)
    return []
  }
}

export async function installHarnessPlugin(input: {
  bundledId?: string
  sourcePath?: string
}): Promise<HarnessPluginInfo> {
  ensurePluginsDir()
  let src = ''
  if (input.bundledId?.trim()) {
    src = join(bundledPluginsRoot(), input.bundledId.trim())
  } else if (input.sourcePath?.trim()) {
    src = input.sourcePath.trim()
  } else {
    throw new Error('bundledId or sourcePath required')
  }
  const manifest = readManifest(src)
  if (!manifest?.id) throw new Error('plugin.json missing or invalid')
  const dest = join(pluginsDir(), manifest.id)
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
  cpSync(src, dest, { recursive: true })
  await reloadHarnessPlugins()
  const hit = cache?.plugins.find((p) => p.id === manifest.id)
  if (!hit) throw new Error('plugin install failed')
  return hit
}

export function openHarnessPluginsDir(): Promise<string> {
  const dir = ensurePluginsDir()
  return shell.openPath(dir)
}
