/** First-class workbench artifacts (0.6.0). */

export type ArtifactKind = 'image' | 'video' | 'audio' | 'code' | 'markdown' | 'link'

export type ArtifactSource = 'turn' | 'inbox' | 'manual' | 'migrated'

export interface WorkbenchArtifact {
  id: string
  sessionId?: string
  projectId?: string
  messageId?: string
  kind: ArtifactKind
  title: string
  /** Image/video/audio URL, code body, markdown body, or href */
  content: string
  language?: string
  source: ArtifactSource
  createdAt: string
}

export interface AddArtifactInput {
  id?: string
  sessionId?: string
  projectId?: string
  messageId?: string
  kind: ArtifactKind
  title: string
  content: string
  language?: string
  source?: ArtifactSource
}

export interface ListArtifactsInput {
  sessionId?: string
  projectId?: string
  limit?: number
}
