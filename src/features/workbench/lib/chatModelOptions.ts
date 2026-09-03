import type { FortuneAiProviderConfig } from '@shared'
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
