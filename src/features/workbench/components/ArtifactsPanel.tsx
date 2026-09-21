import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkbenchArtifact } from '../lib/artifactStore'
import { PanelBodyState } from '@renderer/shared/ui/PanelBodyState'
import { MarkdownMessage } from './MarkdownMessage'
import styles from './ArtifactsPanel.module.css'

interface ArtifactsPanelProps {
  open: boolean
  artifacts: WorkbenchArtifact[]
  activeId: string | null
  loading?: boolean
  onSelect: (id: string | null) => void
  onClose: () => void
  onDelete: (id: string) => void
}

function kindLabel(kind: WorkbenchArtifact['kind'], t: (k: string) => string): string {
  return t(`workbench.artifact.kind.${kind}`)
}

export function ArtifactsPanel({
  open,
  artifacts,
  activeId,
  loading = false,
  onSelect,
  onClose,
  onDelete,
}: ArtifactsPanelProps): ReactNode {
  const { t } = useTranslation()
  const [actionError, setActionError] = useState('')
  if (!open) return null

  const active = artifacts.find((a) => a.id === activeId) ?? artifacts[0] ?? null

  const copyActive = async (): Promise<void> => {
    if (!active) return
    try {
      await navigator.clipboard.writeText(active.content)
      setActionError('')
    } catch {
      setActionError(t('workbench.artifactsActionError'))
    }
  }

  const saveActive = async (): Promise<void> => {
    if (!active) return
    const ext =
      active.kind === 'code'
        ? active.language || 'txt'
        : active.kind === 'markdown'
          ? 'md'
          : active.kind === 'link'
            ? 'txt'
            : 'txt'
    const defaultName = `${active.title.replace(/[^\w\u4e00-\u9fff.-]+/g, '_').slice(0, 40)}.${ext}`
    try {
      if (active.kind === 'image' || active.kind === 'video' || active.kind === 'audio') {
        if (active.content.startsWith('http') || active.content.startsWith('data:')) {
          await window.treasureChest.saveMediaFile({
            url: active.content,
            defaultName,
          })
        }
        setActionError('')
        return
      }
      await window.treasureChest.saveTextFile({
        content: active.content,
        defaultName,
      })
      setActionError('')
    } catch {
      setActionError(t('workbench.artifactsActionError'))
    }
  }

  const bodyStatus =
    loading && artifacts.length === 0
      ? 'loading'
      : artifacts.length === 0
        ? 'empty'
        : 'ready'

  return (
    <aside className={styles.panel} aria-label={t('workbench.artifacts')}>
      <div className={styles.head}>
        <strong>{t('workbench.artifacts')}</strong>
        <button type="button" className={styles.iconBtn} onClick={onClose} title={t('workbench.artifactsClose')}>
          ×
        </button>
      </div>
      {actionError ? (
        <p className={styles.errorBanner} role="alert">
          {actionError}
        </p>
      ) : null}
      <PanelBodyState
        status={bodyStatus}
        loadingLabel={t('workbench.artifactsLoading')}
        emptyLabel={t('workbench.artifactsEmpty')}
        className={styles.empty}
      >
        <div className={styles.body}>
          <ul className={styles.list}>
            {artifacts.map((art) => (
              <li key={art.id}>
                <button
                  type="button"
                  className={`${styles.item} ${active?.id === art.id ? styles.itemActive : ''}`}
                  onClick={() => onSelect(art.id)}
                >
                  <span className={styles.kind}>{kindLabel(art.kind, t)}</span>
                  <span className={styles.title}>{art.title}</span>
                </button>
              </li>
            ))}
          </ul>
          {active ? (
            <div className={styles.preview}>
              <div className={styles.previewHead}>
                <span>{active.title}</span>
                <span className={styles.previewActions}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => void copyActive()}
                    title={t('workbench.artifactCopy')}
                  >
                    {t('workbench.artifactCopy')}
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => void saveActive()}
                    title={t('workbench.artifactSave')}
                  >
                    {t('workbench.artifactSave')}
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => {
                      onDelete(active.id)
                      setActionError('')
                    }}
                    title={t('workbench.artifactDelete')}
                  >
                    {t('workbench.artifactDelete')}
                  </button>
                </span>
              </div>
              {active.kind === 'image' ? (
                <img className={styles.media} src={active.content} alt={active.title} />
              ) : null}
              {active.kind === 'video' ? (
                <video className={styles.media} src={active.content} controls />
              ) : null}
              {active.kind === 'audio' ? (
                <audio className={styles.mediaAudio} src={active.content} controls />
              ) : null}
              {active.kind === 'code' ? (
                <pre className={styles.code}>
                  <code>{active.content}</code>
                </pre>
              ) : null}
              {active.kind === 'markdown' || active.kind === 'link' ? (
                <div className={styles.md}>
                  <MarkdownMessage content={active.content} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </PanelBodyState>
    </aside>
  )
}
