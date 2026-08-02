/** Session artifacts (Codex-style) extracted from assistant replies. */

export type ArtifactKind = 'image' | 'video' | 'audio' | 'code' | 'markdown' | 'link'

export interface WorkbenchArtifact {
  id: string
  sessionId: string
  messageId?: string
  kind: ArtifactKind
  title: string
  /** Image/video/audio URL, code body, markdown body, or href */
  content: string
  language?: string
  createdAt: string
}

const STORAGE_KEY = 'qiankun.workbench.artifacts.v1'

function uid(): string {
  return `art_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function readAll(): WorkbenchArtifact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as WorkbenchArtifact[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(list: WorkbenchArtifact[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 400)))
}

export function listArtifacts(sessionId?: string): WorkbenchArtifact[] {
  const all = readAll()
  const list = sessionId ? all.filter((a) => a.sessionId === sessionId) : all
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getArtifact(id: string): WorkbenchArtifact | undefined {
  return readAll().find((a) => a.id === id)
}

export function deleteArtifact(id: string): void {
  writeAll(readAll().filter((a) => a.id !== id))
}

export function clearSessionArtifacts(sessionId: string): void {
  writeAll(readAll().filter((a) => a.sessionId !== sessionId))
}

export function addArtifact(
  input: Omit<WorkbenchArtifact, 'id' | 'createdAt'> & { id?: string },
): WorkbenchArtifact {
  const art: WorkbenchArtifact = {
    id: input.id || uid(),
    sessionId: input.sessionId,
    messageId: input.messageId,
    kind: input.kind,
    title: input.title.slice(0, 80) || input.kind,
    content: input.content,
    language: input.language,
    createdAt: new Date().toISOString(),
  }
  const all = readAll()
  // Dedupe same session + content
  const exists = all.some(
    (a) => a.sessionId === art.sessionId && a.kind === art.kind && a.content === art.content,
  )
  if (exists) return art
  all.unshift(art)
  writeAll(all)
  return art
}

/** Parse assistant markdown into pin-worthy artifacts. */
export function extractArtifactsFromContent(
  sessionId: string,
  content: string,
  messageId?: string,
): WorkbenchArtifact[] {
  const created: WorkbenchArtifact[] = []
  const text = content || ''

  const imageRe = /!\[([^\]]*)\]\(([^)\s]+)\)/g
  for (const m of text.matchAll(imageRe)) {
    const title = (m[1] || 'Image').trim() || 'Image'
    const url = m[2]!.trim()
    created.push(
      addArtifact({
        sessionId,
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
      addArtifact({
        sessionId,
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
        addArtifact({
          sessionId,
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
      addArtifact({
        sessionId,
        messageId,
        kind: 'code',
        title: `${language}: ${firstLine}`,
        content: body,
        language,
      }),
    )
  }

  // Long structured replies (research / write) without media → one markdown pin
  const stripped = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .trim()
  if (stripped.length >= 600 && created.length === 0) {
    created.push(
      addArtifact({
        sessionId,
        messageId,
        kind: 'markdown',
        title: stripped.split('\n').find((l) => l.trim())?.slice(0, 48) || 'Document',
        content: stripped.slice(0, 12_000),
      }),
    )
  }

  return created
}
