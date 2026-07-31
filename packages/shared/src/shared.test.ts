import { describe, expect, it } from 'vitest'
import { ALL_STOCKS_RANGE_KEYS, KNOWLEDGE_VECTOR_STORES } from '../src/index'

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
})
