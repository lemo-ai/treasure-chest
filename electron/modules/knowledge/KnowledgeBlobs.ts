import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function blobDir(): string {
  const dir = join(app.getPath('userData'), 'knowledge-blobs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function knowledgeBlobPath(documentId: string): string {
  return join(blobDir(), documentId)
}

export function saveKnowledgeBlob(documentId: string, buffer: Buffer): void {
  writeFileSync(knowledgeBlobPath(documentId), buffer)
}

export function readKnowledgeBlob(documentId: string): Buffer | null {
  const path = knowledgeBlobPath(documentId)
  if (!existsSync(path)) return null
  return readFileSync(path)
}

export function deleteKnowledgeBlob(documentId: string): void {
  const path = knowledgeBlobPath(documentId)
  if (existsSync(path)) unlinkSync(path)
}
