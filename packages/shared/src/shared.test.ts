import { describe, expect, it } from 'vitest'
import { ALL_STOCKS_RANGE_KEYS, KNOWLEDGE_VECTOR_STORES, isDirectChatAgentId } from '../src/index'

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
