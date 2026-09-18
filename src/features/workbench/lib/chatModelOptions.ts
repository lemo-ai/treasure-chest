import type { AiModelConfig, AiModelModality, FortuneAiProviderConfig } from '@shared'
import { isChatAiModel } from '@shared'

export function encodeChatModelRef(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`
}

export function decodeChatModelRef(value: string): { providerId: string; modelId: string } | null {
  const idx = value.indexOf('::')
  if (idx <= 0) return null
  const providerId = value.slice(0, idx).trim()
  const modelId = value.slice(idx + 2).trim()
  if (!providerId || !modelId) return null
  return { providerId, modelId }
}

export function findProviderModel(
  providers: FortuneAiProviderConfig[] | undefined,
  providerId: string,
  modelId: string,
): AiModelConfig | undefined {
  const provider = (providers ?? []).find((p) => p.id === providerId)
  return (provider?.models ?? []).find((m) => m.id === modelId)
}

export function modelSupportsOutput(
  model: AiModelConfig | undefined,
  kind: Exclude<AiModelModality, 'text'>,
): boolean {
  return Boolean(model?.outputModalities.includes(kind))
}

export { isChatAiModel }

/**
 * Resolve a media model for backend routing (picker stays on the chat model).
 * Prefer active provider: selected model if multimodal → dedicated image/video/music
 * id → any model with that output checkbox. Then scan other providers the same way.
 */
export function resolveMediaRouteModel(
  providers: FortuneAiProviderConfig[] | undefined,
  providerId: string,
  selectedModelId: string,
  kind: Exclude<AiModelModality, 'text'>,
): string | null {
  const list = providers ?? []
  if (!list.length) return null

  const dedicatedKey =
    kind === 'image' ? 'imageModel' : kind === 'video' ? 'videoModel' : 'musicModel'

  const fromProvider = (provider: FortuneAiProviderConfig, preferSelected: boolean): string | null => {
    if (preferSelected) {
      const selected = (provider.models ?? []).find((m) => m.id === selectedModelId)
      if (modelSupportsOutput(selected, kind)) return selectedModelId
    }
    const dedicated = provider[dedicatedKey]?.trim()
    if (dedicated) return dedicated
    const any = (provider.models ?? []).find((m) => modelSupportsOutput(m, kind))
    return any?.id ?? null
  }

  const preferred = list.find((p) => p.id === providerId)
  if (preferred) {
    const hit = fromProvider(preferred, true)
    if (hit) return hit
  }

  for (const p of list) {
    if (p.id === providerId) continue
    const hit = fromProvider(p, false)
    if (hit) return hit
  }
  return null
}

/** Chat-only groups for the workbench / agents / schedules model picker. */
export function groupedChatModels(
  providers: FortuneAiProviderConfig[] | undefined,
): Array<{ id: string; name: string; models: string[] }> {
  return (providers ?? [])
    .map((p) => ({
      id: p.id,
      name: p.name || p.id,
      models: (p.models ?? []).filter(isChatAiModel).map((m) => m.id),
    }))
    .filter((g) => g.models.length > 0)
}
