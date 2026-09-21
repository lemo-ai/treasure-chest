/** Session / project artifacts via main process (0.6.0). */

import type { ArtifactKind, WorkbenchArtifact } from '@shared'

export type { ArtifactKind, WorkbenchArtifact }

const LEGACY_KEY = 'qiankun.workbench.artifacts.v1'
const MIGRATED_FLAG = 'qiankun.workbench.artifacts.migrated.v2'

let cache: WorkbenchArtifact[] = []
let ready = false

async function migrateLegacyIfNeeded(): Promise<void> {
  if (localStorage.getItem(MIGRATED_FLAG) === '1') return
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as WorkbenchArtifact[]
      const items = Array.isArray(parsed) ? parsed : []
      if (items.length) {
        await window.treasureChest.artifactsMigrateLocal(
          items.map((a) => ({
            id: a.id,
            sessionId: a.sessionId || '',
            messageId: a.messageId,
            kind: a.kind,
            title: a.title,
            content: a.content,
            language: a.language,
            createdAt: a.createdAt,
          })).filter((a) => a.sessionId),
        )
      }
      localStorage.removeItem(LEGACY_KEY)
    }
  } catch {
    /* ignore */
  }
  localStorage.setItem(MIGRATED_FLAG, '1')
}

export async function hydrateArtifacts(input?: {
  sessionId?: string
  projectId?: string
}): Promise<WorkbenchArtifact[]> {
  await migrateLegacyIfNeeded()
  cache = await window.treasureChest.artifactsList(input)
  ready = true
  return cache
}

export function listArtifacts(sessionId?: string, projectId?: string): WorkbenchArtifact[] {
  if (!ready) return []
  let list = cache
  if (sessionId && projectId) {
    list = cache.filter((a) => a.sessionId === sessionId || a.projectId === projectId)
  } else if (sessionId) {
    list = cache.filter((a) => a.sessionId === sessionId)
  } else if (projectId) {
    list = cache.filter((a) => a.projectId === projectId)
  }
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getArtifact(id: string): WorkbenchArtifact | undefined {
  return cache.find((a) => a.id === id)
}

export async function deleteArtifact(id: string): Promise<void> {
  await window.treasureChest.artifactsRemove(id)
  cache = cache.filter((a) => a.id !== id)
}

export async function clearSessionArtifacts(sessionId: string): Promise<void> {
  await window.treasureChest.artifactsClearSession(sessionId)
  cache = cache.filter((a) => a.sessionId !== sessionId)
}

export async function addArtifact(
  input: Omit<WorkbenchArtifact, 'id' | 'createdAt' | 'source'> & {
    id?: string
    source?: WorkbenchArtifact['source']
  },
): Promise<WorkbenchArtifact> {
  const art = await window.treasureChest.artifactsAdd({
    id: input.id,
    sessionId: input.sessionId,
    projectId: input.projectId,
    messageId: input.messageId,
    kind: input.kind,
    title: input.title,
    content: input.content,
    language: input.language,
    source: input.source || 'turn',
  })
  const exists = cache.some((a) => a.id === art.id)
  cache = exists ? cache.map((a) => (a.id === art.id ? art : a)) : [art, ...cache]
  return art
}

/** Parse assistant markdown into pin-worthy artifacts (async persist). */
export async function extractArtifactsFromContent(
  sessionId: string,
  content: string,
  messageId?: string,
  projectId?: string,
): Promise<WorkbenchArtifact[]> {
  const created: WorkbenchArtifact[] = []
  const text = content || ''

  const imageRe = /!\[([^\]]*)\]\(([^)\s]+)\)/g
  for (const m of text.matchAll(imageRe)) {
    const title = (m[1] || 'Image').trim() || 'Image'
    const url = m[2]!.trim()
    created.push(
      await addArtifact({
        sessionId,
        projectId,
        messageId,
        kind: 'image',
        title,
        content: url,
      }),
    )
  }

  const videoRe = /\[([^\]]*video[^\]]*)\]\(([^)\s]+)\)/gi
  for (const m of text.matchAll(videoRe)) {
    created.push(
      await addArtifact({
        sessionId,
        projectId,
        messageId,
        kind: 'video',
        title: (m[1] || 'Video').trim(),
        content: m[2]!.trim(),
      }),
    )
  }

  if (/<audio\b/i.test(text)) {
    const src = text.match(/src=["']([^"']+)["']/i)?.[1]
    if (src) {
      created.push(
        await addArtifact({
          sessionId,
          projectId,
          messageId,
          kind: 'audio',
          title: 'Audio',
          content: src,
        }),
      )
    }
  }

  const codeRe = /```([\w+-]*)\n([\s\S]*?)```/g
  for (const m of text.matchAll(codeRe)) {
    const language = (m[1] || '').trim() || 'text'
    const body = (m[2] || '').trim()
    if (body.length < 40) continue
    const firstLine = body.split('\n')[0]?.slice(0, 40) || language
    created.push(
      await addArtifact({
        sessionId,
        projectId,
        messageId,
        kind: 'code',
        title: `${language}: ${firstLine}`,
        content: body,
        language,
      }),
    )
  }

  const stripped = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .trim()
  if (stripped.length >= 600 && created.length === 0) {
    created.push(
      await addArtifact({
        sessionId,
        projectId,
        messageId,
        kind: 'markdown',
        title: stripped.split('\n').find((l) => l.trim())?.slice(0, 48) || 'Document',
        content: stripped.slice(0, 12_000),
      }),
    )
  }

  return created
}
