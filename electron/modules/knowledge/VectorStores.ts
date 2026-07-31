import { createHash } from 'node:crypto'
import type { KnowledgeSettings } from '@shared'
import { logger } from '../../utils/logger'

/** Qdrant only accepts UUID or unsigned integer point ids. */
function toQdrantPointId(chunkId: string): string {
  const h = createHash('sha1').update(chunkId).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

export interface VectorPoint {
  id: string
  vector: number[]
  payload: {
    documentId: string
    chunkId: string
    collectionId: string
    title: string
    ordinal: number
    text: string
  }
}

export interface VectorSearchHit {
  chunkId: string
  score: number
}

function authHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey.trim()) headers['api-key'] = apiKey.trim()
  return headers
}

function chromaHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`
    headers['X-Chroma-Token'] = apiKey.trim()
  }
  return headers
}

async function ensureQdrantCollection(settings: KnowledgeSettings, dims: number): Promise<void> {
  const base = settings.vectorStoreUrl.replace(/\/$/, '')
  const name = settings.vectorCollection || 'treasure_chest'
  const headers = authHeaders(settings.vectorStoreApiKey)
  const getRes = await fetch(`${base}/collections/${encodeURIComponent(name)}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  })
  if (getRes.ok) return
  const createRes = await fetch(`${base}/collections/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      vectors: { size: dims, distance: 'Cosine' },
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!createRes.ok) {
    const body = await createRes.text().catch(() => '')
    throw new Error(`Qdrant create collection failed: HTTP ${createRes.status} ${body}`)
  }
}

export async function upsertQdrant(settings: KnowledgeSettings, points: VectorPoint[]): Promise<void> {
  if (!points.length) return
  const dims = points[0]!.vector.length
  await ensureQdrantCollection(settings, dims)
  const base = settings.vectorStoreUrl.replace(/\/$/, '')
  const name = settings.vectorCollection || 'treasure_chest'
  const res = await fetch(`${base}/collections/${encodeURIComponent(name)}/points?wait=true`, {
    method: 'PUT',
    headers: authHeaders(settings.vectorStoreApiKey),
    body: JSON.stringify({
      points: points.map((p) => ({
        id: toQdrantPointId(p.id),
        vector: p.vector,
        payload: p.payload,
      })),
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Qdrant upsert failed: HTTP ${res.status} ${body}`)
  }
}

export async function deleteQdrantByDocument(
  settings: KnowledgeSettings,
  documentId: string,
): Promise<void> {
  const base = settings.vectorStoreUrl.replace(/\/$/, '')
  const name = settings.vectorCollection || 'treasure_chest'
  const res = await fetch(
    `${base}/collections/${encodeURIComponent(name)}/points/delete?wait=true`,
    {
      method: 'POST',
      headers: authHeaders(settings.vectorStoreApiKey),
      body: JSON.stringify({
        filter: {
          must: [{ key: 'documentId', match: { value: documentId } }],
        },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  )
  if (!res.ok && res.status !== 404) {
    logger.warn(`Qdrant delete failed HTTP ${res.status}`)
  }
}

export async function searchQdrant(
  settings: KnowledgeSettings,
  vector: number[],
  limit: number,
  collectionId?: string,
): Promise<VectorSearchHit[]> {
  const base = settings.vectorStoreUrl.replace(/\/$/, '')
  const name = settings.vectorCollection || 'treasure_chest'
  const filter = collectionId
    ? { must: [{ key: 'collectionId', match: { value: collectionId } }] }
    : undefined
  const res = await fetch(`${base}/collections/${encodeURIComponent(name)}/points/search`, {
    method: 'POST',
    headers: authHeaders(settings.vectorStoreApiKey),
    body: JSON.stringify({
      vector,
      limit,
      with_payload: true,
      filter,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    logger.warn(`Qdrant search failed HTTP ${res.status}`)
    return []
  }
  const data = (await res.json()) as {
    result?: Array<{ score?: number; payload?: { chunkId?: string } }>
  }
  return (data.result || [])
    .map((r) => ({
      chunkId: String(r.payload?.chunkId || ''),
      score: Number(r.score) || 0,
    }))
    .filter((h) => h.chunkId)
}

async function resolveChromaCollectionId(settings: KnowledgeSettings): Promise<string> {
  const base = settings.vectorStoreUrl.replace(/\/$/, '')
  const name = settings.vectorCollection || 'treasure_chest'
  const headers = chromaHeaders(settings.vectorStoreApiKey)
  const listRes = await fetch(`${base}/api/v1/collections`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  })
  if (listRes.ok) {
    const list = (await listRes.json()) as Array<{ id?: string; name?: string }>
    const found = list.find((c) => c.name === name)
    if (found?.id) return found.id
  }
  const createRes = await fetch(`${base}/api/v1/collections`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, get_or_create: true }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!createRes.ok) {
    const body = await createRes.text().catch(() => '')
    throw new Error(`Chroma create collection failed: HTTP ${createRes.status} ${body}`)
  }
  const created = (await createRes.json()) as { id?: string }
  if (!created.id) throw new Error('Chroma collection id missing')
  return created.id
}

export async function upsertChroma(settings: KnowledgeSettings, points: VectorPoint[]): Promise<void> {
  if (!points.length) return
  const base = settings.vectorStoreUrl.replace(/\/$/, '')
  const collectionId = await resolveChromaCollectionId(settings)
  const res = await fetch(`${base}/api/v1/collections/${collectionId}/upsert`, {
    method: 'POST',
    headers: chromaHeaders(settings.vectorStoreApiKey),
    body: JSON.stringify({
      ids: points.map((p) => p.id),
      embeddings: points.map((p) => p.vector),
      documents: points.map((p) => p.payload.text),
      metadatas: points.map((p) => ({
        documentId: p.payload.documentId,
        chunkId: p.payload.chunkId,
        collectionId: p.payload.collectionId,
        title: p.payload.title,
        ordinal: p.payload.ordinal,
      })),
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Chroma upsert failed: HTTP ${res.status} ${body}`)
  }
}

export async function deleteChromaByDocument(
  settings: KnowledgeSettings,
  documentId: string,
): Promise<void> {
  try {
    const base = settings.vectorStoreUrl.replace(/\/$/, '')
    const collectionId = await resolveChromaCollectionId(settings)
    const res = await fetch(`${base}/api/v1/collections/${collectionId}/delete`, {
      method: 'POST',
      headers: chromaHeaders(settings.vectorStoreApiKey),
      body: JSON.stringify({
        where: { documentId },
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok && res.status !== 404) {
      logger.warn(`Chroma delete failed HTTP ${res.status}`)
    }
  } catch (err) {
    logger.warn('Chroma delete error', err)
  }
}

export async function searchChroma(
  settings: KnowledgeSettings,
  vector: number[],
  limit: number,
  collectionId?: string,
): Promise<VectorSearchHit[]> {
  try {
    const base = settings.vectorStoreUrl.replace(/\/$/, '')
    const chromaId = await resolveChromaCollectionId(settings)
    const body: Record<string, unknown> = {
      query_embeddings: [vector],
      n_results: limit,
      include: ['metadatas', 'distances'],
    }
    if (collectionId) body.where = { collectionId }
    const res = await fetch(`${base}/api/v1/collections/${chromaId}/query`, {
      method: 'POST',
      headers: chromaHeaders(settings.vectorStoreApiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      logger.warn(`Chroma search failed HTTP ${res.status}`)
      return []
    }
    const data = (await res.json()) as {
      ids?: string[][]
      distances?: number[][]
      metadatas?: Array<Array<{ chunkId?: string } | null>>
    }
    const ids = data.ids?.[0] || []
    const distances = data.distances?.[0] || []
    const metas = data.metadatas?.[0] || []
    return ids.map((id, i) => {
      const chunkId = String(metas[i]?.chunkId || id)
      const dist = Number(distances[i]) || 0
      return { chunkId, score: 1 / (1 + Math.max(0, dist)) }
    })
  } catch (err) {
    logger.warn('Chroma search error', err)
    return []
  }
}
