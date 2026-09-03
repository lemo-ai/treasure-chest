import { describe, expect, it } from 'vitest'
import {
  ALL_STOCKS_RANGE_KEYS,
  KNOWLEDGE_VECTOR_STORES,
  hydrateLegacyMediaModels,
  isChatAiModel,
  isDirectChatAgentId,
  parseAiModelList,
} from '../src/index'

describe('shared constants', () => {
  it('exposes stock range keys', () => {
    expect(ALL_STOCKS_RANGE_KEYS).toContain('d1')
    expect(ALL_STOCKS_RANGE_KEYS).toContain('y1')
  })

  it('includes cloud vector stores', () => {
    expect(KNOWLEDGE_VECTOR_STORES).toEqual(
      expect.arrayContaining(['sqlite_json', 'qdrant', 'chroma', 'pinecone', 'weaviate']),
    )
  })

  it('treats empty / none / direct as workbench chat, not an agent', () => {
    expect(isDirectChatAgentId('direct')).toBe(true)
    expect(isDirectChatAgentId('')).toBe(true)
    expect(isDirectChatAgentId('none')).toBe(true)
    expect(isDirectChatAgentId('stocks')).toBe(false)
    expect(isDirectChatAgentId('custom_abc')).toBe(false)
  })
})

describe('ai model configs', () => {
  it('parses string model ids and hydrates media checkboxes', () => {
    const models = parseAiModelList(['gpt-4o', { id: 'dall-e-3', outputModalities: ['text', 'image'] }])
    expect(models[0]?.id).toBe('gpt-4o')
    expect(isChatAiModel(models[0]!)).toBe(true)
    const hydrated = hydrateLegacyMediaModels(models, { imageModel: 'dall-e-3' })
    const dalle = hydrated.find((m) => m.id === 'dall-e-3')
    expect(dalle?.outputModalities).toContain('image')
    expect(isChatAiModel(dalle!)).toBe(false)
  })
})
