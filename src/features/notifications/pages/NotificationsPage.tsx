import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { InboxItem } from '@shared'
import { IconBell, IconTrash } from '@renderer/shared/ui/icons'
import { MarkdownMessage } from '@renderer/features/workbench/components/MarkdownMessage'
import { InboxHtmlFrame } from '../components/InboxHtmlFrame'
import styles from './NotificationsPage.module.css'

function formatTime(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale.startsWith('en') ? 'en-US' : 'zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function toneClass(item: InboxItem, stylesMap: typeof styles): string {
  if (item.coverPreset === 'fortune') return stylesMap.toneFortune
  if (item.coverPreset === 'stocks') return stylesMap.toneStocks
  if (item.coverPreset === 'agent') return stylesMap.toneAgent
  if (item.status === 'error') return stylesMap.toneError
  if (item.status === 'ok') return stylesMap.toneOk
  return stylesMap.toneDefault
}

export function NotificationsPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState<InboxItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(params.get('id'))
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async (): Promise<void> => {
    const snap = await window.treasureChest.getInboxSnapshot()
    setItems(snap.items)
    setLoaded(true)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const offAppend = window.treasureChest.onInboxAppended(() => {
      void reload()
    })
    return () => offAppend()
  }, [reload])

  useEffect(() => {
    const id = params.get('id')
    if (id) setSelectedId(id)
  }, [params])

  const selected = items.find((i) => i.id === selectedId) ?? null

  useEffect(() => {
    if (!selected || selected.read) return
    void window.treasureChest.markInboxRead(selected.id).then(() => reload())
  }, [selected, reload])

  const selectItem = (id: string): void => {
    setSelectedId(id)
    setParams({ id })
  }

  const deleteItem = (id: string): void => {
    void window.treasureChest.removeInboxItem(id).then(() => {
      if (selectedId === id) {
        setSelectedId(null)
        setParams({})
      }
      return reload()
    })
  }

  const statusLabel = (status: InboxItem['status']): string => {
    if (status === 'ok') return t('inbox.status.ok')
    if (status === 'error') return t('inbox.status.error')
    if (status === 'skipped') return t('inbox.status.skipped')
    return t('inbox.status.info')
  }

  const statusClass = (status: InboxItem['status']): string => {
    if (status === 'ok') return styles.statusOk
    if (status === 'error') return styles.statusError
    if (status === 'skipped') return styles.statusSkipped
    return styles.statusInfo
  }

  const coverLabel = (preset: NonNullable<InboxItem['coverPreset']>): string => {
    if (preset === 'fortune') return t('inbox.cover.fortune')
    if (preset === 'stocks') return t('inbox.cover.stocks')
    if (preset === 'agent') return t('inbox.cover.agent')
    return t('inbox.cover.custom')
  }

  const unread = items.filter((i) => !i.read).length

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.headMain}>
          <div className={styles.headIcon}>
            <IconBell />
          </div>
          <div>
            <h1 className={styles.title}>{t('inbox.title')}</h1>
            <p className={styles.sub}>
              {t('inbox.subtitle')}
              {unread > 0 ? (
                <span className={styles.unreadHint}> · {t('inbox.unreadCount', { count: unread })}</span>
              ) : null}
            </p>
          </div>
        </div>
        <div className={styles.headActions}>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => void window.treasureChest.markAllInboxRead().then(() => reload())}
          >
            {t('inbox.markAllRead')}
          </button>
          <button
            type="button"
            className={styles.dangerBtn}
            onClick={() => {
              if (!window.confirm(t('inbox.clearConfirm'))) return
              void window.treasureChest.clearInbox().then(() => {
                setSelectedId(null)
                setParams({})
                return reload()
              })
            }}
          >
            {t('inbox.clear')}
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.listPane}>
          <div className={styles.list}>
            {!loaded ? (
              <p className={styles.empty}>{t('inbox.loading')}</p>
            ) : items.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <IconBell />
                </div>
                <p>{t('inbox.empty')}</p>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className={[
                    styles.item,
                    toneClass(item, styles),
                    selectedId === item.id ? styles.itemActive : '',
                    !item.read ? styles.itemUnread : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className={styles.itemAccent} aria-hidden />
                  <button
                    type="button"
                    className={styles.itemMain}
                    onClick={() => selectItem(item.id)}
                  >
                    <div className={styles.itemContent}>
                      <div className={styles.itemTop}>
                        <h2 className={styles.itemTitle}>{item.title}</h2>
                        <span className={statusClass(item.status)}>{statusLabel(item.status)}</span>
                      </div>
                      <p className={styles.itemMeta}>{formatTime(item.createdAt, i18n.language)}</p>
                      <p className={styles.itemSummary}>{item.summary}</p>
                    </div>
                    {!item.read ? <span className={styles.dot} aria-hidden /> : null}
                  </button>
                  <button
                    type="button"
                    className={styles.itemDelete}
                    title={t('inbox.delete')}
                    aria-label={t('inbox.delete')}
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteItem(item.id)
                    }}
                  >
                    <IconTrash />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={styles.detailPane}>
          {!selected ? (
            <div className={styles.detailEmpty}>
              <div className={styles.emptyIcon}>
                <IconBell />
              </div>
              <p>{t('inbox.pickOne')}</p>
            </div>
          ) : (
            <article className={`${styles.detailCard} ${toneClass(selected, styles)}`}>
              <div className={styles.detailBanner} aria-hidden />
              <div className={styles.detailInner}>
                <div className={styles.detailHead}>
                  <div>
                    <div className={styles.detailBadges}>
                      <span className={statusClass(selected.status)}>{statusLabel(selected.status)}</span>
                      {selected.coverPreset ? (
                        <span className={styles.kindChip}>{coverLabel(selected.coverPreset)}</span>
                      ) : null}
                    </div>
                    <h2 className={styles.detailTitle}>{selected.title}</h2>
                    <p className={styles.detailTime}>
                      {formatTime(selected.createdAt, i18n.language)}
                    </p>
                  </div>
                </div>
                <div className={styles.detailBody}>
                  {selected.detailFormat === 'html' ? (
                    <InboxHtmlFrame html={selected.detail || selected.summary} title={selected.title} />
                  ) : selected.detailFormat === 'plain' ? (
                    <pre className={styles.plainDetail}>{selected.detail || selected.summary}</pre>
                  ) : (
                    <MarkdownMessage content={selected.detail || selected.summary} />
                  )}
                </div>
              </div>
            </article>
          )}
        </div>
      </div>
    </div>
  )
}
