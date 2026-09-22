import type { AiProviderPreset } from './types/media'

export const AI_MODEL_MODALITIES = ['text', 'image', 'video', 'audio'] as const
export type AiModelModality = (typeof AI_MODEL_MODALITIES)[number]

export interface AiModelConfig {
  id: string
  contextWindow?: number
  maxOutputTokens?: number
  inputModalities: AiModelModality[]
  outputModalities: AiModelModality[]
}

const MODALITY_SET = new Set<string>(AI_MODEL_MODALITIES)

function uniqModalities(list: AiModelModality[], lockText: boolean): AiModelModality[] {
  const next: AiModelModality[] = []
  const seen = new Set<AiModelModality>()
  for (const item of list) {
    if (!MODALITY_SET.has(item) || seen.has(item)) continue
    seen.add(item)
    next.push(item)
  }
  if (lockText && !seen.has('text')) next.unshift('text')
  return next
}

function asModalities(raw: unknown, lockText: boolean): AiModelModality[] {
  if (!Array.isArray(raw)) return lockText ? ['text'] : []
  return uniqModalities(
    raw.filter((item): item is AiModelModality => typeof item === 'string' && MODALITY_SET.has(item)),
    lockText,
  )
}

/** True when outputs are media-only (no text) — used for dedicated image/video/music models. */
function isMediaOnlyOutputs(list: AiModelModality[] | undefined): boolean {
  if (!list?.length) return false
  if (list.includes('text')) return false
  return list.some((m) => m === 'image' || m === 'video' || m === 'audio')
}

export function defaultAiModelConfig(id: string, patch?: Partial<Omit<AiModelConfig, 'id'>>): AiModelConfig {
  const trimmed = id.trim()
  const mediaOnly = isMediaOnlyOutputs(patch?.outputModalities)
  return {
    id: trimmed,
    contextWindow: patch?.contextWindow,
    maxOutputTokens: patch?.maxOutputTokens,
    inputModalities: uniqModalities(patch?.inputModalities ?? ['text'], true),
    // Dedicated media models must not force-lock text output, or the chat picker
    // cannot tell them apart from chat/multimodal models.
    outputModalities: mediaOnly
      ? uniqModalities(patch!.outputModalities!, false)
      : uniqModalities(patch?.outputModalities ?? ['text'], true),
  }
}

export function parseAiModelEntry(raw: unknown): AiModelConfig | null {
  if (typeof raw === 'string') {
    const id = raw.trim()
    return id ? defaultAiModelConfig(id) : null
  }
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const id = typeof rec.id === 'string' ? rec.id.trim() : ''
  if (!id) return null
  const contextWindow =
    typeof rec.contextWindow === 'number' && Number.isFinite(rec.contextWindow)
      ? Math.max(1, Math.round(rec.contextWindow))
      : undefined
  const maxOutputTokens =
    typeof rec.maxOutputTokens === 'number' && Number.isFinite(rec.maxOutputTokens)
      ? Math.max(1, Math.round(rec.maxOutputTokens))
      : undefined
  const rawOut = asModalities(rec.outputModalities, false)
  const mediaOnly = isMediaOnlyOutputs(rawOut)
  return defaultAiModelConfig(id, {
    contextWindow,
    maxOutputTokens,
    inputModalities: asModalities(rec.inputModalities, true),
    outputModalities: mediaOnly ? rawOut : asModalities(rec.outputModalities, true),
  })
}

export function parseAiModelList(raw: unknown): AiModelConfig[] {
  if (!Array.isArray(raw)) return []
  const out: AiModelConfig[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const parsed = parseAiModelEntry(item)
    if (!parsed || seen.has(parsed.id)) continue
    seen.add(parsed.id)
    out.push(parsed)
  }
  return out
}

export function aiModelIds(models: AiModelConfig[]): string[] {
  return models.map((m) => m.id)
}

/**
 * Chat picker eligibility: any model that outputs text.
 * Dedicated image/video/music models use media-only outputs (no text) —
 * see hydrateLegacyMediaModels / AddModelModal media-only mode.
 */
export function isChatAiModel(model: AiModelConfig): boolean {
  return model.outputModalities.includes('text')
}

export function firstModelId(models: AiModelConfig[]): string {
  return models[0]?.id ?? ''
}

export function firstChatModelId(models: AiModelConfig[]): string {
  return models.find((m) => isChatAiModel(m))?.id ?? firstModelId(models)
}

export function firstOutputModelId(models: AiModelConfig[], kind: Exclude<AiModelModality, 'text'>): string | undefined {
  return models.find((m) => m.outputModalities.includes(kind))?.id
}

function withInput(model: AiModelConfig, kind: Exclude<AiModelModality, 'text'>): AiModelConfig {
  if (model.inputModalities.includes(kind)) return model
  return { ...model, inputModalities: uniqModalities([...model.inputModalities, kind], true) }
}

/** Build / refresh a dedicated media model (no text output → hidden from chat picker). */
function asDedicatedMediaModel(model: AiModelConfig, kind: Exclude<AiModelModality, 'text'>): AiModelConfig {
  const outs = model.outputModalities.filter((m) => m !== 'text')
  if (!outs.includes(kind)) outs.push(kind)
  return {
    ...model,
    inputModalities: uniqModalities(model.inputModalities.length ? model.inputModalities : ['text'], true),
    outputModalities: uniqModalities(outs, false),
  }
}

/** Heuristic for ids that are almost always pure generators (legacy configs). */
function looksLikeDedicatedMediaId(id: string): boolean {
  const s = id.toLowerCase()
  return (
    s.includes('wanx') ||
    s.includes('wan2.') ||
    s.includes('dall-e') ||
    s.includes('seedream') ||
    s.includes('seedance') ||
    s.includes('kling') ||
    s.includes('flux') ||
    s.includes('fun-music') ||
    s.includes('music-01') ||
    s.includes('cosyvoice') ||
    s.includes('stable-diffusion') ||
    s.includes('sdxl')
  )
}

/** Apply legacy dedicated media model ids onto the model list (checkbox-equivalent). */
export function hydrateLegacyMediaModels(
  models: AiModelConfig[],
  media?: { imageModel?: string; videoModel?: string; musicModel?: string },
): AiModelConfig[] {
  let next = [...models]
  const apply = (id: string | undefined, kind: Exclude<AiModelModality, 'text'>): void => {
    const modelId = id?.trim()
    if (!modelId) return
    const idx = next.findIndex((m) => m.id === modelId)
    if (idx >= 0) {
      const existing = next[idx]!
      // Known media generators (or already media-only): force media-only so they
      // leave the chat picker. Other text models only gain the extra output bit.
      if (looksLikeDedicatedMediaId(modelId) || !existing.outputModalities.includes('text')) {
        next[idx] = asDedicatedMediaModel(existing, kind)
        return
      }
      next[idx] = {
        ...existing,
        outputModalities: uniqModalities([...existing.outputModalities, kind], true),
      }
      return
    }
    next.push(
      asDedicatedMediaModel(
        { id: modelId, inputModalities: ['text'], outputModalities: [] },
        kind,
      ),
    )
  }
  apply(media?.imageModel, 'image')
  apply(media?.videoModel, 'video')
  apply(media?.musicModel, 'audio')
  return next
}

export function mediaIdsFromModels(models: AiModelConfig[]): {
  imageModel?: string
  videoModel?: string
  musicModel?: string
} {
  const dedicated = (kind: Exclude<AiModelModality, 'text'>): string | undefined => {
    // Prefer media-only entries so chat models with an extra image checkbox
    // are not rewritten into dedicated media slots on the next save.
    const mediaOnly = models.find(
      (m) => m.outputModalities.includes(kind) && !m.outputModalities.includes('text'),
    )
    if (mediaOnly) return mediaOnly.id
    return undefined
  }
  return {
    imageModel: dedicated('image'),
    videoModel: dedicated('video'),
    musicModel: dedicated('audio'),
  }
}

export function modelsFromProviderPreset(preset: AiProviderPreset): AiModelConfig[] {
  const base = parseAiModelList(preset.models)
  return hydrateLegacyMediaModels(base, {
    imageModel: preset.imageModel,
    videoModel: preset.videoModel,
    musicModel: preset.musicModel,
  }).map((model) => {
    const id = model.id.toLowerCase()
    if (id.includes('gpt-4o') || id.includes('vision') || id.includes('4.1') || id.includes('claude-3')) {
      return withInput(model, 'image')
    }
    if (id.includes('qwen-vl') || id.includes('qwen2.5-vl') || id.includes('qwen2-vl')) {
      return withInput(model, 'image')
    }
    return model
  })
}
