import { execFile, spawn } from 'node:child_process'
import { existsSync, statfsSync } from 'node:fs'
import os from 'node:os'
import { promisify } from 'node:util'
import { BrowserWindow, shell } from 'electron'
import {
  IpcChannels,
  LOCAL_LLM_FAMILIES,
  defaultAiModelConfig,
  localLlmDefaultVersion,
  localLlmFamilyById,
  localLlmFamilyByOllamaName,
  localLlmPullName,
  localLlmTierForVersion,
  localLlmValidateModelRef,
  type AiModelConfig,
  type LocalLlmFamilyState,
  type LocalLlmHostInfo,
  type LocalLlmInstalledModel,
  type LocalLlmModelDetails,
  type LocalLlmPlatform,
  type LocalLlmPullProgress,
  type LocalLlmRemoteTag,
  type LocalLlmRunningModel,
  type LocalLlmRuntimeStatus,
  type LocalLlmSnapshot,
  type LocalLlmTier,
} from '@shared'
import { settingsStore } from '../settings/SettingsStore'

const execFileAsync = promisify(execFile)

const OLLAMA_BASE = 'http://127.0.0.1:11434'
const LMSTUDIO_BASE = 'http://127.0.0.1:1234'
const OLLAMA_LIBRARY_URL = 'https://ollama.com/library'

const OLLAMA_INSTALL_URLS: Record<LocalLlmPlatform, string> = {
  darwin: 'https://ollama.com/download/mac',
  win32: 'https://ollama.com/download/windows',
  linux: 'https://ollama.com/download/linux',
  other: 'https://ollama.com/download',
}

const LMSTUDIO_INSTALL_URLS: Record<LocalLlmPlatform, string> = {
  darwin: 'https://lmstudio.ai/',
  win32: 'https://lmstudio.ai/',
  linux: 'https://lmstudio.ai/',
  other: 'https://lmstudio.ai/',
}

const TIER_RANK: Record<LocalLlmTier, number> = {
  recommended: 0,
  optional: 1,
  tight: 2,
  avoid: 3,
}

function platformOf(): LocalLlmPlatform {
  const p = process.platform
  if (p === 'darwin' || p === 'win32' || p === 'linux') return p
  return 'other'
}

function ramGbOf(): number {
  return Math.round(os.totalmem() / (1024 * 1024 * 1024))
}

function freeDiskGbOf(): number | null {
  try {
    const root = process.platform === 'win32' ? process.env.SystemDrive || 'C:\\' : '/'
    const st = statfsSync(root)
    const free = Number(st.bfree) * Number(st.bsize)
    if (!Number.isFinite(free) || free <= 0) return null
    return Math.round(free / (1024 * 1024 * 1024))
  } catch {
    return null
  }
}

async function detectChipLabel(): Promise<string> {
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('sysctl', ['-n', 'machdep.cpu.brand_string'], {
        timeout: 3000,
      })
      if (stdout.trim()) return stdout.trim()
    } catch {
      /* fall through */
    }
    try {
      const { stdout } = await execFileAsync('system_profiler', ['SPHardwareDataType'], {
        timeout: 5000,
      })
      const chip = stdout
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('Chip:'))
      if (chip) return chip.replace(/^Chip:\s*/, '')
    } catch {
      /* ignore */
    }
  }
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-Command', '(Get-CimInstance Win32_Processor).Name'],
        { timeout: 5000 },
      )
      if (stdout.trim()) return stdout.trim()
    } catch {
      /* ignore */
    }
  }
  return os.cpus()[0]?.model || process.arch
}

function acceleratorOf(chip: string): LocalLlmHostInfo['accelerator'] {
  const lower = chip.toLowerCase()
  if (
    process.platform === 'darwin' &&
    (lower.includes('apple') || /m[1-9]/.test(lower))
  ) {
    return 'apple'
  }
  if (
    lower.includes('nvidia') ||
    lower.includes('geforce') ||
    lower.includes('rtx') ||
    lower.includes('quadro')
  ) {
    return 'nvidia'
  }
  return 'cpu'
}

async function whichBinary(name: string): Promise<string | null> {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  try {
    const { stdout } = await execFileAsync(cmd, [name], { timeout: 3000 })
    return (
      stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean) || null
    )
  } catch {
    return null
  }
}

function commonOllamaPaths(): string[] {
  if (process.platform === 'darwin') {
    return ['/usr/local/bin/ollama', '/opt/homebrew/bin/ollama', `${os.homedir()}/.ollama/bin/ollama`]
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || ''
    return [
      local ? `${local}\\Programs\\Ollama\\ollama.exe` : '',
      'C:\\Program Files\\Ollama\\ollama.exe',
    ].filter(Boolean)
  }
  return ['/usr/bin/ollama', '/usr/local/bin/ollama', `${os.homedir()}/.local/bin/ollama`]
}

async function resolveOllamaBinary(): Promise<string | null> {
  const fromPath = await whichBinary('ollama')
  if (fromPath && existsSync(fromPath)) return fromPath
  for (const p of commonOllamaPaths()) {
    if (existsSync(p)) return p
  }
  return null
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function probeOllama(): Promise<{ running: boolean; version: string | null }> {
  const ver = await fetchJson<{ version?: string }>(`${OLLAMA_BASE}/api/version`)
  if (ver?.version) return { running: true, version: String(ver.version) }
  const tags = await fetchJson<{ models?: unknown }>(`${OLLAMA_BASE}/api/tags`)
  if (tags) return { running: true, version: null }
  return { running: false, version: null }
}

async function probeLmStudio(): Promise<boolean> {
  const models = await fetchJson<{ data?: unknown }>(`${LMSTUDIO_BASE}/v1/models`)
  return Boolean(models)
}

function parseInstalledTag(name: string, ollamaModel: string): string {
  const lower = name.toLowerCase()
  const base = ollamaModel.toLowerCase()
  if (lower === base) return 'latest'
  if (lower.startsWith(`${base}:`)) return name.slice(ollamaModel.length + 1)
  return 'latest'
}

async function listOllamaModels(): Promise<LocalLlmInstalledModel[]> {
  const data = await fetchJson<{
    models?: Array<{
      name?: string
      size?: number
      modified_at?: string
      digest?: string
      details?: {
        format?: string
        family?: string
        parameter_size?: string
        quantization_level?: string
      }
    }>
  }>(`${OLLAMA_BASE}/api/tags`)
  if (!data?.models) return []
  return data.models
    .filter((m) => typeof m.name === 'string' && m.name.trim())
    .map((m) => {
      const name = m.name!.trim()
      const family = localLlmFamilyByOllamaName(name)
      return {
        name,
        sizeBytes: typeof m.size === 'number' ? m.size : 0,
        modifiedAt: m.modified_at,
        digest: m.digest,
        familyId: family?.id,
        tag: family ? parseInstalledTag(name, family.ollamaModel) : undefined,
        details: m.details
          ? {
              format: m.details.format,
              family: m.details.family,
              parameterSize: m.details.parameter_size,
              quantizationLevel: m.details.quantization_level,
            }
          : undefined,
      }
    })
}

async function listRunningModels(): Promise<LocalLlmRunningModel[]> {
  const data = await fetchJson<{
    models?: Array<{
      name?: string
      size?: number
      processor?: string
      expires_at?: string
    }>
  }>(`${OLLAMA_BASE}/api/ps`)
  if (!data?.models) return []
  return data.models
    .filter((m) => typeof m.name === 'string' && m.name.trim())
    .map((m) => ({
      name: m.name!.trim(),
      sizeBytes: typeof m.size === 'number' ? m.size : 0,
      processor: m.processor,
      until: m.expires_at,
    }))
}

function bestTierAmong(tiers: LocalLlmTier[]): LocalLlmTier {
  let best: LocalLlmTier = 'avoid'
  for (const t of tiers) {
    if (TIER_RANK[t] < TIER_RANK[best]) best = t
  }
  return best
}

function buildFamilyStates(
  installed: LocalLlmInstalledModel[],
  ramGb: number,
): LocalLlmFamilyState[] {
  return LOCAL_LLM_FAMILIES.map((family) => {
    const installedForFamily = installed.filter((m) => m.familyId === family.id)
    const installedTags = installedForFamily.map((m) => m.tag || 'latest')
    const installedNames = installedForFamily.map((m) => m.name)
    const tiers = family.versions.map((ver) => localLlmTierForVersion(ver, ramGb))
    return {
      family,
      bestTier: bestTierAmong(tiers),
      installedTags,
      installedNames,
    }
  })
}

function emitPullProgress(payload: LocalLlmPullProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.localLlm.pullProgress, payload)
  }
}

let pullAbort: AbortController | null = null
let pullingModel: string | null = null

export async function getLocalLlmSnapshot(): Promise<LocalLlmSnapshot> {
  const platform = platformOf()
  const chipLabel = await detectChipLabel()
  const host: LocalLlmHostInfo = {
    platform,
    arch: process.arch,
    ramGb: ramGbOf(),
    freeDiskGb: freeDiskGbOf(),
    chipLabel,
    accelerator: acceleratorOf(chipLabel),
  }

  const binaryPath = await resolveOllamaBinary()
  const { running, version } = await probeOllama()
  const ollama: LocalLlmRuntimeStatus = {
    runtime: 'ollama',
    installed: Boolean(binaryPath) || running,
    running,
    version,
    binaryPath,
    baseUrl: `${OLLAMA_BASE}/v1`,
    installUrl: OLLAMA_INSTALL_URLS[platform],
    libraryUrl: OLLAMA_LIBRARY_URL,
    hint: running ? undefined : binaryPath ? 'installed_not_running' : 'not_installed',
  }

  const lmRunning = await probeLmStudio()
  const lmstudio: LocalLlmRuntimeStatus = {
    runtime: 'lmstudio',
    installed: lmRunning,
    running: lmRunning,
    version: null,
    binaryPath: null,
    baseUrl: `${LMSTUDIO_BASE}/v1`,
    installUrl: LMSTUDIO_INSTALL_URLS[platform],
    libraryUrl: 'https://lmstudio.ai/models',
    hint: lmRunning ? undefined : 'optional_gui',
  }

  const installed = running ? await listOllamaModels() : []
  const runningModels = running ? await listRunningModels() : []
  const families = buildFamilyStates(installed, host.ramGb)

  return {
    host,
    ollama,
    lmstudio,
    installed,
    running: runningModels,
    families,
    pullingModel,
  }
}

export async function openLocalLlmRuntimeInstall(
  runtime: 'ollama' | 'lmstudio' = 'ollama',
): Promise<string> {
  const platform = platformOf()
  const url =
    runtime === 'lmstudio' ? LMSTUDIO_INSTALL_URLS[platform] : OLLAMA_INSTALL_URLS[platform]
  await shell.openExternal(url)
  return url
}

export async function openLocalLlmLibrary(model?: string): Promise<string> {
  const url = model?.trim()
    ? `${OLLAMA_LIBRARY_URL}/${encodeURIComponent(model.trim())}`
    : OLLAMA_LIBRARY_URL
  await shell.openExternal(url)
  return url
}

/** Open install / docs page for a catalog family (Draw Things, ComfyUI, etc.). */
export async function openLocalLlmFamilyInstall(familyId: string): Promise<{
  ok: boolean
  url?: string
  error?: string
}> {
  const family = localLlmFamilyById(familyId)
  if (!family) return { ok: false, error: 'unknown_family' }
  const url = family.installUrl?.trim()
  if (!url) return { ok: false, error: 'no_install_url' }
  await shell.openExternal(url)
  return { ok: true, url }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntilOllamaRunning(timeoutMs = 20_000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const { running } = await probeOllama()
    if (running) return true
    await sleep(500)
  }
  return false
}

/** Start Ollama if installed but not running (macOS App / serve). */
export async function startLocalLlmRuntime(): Promise<{ ok: boolean; error?: string }> {
  const { running } = await probeOllama()
  if (running) return { ok: true }

  const binary = await resolveOllamaBinary()
  const platform = platformOf()

  try {
    if (platform === 'darwin') {
      try {
        await execFileAsync('open', ['-a', 'Ollama'], { timeout: 8000 })
      } catch {
        if (!binary) return { ok: false, error: 'ollama_not_installed' }
        spawn(binary, ['serve'], {
          detached: true,
          stdio: 'ignore',
          env: process.env,
        }).unref()
      }
    } else if (platform === 'win32') {
      if (!binary) return { ok: false, error: 'ollama_not_installed' }
      // Launch GUI/service entry; `serve` is also fine if headless.
      spawn(binary, ['serve'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: process.env,
      }).unref()
    } else {
      if (!binary) return { ok: false, error: 'ollama_not_installed' }
      spawn(binary, ['serve'], {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      }).unref()
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  const up = await waitUntilOllamaRunning(20_000)
  return up ? { ok: true } : { ok: false, error: 'ollama_start_timeout' }
}

/**
 * Fetch all published tags for a library model from ollama.com.
 * Used so users can pick exact quant / instruct variants beyond the curated list.
 */
export async function listLocalLlmRemoteTags(
  ollamaModel: string,
): Promise<{ ok: boolean; tags: LocalLlmRemoteTag[]; error?: string }> {
  const model = ollamaModel.trim().toLowerCase()
  if (!model) return { ok: false, tags: [], error: 'empty_model' }

  const family = localLlmFamilyByOllamaName(model) ?? localLlmFamilyById(model)
  const base = family?.ollamaModel ?? model
  const curated = new Set((family?.versions ?? []).map((v) => v.tag.toLowerCase()))

  try {
    const url = `${OLLAMA_LIBRARY_URL}/${encodeURIComponent(base)}/tags`
    const res = await fetch(url, {
      headers: { Accept: 'text/html', 'User-Agent': 'TreasureChest/1.0' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return { ok: false, tags: [], error: `http_${res.status}` }
    const html = await res.text()
    const re = new RegExp(
      `${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:([a-zA-Z0-9._+-]+)`,
      'g',
    )
    const seen = new Set<string>()
    const tags: LocalLlmRemoteTag[] = []
    let match: RegExpExecArray | null
    while ((match = re.exec(html))) {
      const tag = match[1]!
      const key = tag.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      tags.push({
        tag,
        fullName: `${base}:${tag}`,
        curated: curated.has(key),
      })
    }
    tags.sort((a, b) => {
      if (a.curated !== b.curated) return a.curated ? -1 : 1
      return a.tag.localeCompare(b.tag, undefined, { numeric: true })
    })
    return { ok: true, tags }
  } catch (err) {
    return { ok: false, tags: [], error: err instanceof Error ? err.message : String(err) }
  }
}

function estimatePullGb(model: string): number | null {
  const family = localLlmFamilyByOllamaName(model)
  if (!family) return null
  const parsed = model.includes(':') ? model.slice(model.indexOf(':') + 1) : 'latest'
  const ver = family.versions.find((v) => v.tag === parsed || v.tag === 'latest')
  return ver?.sizeGb ?? localLlmDefaultVersion(family).sizeGb
}

export async function pullLocalLlmModel(model: string): Promise<{ ok: boolean; error?: string }> {
  const validated = localLlmValidateModelRef(model)
  if (!validated.ok) return { ok: false, error: validated.error }
  const name = validated.name

  const { running } = await probeOllama()
  if (!running) return { ok: false, error: 'ollama_not_running' }

  const free = freeDiskGbOf()
  const need = estimatePullGb(name)
  if (free != null && need != null && free < need + 2) {
    return { ok: false, error: 'disk_insufficient' }
  }

  if (pullAbort) {
    pullAbort.abort()
    pullAbort = null
  }
  pullAbort = new AbortController()
  pullingModel = name

  emitPullProgress({ model: name, status: 'starting', percent: 0, phase: 'start' })

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, stream: true }),
      signal: pullAbort.signal,
    })
    if (!res.ok || !res.body) {
      const err = `http_${res.status}`
      emitPullProgress({ model: name, status: err, percent: 0, phase: 'error', error: err })
      return { ok: false, error: err }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let lastPercent = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        let row: {
          status?: string
          digest?: string
          total?: number
          completed?: number
          error?: string
        }
        try {
          row = JSON.parse(trimmed) as typeof row
        } catch {
          continue
        }
        if (row.error) {
          emitPullProgress({
            model: name,
            status: row.error,
            percent: lastPercent,
            phase: 'error',
            error: row.error,
          })
          return { ok: false, error: row.error }
        }
        const total = typeof row.total === 'number' ? row.total : undefined
        const completed = typeof row.completed === 'number' ? row.completed : undefined
        let percent = lastPercent
        if (total && total > 0 && completed != null) {
          percent = Math.min(99, Math.round((completed / total) * 100))
        } else if (row.status === 'success') {
          percent = 100
        }
        lastPercent = percent
        emitPullProgress({
          model: name,
          status: row.status || 'progress',
          digest: row.digest,
          total,
          completed,
          percent,
          phase: row.status === 'success' ? 'done' : 'progress',
        })
      }
    }

    emitPullProgress({ model: name, status: 'success', percent: 100, phase: 'done' })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const aborted = message.toLowerCase().includes('abort')
    emitPullProgress({
      model: name,
      status: aborted ? 'aborted' : message,
      percent: 0,
      phase: 'error',
      error: aborted ? 'aborted' : message,
    })
    return { ok: false, error: aborted ? 'aborted' : message }
  } finally {
    pullAbort = null
    pullingModel = null
  }
}

export function cancelLocalLlmPull(): { ok: boolean } {
  if (!pullAbort) return { ok: false }
  pullAbort.abort()
  pullAbort = null
  const model = pullingModel || ''
  pullingModel = null
  if (model) {
    emitPullProgress({
      model,
      status: 'aborted',
      percent: 0,
      phase: 'error',
      error: 'aborted',
    })
  }
  return { ok: true }
}

export async function deleteLocalLlmModel(model: string): Promise<{ ok: boolean; error?: string }> {
  const validated = localLlmValidateModelRef(model)
  if (!validated.ok) return { ok: false, error: validated.error }
  const name = validated.name
  const { running } = await probeOllama()
  if (!running) return { ok: false, error: 'ollama_not_running' }
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: body || `http_${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function showLocalLlmModel(model: string): Promise<LocalLlmModelDetails | null> {
  const validated = localLlmValidateModelRef(model)
  if (!validated.ok) return null
  const data = await fetchJson<{
    modelfile?: string
    parameters?: string
    template?: string
    details?: {
      format?: string
      family?: string
      parameter_size?: string
      quantization_level?: string
    }
    model_info?: Record<string, unknown>
  }>(`${OLLAMA_BASE}/api/show`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: validated.name }),
  })
  if (!data) return null
  return {
    name: validated.name,
    modelfile: data.modelfile,
    parameters: data.parameters,
    template: data.template,
    details: data.details
      ? {
          format: data.details.format,
          family: data.details.family,
          parameterSize: data.details.parameter_size,
          quantizationLevel: data.details.quantization_level,
        }
      : undefined,
    modelInfo: data.model_info,
  }
}

/** Unload from VRAM/RAM by setting keep_alive to 0. */
export async function unloadLocalLlmModel(model: string): Promise<{ ok: boolean; error?: string }> {
  const validated = localLlmValidateModelRef(model)
  if (!validated.ok) return { ok: false, error: validated.error }
  const { running } = await probeOllama()
  if (!running) return { ok: false, error: 'ollama_not_running' }
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: validated.name, keep_alive: 0, prompt: '' }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return { ok: false, error: `http_${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function modelConfigForOllamaName(name: string): AiModelConfig {
  const family = localLlmFamilyByOllamaName(name)
  if (family?.modality === 'vision') {
    return defaultAiModelConfig(name, {
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
    })
  }
  return defaultAiModelConfig(name)
}

export async function applyLocalLlmToWorkbench(preferredModel?: string): Promise<{
  ok: boolean
  providerId: string
  model: string
  error?: string
}> {
  const snap = await getLocalLlmSnapshot()
  if (!snap.ollama.running) {
    return { ok: false, providerId: '', model: '', error: 'ollama_not_running' }
  }

  const chatNames = snap.installed
    .filter((m) => {
      const f = m.familyId ? LOCAL_LLM_FAMILIES.find((x) => x.id === m.familyId) : null
      return !f || f.modality !== 'embedding'
    })
    .map((m) => m.name)

  const names =
    chatNames.length > 0
      ? chatNames
      : preferredModel
        ? [preferredModel]
        : [
            localLlmPullName(
              LOCAL_LLM_FAMILIES.find((f) => f.id === 'qwen25')!,
              localLlmDefaultVersion(LOCAL_LLM_FAMILIES.find((f) => f.id === 'qwen25')!).tag,
            ),
          ]

  const pick =
    (preferredModel &&
      names.find((n) => n === preferredModel || n.startsWith(`${preferredModel}`))) ||
    names[0]!

  const models = names.map(modelConfigForOllamaName)
  const fortune = settingsStore.getSnapshot().fortune
  const existing = fortune.aiProviders.find(
    (p) =>
      p.baseUrl.includes('11434') ||
      p.name.toLowerCase() === 'ollama' ||
      p.id === 'local-ollama',
  )

  const providerId = existing?.id ?? 'local-ollama'
  const nextProvider = {
    id: providerId,
    name: 'Ollama',
    baseUrl: `${OLLAMA_BASE}/v1`,
    apiFormat: 'openai' as const,
    models,
    apiKey: '',
    mediaProfile: 'openai_compat' as const,
  }

  const aiProviders = existing
    ? fortune.aiProviders.map((p) => (p.id === existing.id ? { ...p, ...nextProvider } : p))
    : [...fortune.aiProviders, nextProvider]

  settingsStore.setFortuneSettings({
    aiProviders,
    aiActiveProviderId: providerId,
    aiProviderName: 'Ollama',
    aiBaseUrl: nextProvider.baseUrl,
    aiApiFormat: 'openai',
    aiModel: pick,
    aiApiKey: '',
  })

  return { ok: true, providerId, model: pick }
}
