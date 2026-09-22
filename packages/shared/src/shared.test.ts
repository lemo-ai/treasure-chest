import { describe, expect, it } from 'vitest'
import {
  ALL_STOCKS_RANGE_KEYS,
  KNOWLEDGE_VECTOR_STORES,
  hydrateLegacyMediaModels,
  isChatAiModel,
  isDirectChatAgentId,
  localLlmFamilyById,
  localLlmPullName,
  localLlmTierForVersion,
  localLlmValidateModelRef,
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
    expect(dalle?.outputModalities).toEqual(['image'])
    expect(isChatAiModel(dalle!)).toBe(false)
  })

  it('creates media-only slots for dedicated imageModel ids not in the list', () => {
    const hydrated = hydrateLegacyMediaModels(parseAiModelList(['qwen-plus']), {
      imageModel: 'wanx2.1-t2i-turbo',
    })
    const wanx = hydrated.find((m) => m.id === 'wanx2.1-t2i-turbo')
    expect(wanx?.outputModalities).toEqual(['image'])
    expect(isChatAiModel(wanx!)).toBe(false)
    expect(isChatAiModel(hydrated.find((m) => m.id === 'qwen-plus')!)).toBe(true)
  })

  it('keeps chat models selectable when they also output image', () => {
    const model = parseAiModelList([
      { id: 'qwen-plus', inputModalities: ['text'], outputModalities: ['text', 'image'] },
    ])[0]!
    expect(isChatAiModel(model)).toBe(true)
  })
})

describe('local llm catalog', () => {
  it('builds pull names and validates refs', () => {
    const family = localLlmFamilyById('qwen25')
    expect(family).toBeTruthy()
    expect(localLlmPullName(family!, '7b')).toBe('qwen2.5:7b')
    expect(localLlmPullName(family!, 'latest')).toBe('qwen2.5')
    expect(localLlmValidateModelRef('qwen2.5:7b-instruct-q5_K_M').ok).toBe(true)
    expect(localLlmValidateModelRef('../evil').ok).toBe(false)
  })

  it('tiers large models as avoid on 24GB hosts', () => {
    const family = localLlmFamilyById('qwen25')!
    const big = family.versions.find((v) => v.tag === '72b')!
    expect(localLlmTierForVersion(big, 24)).toBe('avoid')
    const mid = family.versions.find((v) => v.tag === '14b')!
    expect(['recommended', 'optional', 'tight']).toContain(localLlmTierForVersion(mid, 24))
  })
})
