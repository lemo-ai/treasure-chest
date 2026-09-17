/** Embedding model providers (how vectors are computed). */
export type KnowledgeEmbeddingProvider =
  | 'none'
  | 'local_hash'
  | 'openai'
  | 'ollama'
  | 'openai_compatible'

/** Where computed vectors are stored / queried. */
export type KnowledgeVectorStore = 'sqlite_json' | 'qdrant' | 'chroma' | 'pinecone' | 'weaviate'

export interface KnowledgeCollection {
  id: string
  name: string
  description: string
  color: string
  /** Parent collection id; null = root-level */
  parentId: string | null
  createdAt: string
  updatedAt: string
  documentCount: number
  /** Direct child collection count */
  childCount: number
}

export type KnowledgeDocStatus = 'ready' | 'pending' | 'error'

export interface KnowledgeDocument {
  id: string
  collectionId: string
  title: string
  source: 'upload' | 'system'
  mime: string
  bytes: number
  chunkCount: number
  /** Number of chunk embeddings stored locally (sqlite); external stores may differ */
  embeddingCount: number
  /** Whether vector upsert succeeded for this ingest */
  embedded: boolean
  /** Original upload file name when available */
  fileName?: string
  /** True if original bytes are stored for download */
  hasOriginal: boolean
  status: KnowledgeDocStatus
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocumentFile {
  id: string
  fileName: string
  mime: string
  base64: string
  bytes: number
}

export interface KnowledgeChunkHit {
  documentId: string
  title: string
  chunkId: string
  ordinal: number
  text: string
  score: number
  collectionId?: string
}

export interface KnowledgeSearchResult {
  query: string
  mode: 'fts' | 'vector' | 'hybrid'
  hits: KnowledgeChunkHit[]
}

export interface KnowledgeIngestInput {
  title: string
  text: string
  mime?: string
  source?: 'upload' | 'system'
  collectionId?: string
}

/** Binary file ingest from renderer (base64 payload). */
export interface KnowledgeIngestFileInput {
  title: string
  fileName: string
  mime?: string
  base64: string
  source?: 'upload' | 'system'
  collectionId?: string
}

export interface KnowledgeSettings {
  embeddingProvider: KnowledgeEmbeddingProvider
  vectorStore: KnowledgeVectorStore
  /** OpenAI / compatible / Ollama model id */
  embeddingModel: string
  embeddingBaseUrl: string
  embeddingApiKey: string
  embeddingDims: number
  /** Qdrant / Chroma HTTP endpoint */
  vectorStoreUrl: string
  vectorStoreApiKey: string
  /** External collection / class name */
  vectorCollection: string
  chunkSize: number
  chunkOverlap: number
  hybridSearch: boolean
  defaultCollectionId: string | null
}

export const DEFAULT_KNOWLEDGE_SETTINGS: KnowledgeSettings = {
  embeddingProvider: 'none',
  vectorStore: 'sqlite_json',
  embeddingModel: 'text-embedding-3-small',
  embeddingBaseUrl: 'https://api.openai.com/v1',
  embeddingApiKey: '',
  embeddingDims: 1536,
  vectorStoreUrl: 'http://127.0.0.1:6333',
  vectorStoreApiKey: '',
  vectorCollection: 'treasure_chest',
  chunkSize: 700,
  chunkOverlap: 80,
  hybridSearch: true,
  defaultCollectionId: null,
}

export const KNOWLEDGE_EMBEDDING_PROVIDERS: KnowledgeEmbeddingProvider[] = [
  'none',
  'local_hash',
  'openai',
  'ollama',
  'openai_compatible',
]

export const KNOWLEDGE_VECTOR_STORES: KnowledgeVectorStore[] = [
  'sqlite_json',
  'qdrant',
  'chroma',
  'pinecone',
  'weaviate',
]

export const KNOWLEDGE_ACCEPTED_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.html',
  '.htm',
  '.pdf',
  '.docx',
  '.pptx',
  '.xlsx',
  '.xls',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
] as const
