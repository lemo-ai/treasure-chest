import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  KnowledgeCollection,
  KnowledgeDocument,
  KnowledgeEmbeddingProvider,
  KnowledgeSettings,
  KnowledgeVectorStore,
} from '@shared'
import {
  KNOWLEDGE_ACCEPTED_EXTENSIONS,
  KNOWLEDGE_EMBEDDING_PROVIDERS,
  KNOWLEDGE_VECTOR_STORES,
} from '@shared'
import {
  IconBook,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconDownload,
  IconLayers,
  IconPlus,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconTrash,
  IconUpload,
  IconWrite,
} from '@renderer/shared/ui/icons'
import styles from './KnowledgePage.module.css'

type Tab = 'documents' | 'search' | 'settings'

type CollectionTreeRow = KnowledgeCollection & {
  depth: number
  hasChildren: boolean
}

const COLLECTION_COLORS = ['#0fbea8', '#4c8dff', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
const MAX_COLLECTION_DEPTH = 5

function collectDescendantIds(rootId: string, list: KnowledgeCollection[]): string[] {
  const byParent = new Map<string | null, KnowledgeCollection[]>()
  for (const c of list) {
    const p = c.parentId ?? null
    const arr = byParent.get(p) ?? []
    arr.push(c)
    byParent.set(p, arr)
  }
  const out: string[] = []
  const walk = (id: string): void => {
    for (const child of byParent.get(id) ?? []) {
      out.push(child.id)
      walk(child.id)
    }
  }
  walk(rootId)
  return out
}

/** Own docs + all descendant collections' docs. */
function subtreeDocumentCount(rootId: string, list: KnowledgeCollection[]): number {
  const byId = new Map(list.map((c) => [c.id, c.documentCount ?? 0]))
  let total = byId.get(rootId) ?? 0
  for (const id of collectDescendantIds(rootId, list)) {
    total += byId.get(id) ?? 0
  }
  return total
}

function collectionDepth(id: string, list: KnowledgeCollection[]): number {
  const byId = new Map(list.map((c) => [c.id, c]))
  let depth = 0
  let cur = byId.get(id)
  const seen = new Set<string>()
  while (cur?.parentId) {
    if (seen.has(cur.id)) break
    seen.add(cur.id)
    depth += 1
    cur = byId.get(cur.parentId)
  }
  return depth
}

function buildCollectionTree(
  list: KnowledgeCollection[],
  expanded: Set<string>,
): CollectionTreeRow[] {
  const byParent = new Map<string | null, KnowledgeCollection[]>()
  for (const c of list) {
    const p = c.parentId ?? null
    const arr = byParent.get(p) ?? []
    arr.push(c)
    byParent.set(p, arr)
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => {
      if (a.id === 'default') return -1
      if (b.id === 'default') return 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  }
  const out: CollectionTreeRow[] = []
  const walk = (parentId: string | null, depth: number): void => {
    for (const node of byParent.get(parentId) ?? []) {
      const kids = byParent.get(node.id) ?? []
      const hasChildren = kids.length > 0
      out.push({ ...node, depth, hasChildren })
      if (hasChildren && expanded.has(node.id)) walk(node.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

function ancestorIds(id: string, list: KnowledgeCollection[]): string[] {
  const byId = new Map(list.map((c) => [c.id, c]))
  const out: string[] = []
  let cur = byId.get(id)
  const seen = new Set<string>()
  while (cur?.parentId) {
    if (seen.has(cur.id)) break
    seen.add(cur.id)
    out.push(cur.parentId)
    cur = byId.get(cur.parentId)
  }
  return out
}

const ACCEPT =
  KNOWLEDGE_ACCEPTED_EXTENSIONS.join(',') +
  ',application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/html,text/plain,text/markdown,text/csv,application/json'

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function KnowledgePage(): React.JSX.Element {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('documents')
  const [collections, setCollections] = useState<KnowledgeCollection[]>([])
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null)
  const [docs, setDocs] = useState<KnowledgeDocument[]>([])
  const [settings, setSettings] = useState<KnowledgeSettings | null>(null)
  const [draft, setDraft] = useState<KnowledgeSettings | null>(null)
  const [stats, setStats] = useState({ collections: 0, documents: 0, chunks: 0, embeddings: 0 })
  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState<'fts' | 'vector' | 'hybrid' | null>(null)
  const [hits, setHits] = useState<
    Array<{ title: string; text: string; score: number; ordinal: number }>
  >([])
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null)
  const [editingCollectionName, setEditingCollectionName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeCollection | null>(null)
  const [expandedCollectionIds, setExpandedCollectionIds] = useState<Set<string>>(() => new Set())
  const [createParentId, setCreateParentId] = useState<string | null>(null)
  const [childDraftName, setChildDraftName] = useState('')
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [progress, setProgress] = useState('')

  const refreshCollections = async (): Promise<KnowledgeCollection[]> => {
    const list = await window.treasureChest.listKnowledgeCollections()
    setCollections(list)
    setExpandedCollectionIds((prev) => {
      const next = new Set(prev)
      // Keep parents of active path expanded; seed all parents on first load
      if (prev.size === 0) {
        for (const c of list) {
          if ((c.childCount ?? 0) > 0) next.add(c.id)
        }
      }
      return next
    })
    return list
  }

  const refreshDocs = async (collectionId: string | null): Promise<void> => {
    const list = await window.treasureChest.listKnowledgeDocuments(collectionId || undefined)
    setDocs(list)
  }

  const refreshAll = async (preferredCollectionId?: string | null): Promise<void> => {
    const [list, kbSettings, kbStats] = await Promise.all([
      refreshCollections(),
      window.treasureChest.getKnowledgeSettings(),
      window.treasureChest.getKnowledgeStats(),
    ])
    setSettings(kbSettings)
    setDraft(kbSettings)
    setStats(kbStats)
    const nextId =
      preferredCollectionId && list.some((c) => c.id === preferredCollectionId)
        ? preferredCollectionId
        : activeCollectionId && list.some((c) => c.id === activeCollectionId)
          ? activeCollectionId
          : list[0]?.id ?? null
    setActiveCollectionId(nextId)
    await refreshDocs(nextId)
  }

  useEffect(() => {
    void refreshAll().catch((err) => {
      setError(err instanceof Error ? err.message : String(err))
    })
  }, [])

  useEffect(() => {
    if (!activeCollectionId) return
    void refreshDocs(activeCollectionId)
    setExpandedCollectionIds((prev) => {
      const next = new Set(prev)
      for (const id of ancestorIds(activeCollectionId, collections)) next.add(id)
      return next
    })
  }, [activeCollectionId])

  const treeRows = buildCollectionTree(collections, expandedCollectionIds)

  const deleteImpact = (() => {
    if (!deleteTarget) return { docs: 0, children: 0, subtreeDocs: 0 }
    const descendants = collectDescendantIds(deleteTarget.id, collections)
    const directChildren = descendants.filter((id) => {
      const c = collections.find((x) => x.id === id)
      return c?.parentId === deleteTarget.id
    }).length
    const subtreeIds = new Set([deleteTarget.id, ...descendants])
    const subtreeDocs = collections
      .filter((c) => subtreeIds.has(c.id))
      .reduce((sum, c) => sum + (c.documentCount ?? 0), 0)
    return {
      docs: deleteTarget.documentCount ?? 0,
      children: deleteTarget.childCount ?? directChildren,
      subtreeDocs,
    }
  })()

  const ingestFiles = async (files: FileList | File[] | null): Promise<void> => {
    if (!files || (Array.isArray(files) ? files.length === 0 : files.length === 0)) return
    setBusy(true)
    setError('')
    try {
      const list = Array.from(files as FileList | File[])
      for (let i = 0; i < list.length; i++) {
        const file = list[i]!
        setProgress(
          t('knowledge.progressIngest', {
            current: i + 1,
            total: list.length,
            name: file.name,
          }),
        )
        const base64 = await fileToBase64(file)
        await window.treasureChest.ingestKnowledgeFile({
          title: file.name,
          fileName: file.name,
          mime: file.type || undefined,
          base64,
          source: 'upload',
          collectionId: activeCollectionId || undefined,
        })
      }
      await refreshAll(activeCollectionId)
      setTab('documents')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      setProgress('')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onPasteIngest = async (): Promise<void> => {
    const text = pasteText.trim()
    if (!text) return
    setBusy(true)
    setError('')
    try {
      await window.treasureChest.ingestKnowledgeText({
        title: pasteTitle.trim() || t('knowledge.untitledPaste'),
        text,
        mime: 'text/plain',
        source: 'upload',
        collectionId: activeCollectionId || undefined,
      })
      setPasteTitle('')
      setPasteText('')
      setShowPaste(false)
      await refreshAll(activeCollectionId)
      setTab('documents')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const onDeleteDoc = async (id: string): Promise<void> => {
    await window.treasureChest.deleteKnowledgeDocument(id)
    await refreshAll(activeCollectionId)
  }

  const onDownloadDoc = async (id: string): Promise<void> => {
    setError('')
    try {
      const file = await window.treasureChest.getKnowledgeDocumentFile(id)
      if (!file) {
        setError(t('knowledge.downloadMissing'))
        return
      }
      const binary = atob(file.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: file.mime || 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.fileName || 'document'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const createCollection = async (
    nameRaw: string,
    parentId: string | null,
  ): Promise<void> => {
    const name = nameRaw.trim()
    if (!name) return
    if (parentId && collectionDepth(parentId, collections) >= MAX_COLLECTION_DEPTH - 1) {
      setError(t('knowledge.collectionDepthLimit', { max: MAX_COLLECTION_DEPTH }))
      return
    }
    const color = COLLECTION_COLORS[collections.length % COLLECTION_COLORS.length]
    const created = await window.treasureChest.createKnowledgeCollection({
      name,
      color,
      parentId,
    })
    setNewCollectionName('')
    setChildDraftName('')
    setCreateParentId(null)
    if (parentId) {
      setExpandedCollectionIds((prev) => new Set(prev).add(parentId))
    }
    await refreshAll(created.id)
  }

  const onCreateRootCollection = async (): Promise<void> => {
    await createCollection(newCollectionName, null)
  }

  const onCreateChildCollection = async (): Promise<void> => {
    if (!createParentId) return
    await createCollection(childDraftName, createParentId)
  }

  const startCreateChild = (parent: KnowledgeCollection): void => {
    if (collectionDepth(parent.id, collections) >= MAX_COLLECTION_DEPTH - 1) {
      setError(t('knowledge.collectionDepthLimit', { max: MAX_COLLECTION_DEPTH }))
      return
    }
    setEditingCollectionId(null)
    setCreateParentId(parent.id)
    setChildDraftName('')
    setExpandedCollectionIds((prev) => new Set(prev).add(parent.id))
  }

  const cancelCreateChild = (): void => {
    setCreateParentId(null)
    setChildDraftName('')
  }

  const toggleExpanded = (id: string): void => {
    setExpandedCollectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startRenameCollection = (col: KnowledgeCollection): void => {
    setCreateParentId(null)
    setChildDraftName('')
    setEditingCollectionId(col.id)
    setEditingCollectionName(col.name)
  }

  const commitRenameCollection = async (): Promise<void> => {
    const id = editingCollectionId
    const name = editingCollectionName.trim()
    if (!id) return
    if (!name) {
      setEditingCollectionId(null)
      return
    }
    const current = collections.find((c) => c.id === id)
    if (current && current.name === name) {
      setEditingCollectionId(null)
      return
    }
    try {
      await window.treasureChest.renameKnowledgeCollection({ id, name })
      setEditingCollectionId(null)
      await refreshCollections()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const onDeleteCollection = async (mode: 'cascade' | 'move'): Promise<void> => {
    if (!deleteTarget || deleteTarget.id === 'default') return
    const id = deleteTarget.id
    setDeleteTarget(null)
    try {
      await window.treasureChest.deleteKnowledgeCollection(id, { mode })
      await refreshAll(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const onSearch = async (): Promise<void> => {
    const q = query.trim()
    if (!q) {
      setHits([])
      setSearchMode(null)
      return
    }
    setBusy(true)
    try {
      const res = await window.treasureChest.searchKnowledge({
        query: q,
        limit: 10,
        collectionId: activeCollectionId || undefined,
      })
      setSearchMode(res.mode)
      setHits(
        res.hits.map((h) => ({
          title: h.title,
          text: h.text,
          score: h.score,
          ordinal: h.ordinal,
        })),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const onSaveSettings = async (): Promise<void> => {
    if (!draft) return
    setSaving(true)
    setError('')
    try {
      const next = await window.treasureChest.setKnowledgeSettings(draft)
      setSettings(next)
      setDraft(next)
      setSavedFlash(true)
      window.setTimeout(() => setSavedFlash(false), 1800)
      const kbStats = await window.treasureChest.getKnowledgeStats()
      setStats(kbStats)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const activeCollection = collections.find((c) => c.id === activeCollectionId) ?? null
  const needsEmbedRemote =
    draft?.embeddingProvider === 'openai' ||
    draft?.embeddingProvider === 'ollama' ||
    draft?.embeddingProvider === 'openai_compatible'
  const needsEmbedModel = Boolean(draft?.embeddingProvider && draft.embeddingProvider !== 'none')
  const needsExternalStore =
    draft?.vectorStore === 'qdrant' ||
    draft?.vectorStore === 'chroma' ||
    draft?.vectorStore === 'pinecone' ||
    draft?.vectorStore === 'weaviate'

  const formatBytes = (n: number): string => {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (iso: string): string => {
    try {
      return new Date(iso).toLocaleString()
    } catch {
      return iso
    }
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <div className={styles.sideHead}>
          <div className={styles.mark}>
            <IconBook />
          </div>
          <div>
            <h1 className={styles.sideTitle}>{t('knowledge.title')}</h1>
            <p className={styles.sideHint}>{t('knowledge.sideHint')}</p>
          </div>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.stat}>
            <strong>{stats.documents}</strong>
            <span>{t('knowledge.statDocs')}</span>
          </div>
          <div className={styles.stat}>
            <strong>{stats.chunks}</strong>
            <span>{t('knowledge.statChunks')}</span>
          </div>
          <div className={styles.stat}>
            <strong>{stats.embeddings}</strong>
            <span>{t('knowledge.statVectors')}</span>
          </div>
        </div>

        <div className={styles.collectionHead}>
          <span>{t('knowledge.collections')}</span>
          <IconLayers />
        </div>
        <ul className={styles.collectionList}>
          {treeRows.map((col) => {
            const isActive = col.id === activeCollectionId
            const isEditing = editingCollectionId === col.id
            const expanded = expandedCollectionIds.has(col.id)
            const canAddChild = col.depth < MAX_COLLECTION_DEPTH - 1
            const showChildDraft = createParentId === col.id
            const totalDocs = subtreeDocumentCount(col.id, collections)
            return (
              <li key={col.id} className={styles.collectionLi}>
                <div
                  className={`${styles.collectionItem} ${isActive ? styles.collectionActive : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!isEditing) setActiveCollectionId(col.id)
                  }}
                  onKeyDown={(e) => {
                    if (isEditing) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setActiveCollectionId(col.id)
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault()
                    startRenameCollection(col)
                  }}
                >
                  <span className={styles.treeGuides} aria-hidden>
                    {Array.from({ length: col.depth }, (_, i) => (
                      <span key={i} className={styles.treeGuide} />
                    ))}
                  </span>
                  <button
                    type="button"
                    className={`${styles.collectionTwist} ${
                      col.hasChildren ? '' : styles.collectionTwistEmpty
                    }`}
                    aria-hidden={!col.hasChildren}
                    tabIndex={col.hasChildren ? 0 : -1}
                    aria-label={
                      col.hasChildren
                        ? expanded
                          ? t('knowledge.collapseCollection')
                          : t('knowledge.expandCollection')
                        : undefined
                    }
                    onClick={(e) => {
                      e.stopPropagation()
                      if (col.hasChildren) toggleExpanded(col.id)
                    }}
                  >
                    {col.hasChildren ? (
                      expanded ? (
                        <IconChevronDown />
                      ) : (
                        <IconChevronRight />
                      )
                    ) : null}
                  </button>
                  <span
                    className={styles.collectionSwatch}
                    style={{ background: col.color }}
                    aria-hidden
                  />
                  <span className={styles.collectionMeta}>
                    {isEditing ? (
                      <input
                        className={styles.collectionInlineInput}
                        value={editingCollectionName}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setEditingCollectionName(e.target.value)}
                        onBlur={() => void commitRenameCollection()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void commitRenameCollection()
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault()
                            setEditingCollectionId(null)
                          }
                        }}
                      />
                    ) : (
                      <strong title={t('knowledge.renameCollectionHint')}>{col.name}</strong>
                    )}
                    <span
                      className={styles.collectionCount}
                      title={t('knowledge.docCount', { count: totalDocs })}
                    >
                      {totalDocs}
                    </span>
                  </span>
                  <span className={styles.collectionActions}>
                    {canAddChild ? (
                      <button
                        type="button"
                        className={`${styles.collectionActionBtn} ${styles.hasTip}`}
                        data-tip={t('knowledge.addChildCollection')}
                        aria-label={t('knowledge.addChildCollection')}
                        onClick={(e) => {
                          e.stopPropagation()
                          startCreateChild(col)
                        }}
                      >
                        <IconPlus />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`${styles.collectionActionBtn} ${styles.hasTip}`}
                      data-tip={t('knowledge.renameCollection')}
                      aria-label={t('knowledge.renameCollection')}
                      onClick={(e) => {
                        e.stopPropagation()
                        startRenameCollection(col)
                      }}
                    >
                      <IconWrite />
                    </button>
                    {col.id !== 'default' ? (
                      <button
                        type="button"
                        className={`${styles.collectionActionBtn} ${styles.collectionDelete} ${styles.hasTip}`}
                        data-tip={t('knowledge.deleteCollection')}
                        aria-label={t('knowledge.deleteCollection')}
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteTarget(col)
                        }}
                      >
                        <IconTrash />
                      </button>
                    ) : null}
                  </span>
                </div>
                {showChildDraft ? (
                  <div
                    className={styles.childDraft}
                    style={{ paddingLeft: `${1.15 + (col.depth + 1) * 0.9}rem` }}
                  >
                    <span className={styles.collectionSwatch} style={{ opacity: 0.45 }} aria-hidden />
                    <input
                      className={styles.collectionInlineInput}
                      value={childDraftName}
                      autoFocus
                      placeholder={t('knowledge.newChildCollectionPlaceholder')}
                      onChange={(e) => setChildDraftName(e.target.value)}
                      onBlur={() => {
                        if (childDraftName.trim()) void onCreateChildCollection()
                        else cancelCreateChild()
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void onCreateChildCollection()
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          cancelCreateChild()
                        }
                      }}
                    />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>

        <div className={styles.newCollection}>
          <input
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            placeholder={t('knowledge.newCollectionPlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onCreateRootCollection()
            }}
          />
          <button
            type="button"
            onClick={() => void onCreateRootCollection()}
            disabled={!newCollectionName.trim()}
            aria-label={t('knowledge.newCollectionPlaceholder')}
          >
            <IconPlus />
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.toolbar}>
          <div className={styles.tabs}>
            {(
              [
                ['documents', 'knowledge.tabDocuments'],
                ['search', 'knowledge.tabSearch'],
                ['settings', 'knowledge.tabSettings'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`}
                onClick={() => setTab(id)}
              >
                {id === 'settings' ? <IconSettings /> : null}
                {id === 'search' ? <IconSearch /> : null}
                {id === 'documents' ? <IconUpload /> : null}
                {t(label)}
              </button>
            ))}
          </div>
          <div className={styles.toolbarActions}>
            <button
              type="button"
              className={styles.ghostBtn}
              disabled={busy}
              onClick={() => setShowPaste((v) => !v)}
            >
              {t('knowledge.pasteText')}
            </button>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={busy || !activeCollectionId}
              onClick={() => fileRef.current?.click()}
            >
              <IconPlus />
              {t('knowledge.upload')}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept={ACCEPT}
              onChange={(e) => void ingestFiles(e.target.files)}
            />
          </div>
        </header>

        {error ? <p className={styles.error}>{error}</p> : null}
        {progress ? <p className={styles.progress}>{progress}</p> : null}

        {showPaste ? (
          <section className={styles.pastePanel}>
            <input
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              placeholder={t('knowledge.pasteTitlePlaceholder')}
            />
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={t('knowledge.pasteBodyPlaceholder')}
              rows={6}
            />
            <div className={styles.pasteActions}>
              <button type="button" className={styles.ghostBtn} onClick={() => setShowPaste(false)}>
                {t('knowledge.cancel')}
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={busy || !pasteText.trim()}
                onClick={() => void onPasteIngest()}
              >
                {t('knowledge.ingest')}
              </button>
            </div>
          </section>
        ) : null}

        {tab === 'documents' ? (
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2>{activeCollection?.name ?? t('knowledge.documents')}</h2>
                <p>{t('knowledge.documentsHint')}</p>
              </div>
            </div>

            <div
              className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ''}`}
              onDragEnter={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                void ingestFiles(e.dataTransfer.files)
              }}
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  fileRef.current?.click()
                }
              }}
            >
              <IconUpload />
              <strong>{t('knowledge.dropTitle')}</strong>
              <span>{t('knowledge.dropHint')}</span>
            </div>

            {docs.length === 0 ? (
              <p className={styles.empty}>{t('knowledge.empty')}</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t('knowledge.colTitle')}</th>
                      <th>{t('knowledge.colStatus')}</th>
                      <th>{t('knowledge.colChunks')}</th>
                      <th>{t('knowledge.colSize')}</th>
                      <th>{t('knowledge.colUpdated')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((doc) => (
                      <tr key={doc.id}>
                        <td>
                          <div className={styles.docTitle}>
                            <strong>{doc.title}</strong>
                            <span>{doc.mime || 'text/plain'}</span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.statusCell}>
                            <span
                              className={`${styles.badge} ${
                                doc.status === 'ready'
                                  ? styles.badgeReady
                                  : doc.status === 'pending'
                                    ? styles.badgePending
                                    : styles.badgeError
                              }`}
                              title={doc.errorMessage}
                            >
                              {t(`knowledge.status.${doc.status}`)}
                            </span>
                            {doc.status === 'ready' ? (
                              <span className={styles.indexHint}>
                                {doc.embedded
                                  ? t('knowledge.indexEmbedded', { count: doc.embeddingCount || doc.chunkCount })
                                  : t('knowledge.indexFtsOnly', { count: doc.chunkCount })}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>{doc.chunkCount}</td>
                        <td>{formatBytes(doc.bytes)}</td>
                        <td>{formatDate(doc.updatedAt)}</td>
                        <td>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className={`${styles.iconBtn} ${styles.hasTip}`}
                              data-tip={t('knowledge.reembedTip')}
                              aria-label={t('knowledge.reembedTip')}
                              onClick={() => {
                                void (async () => {
                                  setBusy(true)
                                  setError('')
                                  try {
                                    await window.treasureChest.reembedKnowledgeDocument(doc.id)
                                    await refreshAll(activeCollectionId)
                                  } catch (err) {
                                    setError(err instanceof Error ? err.message : String(err))
                                  } finally {
                                    setBusy(false)
                                  }
                                })()
                              }}
                            >
                              <IconSparkles />
                            </button>
                            <button
                              type="button"
                              className={`${styles.iconBtn} ${styles.hasTip}`}
                              data-tip={t('knowledge.download')}
                              aria-label={t('knowledge.download')}
                              disabled={!doc.hasOriginal}
                              onClick={() => void onDownloadDoc(doc.id)}
                            >
                              <IconDownload />
                            </button>
                            <button
                              type="button"
                              className={`${styles.iconBtn} ${styles.iconBtnDanger} ${styles.hasTip}`}
                              data-tip={t('knowledge.deleteTip')}
                              aria-label={t('knowledge.deleteTip')}
                              onClick={() => void onDeleteDoc(doc.id)}
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {tab === 'search' ? (
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2>{t('knowledge.searchTitle')}</h2>
                <p>{t('knowledge.searchHint')}</p>
              </div>
              {searchMode ? (
                <span className={styles.modeBadge}>{t(`knowledge.mode.${searchMode}`)}</span>
              ) : null}
            </div>
            <div className={styles.searchRow}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('knowledge.searchPlaceholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onSearch()
                }}
              />
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={busy || !query.trim()}
                onClick={() => void onSearch()}
              >
                <IconSearch />
                {t('knowledge.search')}
              </button>
            </div>
            {hits.length === 0 ? (
              <p className={styles.empty}>{t('knowledge.searchEmpty')}</p>
            ) : (
              <div className={styles.hits}>
                {hits.map((hit, i) => (
                  <article key={`${hit.title}-${hit.ordinal}-${i}`} className={styles.hit}>
                    <header>
                      <strong>{hit.title}</strong>
                      <span>
                        #{hit.ordinal + 1} · {hit.score.toFixed(3)}
                      </span>
                    </header>
                    <p>{hit.text}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {tab === 'settings' && draft ? (
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2>{t('knowledge.settingsTitle')}</h2>
                <p>{t('knowledge.settingsHint')}</p>
              </div>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={saving}
                onClick={() => void onSaveSettings()}
              >
                {savedFlash ? <IconCheck /> : null}
                {savedFlash ? t('knowledge.saved') : t('knowledge.saveSettings')}
              </button>
            </div>

            <div className={styles.reembedBar}>
              <button
                type="button"
                className={styles.ghostBtn}
                disabled={busy || saving}
                onClick={() => {
                  void (async () => {
                    setBusy(true)
                    setError('')
                    try {
                      const res = await window.treasureChest.reembedKnowledgeCollection(
                        activeCollectionId || undefined,
                      )
                      await refreshAll(activeCollectionId)
                      if (res.failed) {
                        setError(
                          t('knowledge.reembedPartial', {
                            ok: res.ok,
                            failed: res.failed,
                            detail: res.errors.slice(0, 2).join('; '),
                          }),
                        )
                      }
                    } catch (err) {
                      setError(err instanceof Error ? err.message : String(err))
                    } finally {
                      setBusy(false)
                    }
                  })()
                }}
              >
                {t('knowledge.reembedCollection')}
              </button>
              <em>{t('knowledge.reembedHint')}</em>
            </div>

            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>{t('knowledge.embeddingProvider')}</span>
                <select
                  value={draft.embeddingProvider}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      embeddingProvider: e.target.value as KnowledgeEmbeddingProvider,
                    })
                  }
                >
                  {KNOWLEDGE_EMBEDDING_PROVIDERS.map((b) => (
                    <option key={b} value={b}>
                      {t(`knowledge.embed.${b}`)}
                    </option>
                  ))}
                </select>
                <em>{t(`knowledge.embedHint.${draft.embeddingProvider}`)}</em>
              </label>

              <label className={styles.field}>
                <span>{t('knowledge.vectorStore')}</span>
                <select
                  value={draft.vectorStore}
                  onChange={(e) => {
                    const vectorStore = e.target.value as KnowledgeVectorStore
                    setDraft({
                      ...draft,
                      vectorStore,
                      // Selecting a store implies user wants vectors; don't leave embed on "none".
                      embeddingProvider:
                        draft.embeddingProvider === 'none' && vectorStore
                          ? 'local_hash'
                          : draft.embeddingProvider,
                    })
                  }}
                >
                  {KNOWLEDGE_VECTOR_STORES.map((b) => (
                    <option key={b} value={b}>
                      {t(`knowledge.store.${b}`)}
                    </option>
                  ))}
                </select>
                <em>
                  {draft.embeddingProvider === 'none'
                    ? t('knowledge.storeNeedEmbed')
                    : t(`knowledge.storeHint.${draft.vectorStore}`)}
                </em>
              </label>

              {needsEmbedModel ? (
                <>
                  <label className={styles.field}>
                    <span>{t('knowledge.embeddingModel')}</span>
                    <input
                      value={draft.embeddingModel}
                      onChange={(e) => setDraft({ ...draft, embeddingModel: e.target.value })}
                      placeholder={
                        draft.embeddingProvider === 'ollama'
                          ? 'nomic-embed-text'
                          : 'text-embedding-3-small'
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span>{t('knowledge.embeddingDims')}</span>
                    <input
                      type="number"
                      min={32}
                      max={4096}
                      value={draft.embeddingDims}
                      onChange={(e) =>
                        setDraft({ ...draft, embeddingDims: Number(e.target.value) || 1536 })
                      }
                    />
                  </label>
                </>
              ) : null}

              {needsEmbedRemote ? (
                <>
                  <label className={styles.field}>
                    <span>{t('knowledge.embeddingBaseUrl')}</span>
                    <input
                      value={draft.embeddingBaseUrl}
                      onChange={(e) => setDraft({ ...draft, embeddingBaseUrl: e.target.value })}
                      placeholder={
                        draft.embeddingProvider === 'ollama'
                          ? 'http://127.0.0.1:11434'
                          : 'https://api.openai.com/v1'
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span>{t('knowledge.embeddingApiKey')}</span>
                    <input
                      type="password"
                      value={draft.embeddingApiKey}
                      onChange={(e) => setDraft({ ...draft, embeddingApiKey: e.target.value })}
                      placeholder={t('knowledge.apiKeyOptional')}
                      autoComplete="off"
                    />
                  </label>
                </>
              ) : null}

              {needsExternalStore ? (
                <>
                  <label className={styles.field}>
                    <span>{t('knowledge.vectorStoreUrl')}</span>
                    <input
                      value={draft.vectorStoreUrl}
                      onChange={(e) => setDraft({ ...draft, vectorStoreUrl: e.target.value })}
                      placeholder={
                        draft.vectorStore === 'chroma'
                          ? 'http://127.0.0.1:8000'
                          : 'http://127.0.0.1:6333'
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span>{t('knowledge.vectorCollection')}</span>
                    <input
                      value={draft.vectorCollection}
                      onChange={(e) => setDraft({ ...draft, vectorCollection: e.target.value })}
                      placeholder="treasure_chest"
                    />
                  </label>
                  <label className={styles.field}>
                    <span>{t('knowledge.vectorStoreApiKey')}</span>
                    <input
                      type="password"
                      value={draft.vectorStoreApiKey}
                      onChange={(e) => setDraft({ ...draft, vectorStoreApiKey: e.target.value })}
                      placeholder={t('knowledge.apiKeyOptional')}
                      autoComplete="off"
                    />
                  </label>
                </>
              ) : null}

              <label className={styles.field}>
                <span>{t('knowledge.chunkSize')}</span>
                <input
                  type="number"
                  min={200}
                  max={4000}
                  value={draft.chunkSize}
                  onChange={(e) =>
                    setDraft({ ...draft, chunkSize: Number(e.target.value) || 700 })
                  }
                />
              </label>
              <label className={styles.field}>
                <span>{t('knowledge.chunkOverlap')}</span>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={draft.chunkOverlap}
                  onChange={(e) =>
                    setDraft({ ...draft, chunkOverlap: Number(e.target.value) || 0 })
                  }
                />
              </label>

              <label className={styles.checkField}>
                <input
                  type="checkbox"
                  checked={draft.hybridSearch}
                  onChange={(e) => setDraft({ ...draft, hybridSearch: e.target.checked })}
                  disabled={draft.embeddingProvider === 'none'}
                />
                <span>
                  <strong>{t('knowledge.hybridSearch')}</strong>
                  <em>{t('knowledge.hybridSearchHint')}</em>
                </span>
              </label>
            </div>

            {settings ? (
              <p className={styles.currentBackend}>
                {t('knowledge.currentConfig', {
                  embed: t(`knowledge.embed.${settings.embeddingProvider}`),
                  store: t(`knowledge.store.${settings.vectorStore}`),
                })}
              </p>
            ) : null}
          </section>
        ) : null}
      </main>

      {deleteTarget ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="kb-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="kb-delete-title" className={styles.modalTitle}>
              {t('knowledge.deleteCollectionTitle', { name: deleteTarget.name })}
            </h3>
            {deleteImpact.subtreeDocs > 0 || deleteImpact.children > 0 ? (
              <>
                <p className={styles.modalBody}>
                  {t('knowledge.deleteCollectionHasTree', {
                    docs: deleteImpact.subtreeDocs,
                    children: deleteImpact.children,
                  })}
                </p>
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.modalGhost}
                    onClick={() => setDeleteTarget(null)}
                  >
                    {t('knowledge.cancel')}
                  </button>
                  <button
                    type="button"
                    className={styles.modalSecondary}
                    onClick={() => void onDeleteCollection('move')}
                  >
                    {t('knowledge.deleteCollectionKeepDocs')}
                  </button>
                  <button
                    type="button"
                    className={styles.modalDanger}
                    onClick={() => void onDeleteCollection('cascade')}
                  >
                    {t('knowledge.deleteCollectionWithDocs')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className={styles.modalBody}>{t('knowledge.deleteCollectionEmpty')}</p>
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.modalGhost}
                    onClick={() => setDeleteTarget(null)}
                  >
                    {t('knowledge.cancel')}
                  </button>
                  <button
                    type="button"
                    className={styles.modalDanger}
                    onClick={() => void onDeleteCollection('cascade')}
                  >
                    {t('knowledge.deleteCollection')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
