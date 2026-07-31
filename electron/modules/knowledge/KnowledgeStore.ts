import { createHash, randomUUID } from 'node:crypto'
import type {
  KnowledgeCollection,
  KnowledgeDocument,
  KnowledgeDocumentFile,
  KnowledgeEmbeddingProvider,
  KnowledgeIngestFileInput,
  KnowledgeIngestInput,
  KnowledgeSearchResult,
  KnowledgeSettings,
  KnowledgeVectorStore,
} from '@shared'
import { DEFAULT_KNOWLEDGE_SETTINGS } from '@shared'
import { getDb } from '../../db/Database'
import { getSetting, setSetting } from '../../db/AppSettingsRepo'
import { logger } from '../../utils/logger'
import { extractTextFromBuffer } from './DocumentExtractor'
import {
  deleteKnowledgeBlob,
  readKnowledgeBlob,
  saveKnowledgeBlob,
} from './KnowledgeBlobs'
import {
  deleteChromaByDocument,
  deleteQdrantByDocument,
  searchChroma,
  searchQdrant,
  upsertChroma,
  upsertQdrant,
  type VectorPoint,
} from './VectorStores'

const DEFAULT_COLLECTION_ID = 'default'

function chunkText(text: string, size: number, overlap: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  const chunks: string[] = []
  let i = 0
  const step = Math.max(1, size - overlap)
  while (i < normalized.length) {
    const end = Math.min(normalized.length, i + size)
    const slice = normalized.slice(i, end).trim()
    if (slice) chunks.push(slice)
    if (end >= normalized.length) break
    i += step
  }
  return chunks
}

function ensureDefaultCollection(): void {
  const db = getDb()
  const row = db.prepare('SELECT id FROM knowledge_collections WHERE id = ?').get(DEFAULT_COLLECTION_ID)
  if (row) return
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO knowledge_collections (id, name, description, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(DEFAULT_COLLECTION_ID, '默认知识库', '系统默认分区', '#0fbea8', now, now)
}

function migrateLegacySettings(raw: Record<string, unknown>): Partial<KnowledgeSettings> {
  const out: Partial<KnowledgeSettings> = { ...raw } as Partial<KnowledgeSettings>
  if (!out.embeddingProvider && typeof raw.vectorBackend === 'string') {
    const legacy = raw.vectorBackend
    if (legacy === 'none') out.embeddingProvider = 'none'
    else if (legacy === 'sqlite_json') out.embeddingProvider = 'local_hash'
    else if (legacy === 'openai' || legacy === 'ollama' || legacy === 'openai_compatible') {
      out.embeddingProvider = legacy
    }
    if (legacy === 'none') out.vectorStore = out.vectorStore || 'sqlite_json'
    else out.vectorStore = out.vectorStore || 'sqlite_json'
  }
  return out
}

export function getKnowledgeSettings(): KnowledgeSettings {
  const stored = getSetting('knowledge.settings', DEFAULT_KNOWLEDGE_SETTINGS) as unknown as Record<
    string,
    unknown
  >
  const raw = migrateLegacySettings(stored)
  const embeddingProvider = (raw.embeddingProvider ||
    DEFAULT_KNOWLEDGE_SETTINGS.embeddingProvider) as KnowledgeEmbeddingProvider
  const vectorStore = (raw.vectorStore ||
    DEFAULT_KNOWLEDGE_SETTINGS.vectorStore) as KnowledgeVectorStore
  return {
    ...DEFAULT_KNOWLEDGE_SETTINGS,
    ...raw,
    embeddingProvider,
    vectorStore,
    chunkSize: Number(raw.chunkSize) || DEFAULT_KNOWLEDGE_SETTINGS.chunkSize,
    chunkOverlap: Number(raw.chunkOverlap) || DEFAULT_KNOWLEDGE_SETTINGS.chunkOverlap,
    embeddingDims: Number(raw.embeddingDims) || DEFAULT_KNOWLEDGE_SETTINGS.embeddingDims,
    hybridSearch: raw.hybridSearch !== undefined ? Boolean(raw.hybridSearch) : true,
    embeddingModel: String(raw.embeddingModel || DEFAULT_KNOWLEDGE_SETTINGS.embeddingModel),
    embeddingBaseUrl: String(raw.embeddingBaseUrl || DEFAULT_KNOWLEDGE_SETTINGS.embeddingBaseUrl),
    embeddingApiKey: String(raw.embeddingApiKey || ''),
    vectorStoreUrl: String(raw.vectorStoreUrl || DEFAULT_KNOWLEDGE_SETTINGS.vectorStoreUrl),
    vectorStoreApiKey: String(raw.vectorStoreApiKey || ''),
    vectorCollection: String(raw.vectorCollection || DEFAULT_KNOWLEDGE_SETTINGS.vectorCollection),
    defaultCollectionId:
      (raw.defaultCollectionId as string | null | undefined) ??
      DEFAULT_KNOWLEDGE_SETTINGS.defaultCollectionId,
  }
}

export function setKnowledgeSettings(partial: Partial<KnowledgeSettings>): KnowledgeSettings {
  const next = { ...getKnowledgeSettings(), ...partial }
  setSetting('knowledge.settings', next)
  return next
}

export function listKnowledgeCollections(): KnowledgeCollection[] {
  ensureDefaultCollection()
  const rows = getDb()
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(1) FROM knowledge_documents d WHERE d.collection_id = c.id) AS documentCount
       FROM knowledge_collections c
       ORDER BY c.updated_at DESC`,
    )
    .all() as Array<{
    id: string
    name: string
    description: string
    color: string
    created_at: string
    updated_at: string
    documentCount: number
  }>
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description || '',
    color: r.color || '#0fbea8',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    documentCount: r.documentCount ?? 0,
  }))
}

export function createKnowledgeCollection(input: {
  name: string
  description?: string
  color?: string
}): KnowledgeCollection {
  const id = `col_${randomUUID().slice(0, 8)}`
  const now = new Date().toISOString()
  const name = input.name.trim() || 'Untitled'
  getDb()
    .prepare(
      `INSERT INTO knowledge_collections (id, name, description, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, name, input.description?.trim() || '', input.color || '#4c8dff', now, now)
  return listKnowledgeCollections().find((c) => c.id === id)!
}

export function renameKnowledgeCollection(id: string, name: string): KnowledgeCollection | null {
  const next = name.trim()
  if (!next) return null
  getDb()
    .prepare(`UPDATE knowledge_collections SET name = ?, updated_at = ? WHERE id = ?`)
    .run(next, new Date().toISOString(), id)
  return listKnowledgeCollections().find((c) => c.id === id) ?? null
}

export function deleteKnowledgeCollection(id: string): boolean {
  if (id === DEFAULT_COLLECTION_ID) return false
  const db = getDb()
  const docs = db
    .prepare('SELECT id FROM knowledge_documents WHERE collection_id = ?')
    .all(id) as Array<{ id: string }>
  const tx = db.transaction(() => {
    for (const doc of docs) {
      db.prepare(
        'DELETE FROM knowledge_chunk_embeddings WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE document_id = ?)',
      ).run(doc.id)
      db.prepare('DELETE FROM knowledge_chunks_fts WHERE document_id = ?').run(doc.id)
      db.prepare('DELETE FROM knowledge_chunks WHERE document_id = ?').run(doc.id)
      db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(doc.id)
    }
    db.prepare('DELETE FROM knowledge_collections WHERE id = ?').run(id)
  })
  tx()
  for (const doc of docs) {
    deleteKnowledgeBlob(doc.id)
  }
  const settings = getKnowledgeSettings()
  if (settings.defaultCollectionId === id) {
    setKnowledgeSettings({ defaultCollectionId: DEFAULT_COLLECTION_ID })
  }
  return true
}

function toDoc(row: {
  id: string
  collection_id: string
  title: string
  source: string
  mime: string
  bytes: number
  status: string
  error_message: string | null
  created_at: string
  updated_at: string
  file_name?: string | null
  has_original?: number | null
  embedded?: number | null
  chunkCount?: number
  embeddingCount?: number
}): KnowledgeDocument {
  return {
    id: row.id,
    collectionId: row.collection_id || DEFAULT_COLLECTION_ID,
    title: row.title,
    source: row.source === 'system' ? 'system' : 'upload',
    mime: row.mime,
    bytes: row.bytes,
    chunkCount: row.chunkCount ?? 0,
    embeddingCount: row.embeddingCount ?? 0,
    embedded: Boolean(row.embedded) || (row.embeddingCount ?? 0) > 0,
    fileName: row.file_name || undefined,
    hasOriginal: Boolean(row.has_original),
    status: row.status === 'error' ? 'error' : row.status === 'pending' ? 'pending' : 'ready',
    errorMessage: row.error_message || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listKnowledgeDocuments(collectionId?: string): KnowledgeDocument[] {
  ensureDefaultCollection()
  const db = getDb()
  const sql = `SELECT d.*,
            (SELECT COUNT(1) FROM knowledge_chunks c WHERE c.document_id = d.id) AS chunkCount,
            (SELECT COUNT(1) FROM knowledge_chunk_embeddings e
              JOIN knowledge_chunks c ON c.id = e.chunk_id
              WHERE c.document_id = d.id) AS embeddingCount
           FROM knowledge_documents d
           ${collectionId ? 'WHERE d.collection_id = ?' : ''}
           ORDER BY d.updated_at DESC`
  const rows = (
    collectionId ? db.prepare(sql).all(collectionId) : db.prepare(sql).all()
  ) as Array<{
    id: string
    collection_id: string
    title: string
    source: string
    mime: string
    bytes: number
    status: string
    error_message: string | null
    created_at: string
    updated_at: string
    file_name: string | null
    has_original: number
    embedded: number
    chunkCount: number
    embeddingCount: number
  }>
  return rows.map(toDoc)
}

async function embedTexts(texts: string[], settings: KnowledgeSettings): Promise<number[][] | null> {
  const provider = settings.embeddingProvider
  if (provider === 'none') return null
  if (provider === 'local_hash') {
    return texts.map((text) => localHashEmbedding(text, settings.embeddingDims))
  }

  const base = settings.embeddingBaseUrl.replace(/\/$/, '')
  const model =
    settings.embeddingModel ||
    (provider === 'ollama' ? 'nomic-embed-text' : 'text-embedding-3-small')

  let url: string
  if (provider === 'ollama') {
    // Native Ollama API: http://127.0.0.1:11434/api/embeddings
    const root = base.replace(/\/v1\/?$/, '') || 'http://127.0.0.1:11434'
    url = `${root}/api/embeddings`
  } else {
    url = `${base || 'https://api.openai.com/v1'}/embeddings`
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (settings.embeddingApiKey.trim() && provider !== 'ollama') {
    headers.Authorization = `Bearer ${settings.embeddingApiKey.trim()}`
  }

  const out: number[][] = []
  for (const text of texts) {
    try {
      const body =
        provider === 'ollama'
          ? JSON.stringify({ model, prompt: text })
          : JSON.stringify({ model, input: text })
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(60_000),
      })
      if (!res.ok) {
        logger.warn(`embedding failed HTTP ${res.status}`)
        return null
      }
      const data = (await res.json()) as {
        embedding?: number[]
        data?: Array<{ embedding: number[] }>
      }
      const vec = provider === 'ollama' ? data.embedding : data.data?.[0]?.embedding
      if (!vec?.length) return null
      out.push(vec)
    } catch (err) {
      logger.warn('embedding request error', err)
      return null
    }
  }
  return out
}

function localHashEmbedding(text: string, dims: number): number[] {
  const v = new Array<number>(dims).fill(0)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    v[code % dims]! += 1
    v[(code * 7) % dims]! += 0.5
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  return v.map((x) => x / norm)
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  const d = Math.sqrt(na) * Math.sqrt(nb)
  return d ? dot / d : 0
}

async function persistVectors(
  settings: KnowledgeSettings,
  points: VectorPoint[],
  modelLabel: string,
  now: string,
): Promise<void> {
  if (!points.length) return
  if (settings.vectorStore === 'qdrant') {
    await upsertQdrant(settings, points)
    return
  }
  if (settings.vectorStore === 'chroma') {
    await upsertChroma(settings, points)
    return
  }
  const db = getDb()
  const insertEmb = db.prepare(
    `INSERT INTO knowledge_chunk_embeddings (chunk_id, model, dims, embedding_json, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(chunk_id) DO UPDATE SET
       model = excluded.model,
       dims = excluded.dims,
       embedding_json = excluded.embedding_json,
       created_at = excluded.created_at`,
  )
  const embTx = db.transaction(() => {
    for (const p of points) {
      insertEmb.run(p.id, modelLabel, p.vector.length, JSON.stringify(p.vector), now)
    }
  })
  embTx()
}

async function removeExternalVectors(settings: KnowledgeSettings, documentId: string): Promise<void> {
  if (settings.vectorStore === 'qdrant') {
    await deleteQdrantByDocument(settings, documentId)
  } else if (settings.vectorStore === 'chroma') {
    await deleteChromaByDocument(settings, documentId)
  }
}

export async function ingestKnowledgeText(
  input: KnowledgeIngestInput & {
    fileName?: string
    originalBytes?: number
    hasOriginal?: boolean
  },
): Promise<KnowledgeDocument> {
  ensureDefaultCollection()
  const settings = getKnowledgeSettings()
  const title = input.title.trim() || 'Untitled'
  const text = input.text.replace(/\r\n/g, '\n').trim()
  if (!text) throw new Error('empty text')
  const mime = input.mime?.trim() || 'text/plain'
  const source = input.source === 'system' ? 'system' : 'upload'
  const collectionId =
    input.collectionId?.trim() || settings.defaultCollectionId || DEFAULT_COLLECTION_ID
  const id = createHash('sha1').update(`${collectionId}\n${title}\n${text}`).digest('hex').slice(0, 24)
  const now = new Date().toISOString()
  const chunks = chunkText(text, settings.chunkSize, settings.chunkOverlap)
  const db = getDb()
  const fileName = input.fileName?.trim() || null
  const hasOriginal = input.hasOriginal ? 1 : 0
  const bytes = input.originalBytes ?? Buffer.byteLength(text, 'utf8')

  await removeExternalVectors(settings, id).catch((err) => logger.warn('vector cleanup', err))

  const tx = db.transaction(() => {
    db.prepare(
      'DELETE FROM knowledge_chunk_embeddings WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE document_id = ?)',
    ).run(id)
    db.prepare('DELETE FROM knowledge_chunks_fts WHERE document_id = ?').run(id)
    db.prepare('DELETE FROM knowledge_chunks WHERE document_id = ?').run(id)
    db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(id)

    db.prepare(
      `INSERT INTO knowledge_documents
        (id, collection_id, title, source, mime, bytes, status, error_message, created_at, updated_at,
         file_name, has_original, embedded)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 0)`,
    ).run(
      id,
      collectionId,
      title,
      source,
      mime,
      bytes,
      'pending',
      now,
      now,
      fileName,
      hasOriginal,
    )

    const insertChunk = db.prepare(
      `INSERT INTO knowledge_chunks (id, document_id, ordinal, text, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    const insertFts = db.prepare(
      `INSERT INTO knowledge_chunks_fts (text, title, document_id, chunk_id)
       VALUES (?, ?, ?, ?)`,
    )
    chunks.forEach((chunk, ordinal) => {
      const chunkId = `${id}_${ordinal}`
      insertChunk.run(chunkId, id, ordinal, chunk, now)
      insertFts.run(chunk, title, id, chunkId)
    })
  })
  tx()

  let embedded = 0
  try {
    const vectors = await embedTexts(chunks, settings)
    if (vectors && vectors.length === chunks.length) {
      const points: VectorPoint[] = vectors.map((vec, ordinal) => ({
        id: `${id}_${ordinal}`,
        vector: vec,
        payload: {
          documentId: id,
          chunkId: `${id}_${ordinal}`,
          collectionId,
          title,
          ordinal,
          text: chunks[ordinal]!,
        },
      }))
      await persistVectors(
        settings,
        points,
        settings.embeddingModel || settings.embeddingProvider,
        now,
      )
      embedded = 1
    }
    db.prepare(
      `UPDATE knowledge_documents
       SET status = 'ready', error_message = NULL, embedded = ?, updated_at = ?
       WHERE id = ?`,
    ).run(embedded, new Date().toISOString(), id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`ingest embed/store failed: ${msg}`)
    // Text/FTS already written — mark ready with note if only vector failed
    if (chunks.length > 0) {
      db.prepare(
        `UPDATE knowledge_documents
         SET status = 'ready', error_message = ?, embedded = 0, updated_at = ?
         WHERE id = ?`,
      ).run(`向量未完成: ${msg}`, new Date().toISOString(), id)
    } else {
      db.prepare(
        `UPDATE knowledge_documents SET status = 'error', error_message = ?, updated_at = ? WHERE id = ?`,
      ).run(msg, new Date().toISOString(), id)
    }
  }

  db.prepare(`UPDATE knowledge_collections SET updated_at = ? WHERE id = ?`).run(now, collectionId)

  return listKnowledgeDocuments(collectionId).find((d) => d.id === id)!
}

export async function ingestKnowledgeFile(
  input: KnowledgeIngestFileInput,
): Promise<KnowledgeDocument> {
  const buffer = Buffer.from(input.base64, 'base64')
  if (!buffer.length) throw new Error('empty file')
  const fileName = input.fileName.trim() || input.title.trim() || 'upload.bin'
  const extracted = await extractTextFromBuffer(buffer, fileName, input.mime)

  // Pre-compute id the same way ingestKnowledgeText will, so blob path matches.
  const settings = getKnowledgeSettings()
  const collectionId =
    input.collectionId?.trim() || settings.defaultCollectionId || DEFAULT_COLLECTION_ID
  const title = input.title.trim() || fileName
  const text = extracted.text.replace(/\r\n/g, '\n').trim()
  const id = createHash('sha1').update(`${collectionId}\n${title}\n${text}`).digest('hex').slice(0, 24)

  try {
    saveKnowledgeBlob(id, buffer)
  } catch (err) {
    logger.warn('failed to save original blob', err)
  }

  try {
    return await ingestKnowledgeText({
      title,
      text: extracted.text,
      mime: extracted.mime,
      source: input.source,
      collectionId: input.collectionId,
      fileName,
      originalBytes: buffer.length,
      hasOriginal: true,
    })
  } catch (err) {
    deleteKnowledgeBlob(id)
    throw err
  }
}

export function getKnowledgeDocumentFile(id: string): KnowledgeDocumentFile | null {
  const row = getDb()
    .prepare(
      `SELECT id, title, mime, file_name, has_original, bytes FROM knowledge_documents WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string
        title: string
        mime: string
        file_name: string | null
        has_original: number
        bytes: number
      }
    | undefined
  if (!row) return null

  const blob = readKnowledgeBlob(id)
  if (blob?.length) {
    return {
      id: row.id,
      fileName: row.file_name || row.title || 'document',
      mime: row.mime || 'application/octet-stream',
      base64: blob.toString('base64'),
      bytes: blob.length,
    }
  }

  // Fallback: reconstruct text export from chunks
  const chunks = getDb()
    .prepare(
      `SELECT text FROM knowledge_chunks WHERE document_id = ? ORDER BY ordinal ASC`,
    )
    .all(id) as Array<{ text: string }>
  if (!chunks.length) return null
  const text = chunks.map((c) => c.text).join('\n\n')
  const baseName = (row.file_name || row.title || 'document').replace(/\.[^.]+$/, '')
  return {
    id: row.id,
    fileName: `${baseName}.txt`,
    mime: 'text/plain',
    base64: Buffer.from(text, 'utf8').toString('base64'),
    bytes: Buffer.byteLength(text, 'utf8'),
  }
}

export async function deleteKnowledgeDocument(id: string): Promise<boolean> {
  const settings = getKnowledgeSettings()
  await removeExternalVectors(settings, id).catch((err) => logger.warn('vector delete', err))
  deleteKnowledgeBlob(id)
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare(
      'DELETE FROM knowledge_chunk_embeddings WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE document_id = ?)',
    ).run(id)
    db.prepare('DELETE FROM knowledge_chunks_fts WHERE document_id = ?').run(id)
    db.prepare('DELETE FROM knowledge_chunks WHERE document_id = ?').run(id)
    db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(id)
  })
  tx()
  return true
}

function hitsFromChunkIds(
  hits: Array<{ chunkId: string; score: number }>,
): KnowledgeSearchResult['hits'] {
  if (!hits.length) return []
  const db = getDb()
  const out: KnowledgeSearchResult['hits'] = []
  for (const h of hits) {
    const row = db
      .prepare(
        `SELECT c.id AS chunk_id, c.document_id, c.text, c.ordinal, d.title, d.collection_id
         FROM knowledge_chunks c
         JOIN knowledge_documents d ON d.id = c.document_id
         WHERE c.id = ?`,
      )
      .get(h.chunkId) as
      | {
          chunk_id: string
          document_id: string
          text: string
          ordinal: number
          title: string
          collection_id: string
        }
      | undefined
    if (!row) continue
    out.push({
      documentId: row.document_id,
      title: row.title,
      chunkId: row.chunk_id,
      ordinal: row.ordinal,
      text: row.text,
      score: h.score,
      collectionId: row.collection_id,
    })
  }
  return out
}

async function vectorSearch(
  settings: KnowledgeSettings,
  qVec: number[],
  limit: number,
  collectionId?: string,
): Promise<KnowledgeSearchResult['hits']> {
  if (settings.vectorStore === 'qdrant') {
    const raw = await searchQdrant(settings, qVec, limit, collectionId)
    return hitsFromChunkIds(raw)
  }
  if (settings.vectorStore === 'chroma') {
    const raw = await searchChroma(settings, qVec, limit, collectionId)
    return hitsFromChunkIds(raw)
  }

  const embRows = getDb()
    .prepare(
      `SELECT e.chunk_id, e.embedding_json, c.document_id, c.text, c.ordinal, d.title, d.collection_id
       FROM knowledge_chunk_embeddings e
       JOIN knowledge_chunks c ON c.id = e.chunk_id
       JOIN knowledge_documents d ON d.id = c.document_id
       ${collectionId ? 'WHERE d.collection_id = ?' : ''}`,
    )
    .all(...(collectionId ? [collectionId] : [])) as Array<{
    chunk_id: string
    embedding_json: string
    document_id: string
    text: string
    ordinal: number
    title: string
    collection_id: string
  }>

  return embRows
    .map((row) => {
      let vec: number[] = []
      try {
        vec = JSON.parse(row.embedding_json) as number[]
      } catch {
        return null
      }
      return {
        documentId: row.document_id,
        title: row.title,
        chunkId: row.chunk_id,
        ordinal: row.ordinal,
        text: row.text,
        score: cosine(qVec, vec),
        collectionId: row.collection_id,
      }
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export async function searchKnowledge(
  query: string,
  limit = 5,
  collectionId?: string,
): Promise<KnowledgeSearchResult> {
  const q = query.trim()
  if (!q) return { query: q, mode: 'fts', hits: [] }
  const settings = getKnowledgeSettings()
  const ftsHits = ftsSearch(q, limit * 2, collectionId)

  const wantVector = settings.embeddingProvider !== 'none'

  if (!wantVector) {
    return { query: q, mode: 'fts', hits: ftsHits.slice(0, limit) }
  }

  const [qVec] = (await embedTexts([q], settings)) ?? []
  if (!qVec) {
    return { query: q, mode: 'fts', hits: ftsHits.slice(0, limit) }
  }

  const vectorHits = await vectorSearch(settings, qVec, limit * 2, collectionId)

  if (!settings.hybridSearch) {
    return { query: q, mode: 'vector', hits: vectorHits.slice(0, limit) }
  }

  const scores = new Map<string, { hit: (typeof ftsHits)[0]; score: number }>()
  const k = 60
  ftsHits.forEach((hit, i) => {
    const prev = scores.get(hit.chunkId)
    const add = 1 / (k + i + 1)
    scores.set(hit.chunkId, { hit, score: (prev?.score ?? 0) + add })
  })
  vectorHits.forEach((hit, i) => {
    const prev = scores.get(hit.chunkId)
    const add = 1 / (k + i + 1)
    const baseHit = prev?.hit ?? {
      ...hit,
      collectionId: hit.collectionId || '',
    }
    scores.set(hit.chunkId, {
      hit: baseHit,
      score: (prev?.score ?? 0) + add,
    })
  })

  const fused = Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({ ...x.hit, score: x.score }))

  return {
    query: q,
    mode: 'hybrid',
    hits: fused,
  }
}

function ftsSearch(query: string, limit: number, collectionId?: string) {
  const safe = query.replace(/["']/g, ' ').trim()
  if (!safe) return []
  try {
    const rows = getDb()
      .prepare(
        `SELECT f.chunk_id, f.document_id, f.title, f.text, bm25(knowledge_chunks_fts) AS rank, d.collection_id,
                c.ordinal
         FROM knowledge_chunks_fts f
         JOIN knowledge_documents d ON d.id = f.document_id
         JOIN knowledge_chunks c ON c.id = f.chunk_id
         WHERE knowledge_chunks_fts MATCH ?
         ${collectionId ? 'AND d.collection_id = ?' : ''}
         ORDER BY rank
         LIMIT ?`,
      )
      .all(...(collectionId ? [safe, collectionId, limit] : [safe, limit])) as Array<{
      chunk_id: string
      document_id: string
      title: string
      text: string
      rank: number
      collection_id: string
      ordinal: number
    }>
    return rows.map((row) => ({
      documentId: row.document_id,
      title: row.title,
      chunkId: row.chunk_id,
      ordinal: row.ordinal,
      text: row.text,
      score: -row.rank,
      collectionId: row.collection_id,
    }))
  } catch {
    const like = `%${safe}%`
    const rows = getDb()
      .prepare(
        `SELECT c.id AS chunk_id, c.document_id, d.title, c.text, c.ordinal, d.collection_id
         FROM knowledge_chunks c
         JOIN knowledge_documents d ON d.id = c.document_id
         WHERE (c.text LIKE ? OR d.title LIKE ?)
         ${collectionId ? 'AND d.collection_id = ?' : ''}
         ORDER BY c.ordinal ASC
         LIMIT ?`,
      )
      .all(...(collectionId ? [like, like, collectionId, limit] : [like, like, limit])) as Array<{
      chunk_id: string
      document_id: string
      title: string
      text: string
      ordinal: number
      collection_id: string
    }>
    return rows.map((row) => ({
      documentId: row.document_id,
      title: row.title,
      chunkId: row.chunk_id,
      ordinal: row.ordinal,
      text: row.text,
      score: 1,
      collectionId: row.collection_id,
    }))
  }
}

export function knowledgeStats(): {
  collections: number
  documents: number
  chunks: number
  embeddings: number
} {
  ensureDefaultCollection()
  const db = getDb()
  const collections = (
    db.prepare('SELECT COUNT(1) AS n FROM knowledge_collections').get() as { n: number }
  ).n
  const documents = (
    db.prepare('SELECT COUNT(1) AS n FROM knowledge_documents').get() as { n: number }
  ).n
  const chunks = (db.prepare('SELECT COUNT(1) AS n FROM knowledge_chunks').get() as { n: number }).n
  const embeddings = (
    db.prepare('SELECT COUNT(1) AS n FROM knowledge_chunk_embeddings').get() as { n: number }
  ).n
  return { collections, documents, chunks, embeddings }
}
