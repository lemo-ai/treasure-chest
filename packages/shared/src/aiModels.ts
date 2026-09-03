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

export function defaultAiModelConfig(id: string, patch?: Partial<Omit<AiModelConfig, 'id'>>): AiModelConfig {
  const trimmed = id.trim()
  return {
    id: trimmed,
    contextWindow: patch?.contextWindow,
    maxOutputTokens: patch?.maxOutputTokens,
    inputModalities: uniqModalities(patch?.inputModalities ?? ['text'], true),
    outputModalities: uniqModalities(patch?.outputModalities ?? ['text'], true),
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
  return defaultAiModelConfig(id, {
    contextWindow,
    maxOutputTokens,
    inputModalities: asModalities(rec.inputModalities, true),
    outputModalities: asModalities(rec.outputModalities, true),
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

export function isChatAiModel(model: AiModelConfig): boolean {
  if (!model.outputModalities.includes('text')) return false
  const generatesMedia =
    model.outputModalities.includes('image') ||
    model.outputModalities.includes('video') ||
    model.outputModalities.includes('audio')
  const seesMedia = model.inputModalities.includes('image') || model.inputModalities.includes('video')
  if (generatesMedia && !seesMedia) return false
  return true
}

export function firstModelId(models: AiModelConfig[]): string {
  return models[0]?.id ?? ''
}

export function firstOutputModelId(models: AiModelConfig[], kind: Exclude<AiModelModality, 'text'>): string | undefined {
  return models.find((m) => m.outputModalities.includes(kind))?.id
}

function withOutput(model: AiModelConfig, kind: Exclude<AiModelModality, 'text'>): AiModelConfig {
  if (model.outputModalities.includes(kind)) return model
  return { ...model, outputModalities: uniqModalities([...model.outputModalities, kind], true) }
}

function withInput(model: AiModelConfig, kind: Exclude<AiModelModality, 'text'>): AiModelConfig {
  if (model.inputModalities.includes(kind)) return model
  return { ...model, inputModalities: uniqModalities([...model.inputModalities, kind], true) }
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
      next[idx] = withOutput(next[idx]!, kind)
      return
    }
    next.push(withOutput(defaultAiModelConfig(modelId), kind))
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
  return {
    imageModel: firstOutputModelId(models, 'image'),
    videoModel: firstOutputModelId(models, 'video'),
    musicModel: firstOutputModelId(models, 'audio'),
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
    return model
  })
}
