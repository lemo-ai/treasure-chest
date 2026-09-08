/** Image toolbox + optional local vision models (user-installed, never bundled in the app). */

export type ImageSmartTask =
  | 'remove_background'
  | 'remove_watermark'
  | 'upscale'
  | 'denoise'
  | 'background_replace'

export type VisionInstallKind = 'download' | 'import'

export type VisionModelStatus = 'not_installed' | 'installing' | 'ready' | 'error'

/** How far the local runner is wired for this catalog entry. */
export type VisionRuntimeKind =
  /** End-to-end local/WASM path works after install */
  | 'adapted'
  /** Install/import accepted; processing uses canvas approximation until ONNX/etc. is wired */
  | 'canvas_fallback'
  /** Weights can be imported; inference runtime not ready yet */
  | 'import_pending'

export type VisionModelsRootMode = 'userData' | 'custom'

export interface VisionDownloadAsset {
  fileName: string
  /**
   * Download URLs tried in order (mirrors). Prefer reachable hosts first (e.g. hf-mirror in CN).
   */
  urls: string[]
}

export interface VisionModelCatalogEntry {
  id: string
  /** i18n key suffix under tools.image.models.* */
  nameKey: string
  descKey: string
  task: ImageSmartTask
  installKind: VisionInstallKind
  runtime: VisionRuntimeKind
  /** File extensions accepted on optional local import */
  importExtensions: string[]
  /** Allow secondary “import from disk” even when primary is download */
  allowImport?: boolean
  /** Approximate size hint for download models */
  sizeHintMb?: number
  /** Optional homepage / docs for power users */
  docsUrl?: string
  /**
   * Remote weight files for one-click install.
   * Empty = marker-only install (weights fetched on first use, e.g. IMG.LY).
   */
  downloadAssets?: VisionDownloadAsset[]
}

/** Built-in catalog — weights are never shipped; user installs in Settings. */
export const VISION_MODEL_CATALOG: VisionModelCatalogEntry[] = [
  {
    id: 'imgly-rembg',
    nameKey: 'rembg',
    descKey: 'rembgDesc',
    task: 'remove_background',
    installKind: 'download',
    runtime: 'adapted',
    importExtensions: ['onnx', 'pth', 'pt', 'bin', 'safetensors'],
    allowImport: true,
    sizeHintMb: 80,
    docsUrl: 'https://github.com/imgly/background-removal-js',
    downloadAssets: [],
  },
  {
    id: 'birefnet',
    nameKey: 'birefnet',
    descKey: 'birefnetDesc',
    task: 'remove_background',
    installKind: 'download',
    runtime: 'adapted',
    importExtensions: ['onnx', 'pth', 'pt', 'bin', 'safetensors'],
    allowImport: true,
    sizeHintMb: 180,
    docsUrl: 'https://github.com/danielgatis/rembg',
    // rembg U²-Net ONNX; local inference via onnxruntime-web (catalog id kept as birefnet).
    downloadAssets: [
      {
        fileName: 'u2net.onnx',
        urls: ['https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx'],
      },
    ],
  },
  {
    id: 'lama-inpaint',
    nameKey: 'lama',
    descKey: 'lamaDesc',
    task: 'remove_watermark',
    installKind: 'download',
    runtime: 'adapted',
    importExtensions: ['onnx', 'pth', 'pt', 'bin'],
    allowImport: true,
    sizeHintMb: 208,
    docsUrl: 'https://huggingface.co/Carve/LaMa-ONNX',
    downloadAssets: [
      {
        fileName: 'lama_fp32.onnx',
        urls: [
          'https://hf-mirror.com/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx?download=true',
          'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx?download=true',
        ],
      },
    ],
  },
  {
    id: 'realesrgan-x4',
    nameKey: 'esrgan',
    descKey: 'esrganDesc',
    task: 'upscale',
    installKind: 'download',
    runtime: 'adapted',
    importExtensions: ['onnx', 'pth', 'pt', 'bin', 'param'],
    allowImport: true,
    sizeHintMb: 67,
    docsUrl: 'https://github.com/xinntao/Real-ESRGAN',
    downloadAssets: [
      {
        fileName: 'realesr-general-x4v3.onnx',
        urls: [
          'https://hf-mirror.com/CoderViking/realesr-general-x4v3-onnx/resolve/main/realesr-general-x4v3.onnx?download=true',
          'https://huggingface.co/CoderViking/realesr-general-x4v3-onnx/resolve/main/realesr-general-x4v3.onnx?download=true',
        ],
      },
    ],
  },
  {
    id: 'waifu2x',
    nameKey: 'waifu2x',
    descKey: 'waifu2xDesc',
    task: 'upscale',
    installKind: 'download',
    runtime: 'adapted',
    importExtensions: ['onnx', 'json', 'bin', 'param', 'pth'],
    allowImport: true,
    sizeHintMb: 17,
    docsUrl: 'https://github.com/xinntao/Real-ESRGAN',
    downloadAssets: [
      {
        fileName: 'realesr-general-x4v3.onnx',
        urls: [
          'https://hf-mirror.com/CoderViking/realesr-general-x4v3-onnx/resolve/main/realesr-general-x4v3.onnx?download=true',
          'https://huggingface.co/CoderViking/realesr-general-x4v3-onnx/resolve/main/realesr-general-x4v3.onnx?download=true',
        ],
      },
    ],
  },
  {
    id: 'nafnet',
    nameKey: 'nafnet',
    descKey: 'nafnetDesc',
    task: 'denoise',
    installKind: 'download',
    runtime: 'adapted',
    importExtensions: ['onnx', 'pth', 'pt', 'bin'],
    allowImport: true,
    sizeHintMb: 88,
    docsUrl: 'https://huggingface.co/opencv/deblurring_nafnet',
    downloadAssets: [
      {
        fileName: 'deblurring_nafnet_2025may.onnx',
        urls: [
          'https://hf-mirror.com/opencv/deblurring_nafnet/resolve/main/deblurring_nafnet_2025may.onnx?download=true',
          'https://huggingface.co/opencv/deblurring_nafnet/resolve/main/deblurring_nafnet_2025may.onnx?download=true',
        ],
      },
    ],
  },
]

/** Cloud / API image generation is configured under Settings → Models & API. */

export interface VisionModelState {
  id: string
  status: VisionModelStatus
  /** Absolute path to imported/downloaded assets dir when ready */
  path?: string
  error?: string
  installedAt?: number
  bytes?: number
}

export interface ImageToolsSettings {
  /** Default cloud/HTTP image model id (from active AI provider); empty = provider default */
  defaultGenerateModelId: string
  /** Per-task preferred local vision model id */
  taskModelIds: Partial<Record<ImageSmartTask, string>>
  /** Installed / known model runtime state */
  models: VisionModelState[]
  /** Prefer local vision when ready; otherwise fall back to classic/cloud where applicable */
  preferLocalVision: boolean
  /** Where to store vision weights */
  modelsRootMode: VisionModelsRootMode
  /** Absolute path when modelsRootMode === 'custom' */
  customModelsRoot: string
  /**
   * User-defined engines (ONNX file or HTTP endpoint). Never bundled.
   */
  customEngines: CustomVisionEngine[]
  /**
   * Resolved absolute models root (filled by main process; not persisted).
   */
  resolvedModelsRoot?: string
}

/** Plugin-style custom vision engine registered by the user. */
export type CustomVisionEngineKind = 'onnx' | 'http'

export interface CustomVisionEngine {
  id: string
  name: string
  task: ImageSmartTask
  kind: CustomVisionEngineKind
  enabled: boolean
  createdAt: number
  /** Absolute path to .onnx when kind === 'onnx' */
  onnxPath?: string
  /** HTTP endpoint when kind === 'http' (POST JSON { imageDataUrl, task, maskDataUrl? }) */
  endpointUrl?: string
  /** Optional Authorization Bearer / API key for HTTP engines */
  apiKey?: string
  /** Display note */
  notes?: string
}

export const DEFAULT_IMAGE_TOOLS_SETTINGS: ImageToolsSettings = {
  defaultGenerateModelId: '',
  taskModelIds: {
    remove_background: 'imgly-rembg',
    remove_watermark: 'lama-inpaint',
    upscale: 'realesrgan-x4',
    denoise: 'nafnet',
    background_replace: 'imgly-rembg',
  },
  models: [],
  preferLocalVision: true,
  modelsRootMode: 'userData',
  customModelsRoot: '',
  customEngines: [],
}

export function visionCatalogEntry(id: string): VisionModelCatalogEntry | undefined {
  return VISION_MODEL_CATALOG.find((m) => m.id === id)
}

export function visionCatalogForTask(task: ImageSmartTask): VisionModelCatalogEntry[] {
  if (task === 'background_replace') {
    return VISION_MODEL_CATALOG.filter((m) => m.task === 'remove_background')
  }
  return VISION_MODEL_CATALOG.filter((m) => m.task === task)
}

export function isCustomEngineId(id: string): boolean {
  return id.startsWith('custom-')
}

export function parseCustomEngines(raw: unknown): CustomVisionEngine[] {
  if (!Array.isArray(raw)) return []
  const out: CustomVisionEngine[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const id = typeof rec.id === 'string' ? rec.id : ''
    const name = typeof rec.name === 'string' ? rec.name.trim() : ''
    const task = rec.task as ImageSmartTask
    const kind = rec.kind === 'http' ? 'http' : rec.kind === 'onnx' ? 'onnx' : null
    if (!id || !name || !kind) continue
    if (
      task !== 'remove_background' &&
      task !== 'remove_watermark' &&
      task !== 'upscale' &&
      task !== 'denoise' &&
      task !== 'background_replace'
    ) {
      continue
    }
    out.push({
      id,
      name,
      task,
      kind,
      enabled: rec.enabled !== false,
      createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : Date.now(),
      onnxPath: typeof rec.onnxPath === 'string' ? rec.onnxPath : undefined,
      endpointUrl: typeof rec.endpointUrl === 'string' ? rec.endpointUrl : undefined,
      apiKey: typeof rec.apiKey === 'string' ? rec.apiKey : undefined,
      notes: typeof rec.notes === 'string' ? rec.notes : undefined,
    })
  }
  return out
}

export function mergeVisionModelStates(
  saved: VisionModelState[] | undefined,
): VisionModelState[] {
  const byId = new Map((saved ?? []).map((m) => [m.id, m]))
  return VISION_MODEL_CATALOG.map((entry) => {
    const prev = byId.get(entry.id)
    if (prev) return { ...prev, id: entry.id }
    return { id: entry.id, status: 'not_installed' as const }
  })
}

function parseRootMode(raw: unknown): VisionModelsRootMode {
  if (raw === 'custom') return 'custom'
  // Legacy 'project' folds back to userData
  return 'userData'
}

export function parseImageToolsSettings(raw: unknown): ImageToolsSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_IMAGE_TOOLS_SETTINGS, models: mergeVisionModelStates([]) }
  }
  const rec = raw as Record<string, unknown>
  const models = mergeVisionModelStates(
    Array.isArray(rec.models) ? (rec.models as VisionModelState[]) : [],
  )
  const taskModelIds =
    rec.taskModelIds && typeof rec.taskModelIds === 'object'
      ? ({ ...(rec.taskModelIds as ImageToolsSettings['taskModelIds']) })
      : { ...DEFAULT_IMAGE_TOOLS_SETTINGS.taskModelIds }
  if (taskModelIds.denoise === 'denoise-basic') {
    taskModelIds.denoise = 'nafnet'
  }
  return {
    defaultGenerateModelId:
      typeof rec.defaultGenerateModelId === 'string' ? rec.defaultGenerateModelId : '',
    taskModelIds,
    models,
    preferLocalVision: rec.preferLocalVision === undefined ? true : Boolean(rec.preferLocalVision),
    modelsRootMode: parseRootMode(rec.modelsRootMode),
    customModelsRoot: typeof rec.customModelsRoot === 'string' ? rec.customModelsRoot : '',
    customEngines: parseCustomEngines(rec.customEngines),
  }
}

export interface ImageSmartRunRequest {
  task: ImageSmartTask
  /** data URL or raw base64 (no prefix) */
  imageDataUrl: string
  modelId?: string
  scale?: 2 | 3 | 4
  /** For background_replace: fill color css */
  fillColor?: string
  /** For remove_watermark: paint mask data URL (opaque = erase) */
  maskDataUrl?: string
}

export interface ImageSmartRunResult {
  ok: boolean
  imageDataUrl?: string
  error?: string
  /** machine reason for UI CTA */
  reason?: 'model_not_installed' | 'model_error' | 'unsupported' | 'cancelled'
  modelId?: string
}

export interface ImageSaveRequest {
  dataUrl: string
  defaultName?: string
}

export interface ImageSaveResult {
  ok: boolean
  path?: string
  error?: string
}

export interface VisionInstallProgress {
  id: string
  fileName?: string
  received: number
  total: number
  /** Overall 0–100 across the whole install (not per-file). */
  percent: number
  phase: 'start' | 'progress' | 'done' | 'error'
  error?: string
  /** 1-based index when installing multiple files */
  fileIndex?: number
  fileCount?: number
}
