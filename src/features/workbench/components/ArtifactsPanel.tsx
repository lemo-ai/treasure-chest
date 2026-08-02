import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkbenchArtifact } from '../lib/artifactStore'
import { MarkdownMessage } from './MarkdownMessage'
import styles from './ArtifactsPanel.module.css'

interface ArtifactsPanelProps {
  open: boolean
  artifacts: WorkbenchArtifact[]
  activeId: string | null
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
  onSelect,
  onClose,
  onDelete,
}: ArtifactsPanelProps): ReactNode {
  const { t } = useTranslation()
  if (!open) return null

  const active = artifacts.find((a) => a.id === activeId) ?? artifacts[0] ?? null

  return (
    <aside className={styles.panel} aria-label={t('workbench.artifacts')}>
      <div className={styles.head}>
        <strong>{t('workbench.artifacts')}</strong>
        <button type="button" className={styles.iconBtn} onClick={onClose} title={t('workbench.artifactsClose')}>
          ×
        </button>
      </div>
      {artifacts.length === 0 ? (
        <p className={styles.empty}>{t('workbench.artifactsEmpty')}</p>
      ) : (
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
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => onDelete(active.id)}
                  title={t('workbench.artifactDelete')}
                >
                  {t('workbench.artifactDelete')}
                </button>
              </div>
              {active.kind === 'image' ? (
                <img className={styles.media} src={active.content} alt={active.title} />
              ) : null}
              {active.kind === 'video' ? (
                <video className={styles.media} src={active.content} controls />
              ) : null}
              {active.kind === 'audio' ? <audio className={styles.mediaAudio} src={active.content} controls /> : null}
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
      )}
    </aside>
  )
}
