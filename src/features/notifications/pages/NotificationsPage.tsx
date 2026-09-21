import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { DIRECT_CHAT_AGENT_ID, type InboxItem } from '@shared'
import { IconBell, IconTrash } from '@renderer/shared/ui/icons'
import { MarkdownMessage } from '@renderer/features/workbench/components/MarkdownMessage'
import { addArtifact } from '@renderer/features/workbench/lib/artifactStore'
import { createSession } from '@renderer/features/workbench/lib/sessionStore'
import { getActiveProjectIdSync } from '@renderer/features/projects/lib/projectStore'
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
  if (item.coverPreset === 'lottery') return stylesMap.toneLottery
  if (item.coverPreset === 'agent') return stylesMap.toneAgent
  if (item.status === 'error') return stylesMap.toneError
  if (item.status === 'ok') return stylesMap.toneOk
  return stylesMap.toneDefault
}

export function NotificationsPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState<InboxItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(params.get('id'))
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

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
    if (preset === 'lottery') return t('inbox.cover.lottery')
    if (preset === 'agent') return t('inbox.cover.agent')
    return t('inbox.cover.custom')
  }

  const agentIdForItem = (item: InboxItem): string => {
    if (item.coverPreset === 'fortune') return 'fortune'
    if (item.coverPreset === 'stocks') return 'stocks'
    if (item.coverPreset === 'lottery') return 'lottery'
    return DIRECT_CHAT_AGENT_ID
  }

  const saveAsArtifact = async (item: InboxItem): Promise<void> => {
    setBusy(true)
    try {
      const body = (item.detail || item.summary || '').trim()
      if (!body) return
      await addArtifact({
        kind: 'markdown',
        title: item.title.slice(0, 80) || t('inbox.saveArtifact'),
        content: body.slice(0, 12_000),
        projectId: getActiveProjectIdSync() || undefined,
        sessionId: item.sessionId,
        source: 'inbox',
      })
    } finally {
      setBusy(false)
    }
  }

  const continueInChat = async (item: InboxItem): Promise<void> => {
    setBusy(true)
    try {
      const agentId = agentIdForItem(item)
      const projectId = getActiveProjectIdSync()
      const title = item.title.slice(0, 48) || (i18n.language.startsWith('zh') ? '续聊' : 'Continue')
      const session = await createSession(agentId, title, projectId)
      const body = (item.detail || item.summary || '').trim()
      const inject = [
        i18n.language.startsWith('zh')
          ? '以下内容来自定时任务 / 通知，请基于此继续协助用户。'
          : 'The following came from a schedule / inbox notification. Continue helping the user from here.',
        '',
        `## ${item.title}`,
        body.slice(0, 8000),
      ].join('\n')
      await window.treasureChest.harnessAppendSystemMessage(session.id, inject)
      if (body.length >= 200) {
        await addArtifact({
          kind: 'markdown',
          title: item.title.slice(0, 80),
          content: body.slice(0, 12_000),
          sessionId: session.id,
          projectId: projectId || undefined,
          source: 'inbox',
        })
      }
      const q =
        agentId === DIRECT_CHAT_AGENT_ID ? '/' : `/?agent=${encodeURIComponent(agentId)}`
      void navigate(q)
    } finally {
      setBusy(false)
    }
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
                  <div className={styles.detailActions}>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      disabled={busy}
                      onClick={() => void saveAsArtifact(selected)}
                    >
                      {t('inbox.saveArtifact')}
                    </button>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      disabled={busy}
                      onClick={() => void continueInChat(selected)}
                    >
                      {t('inbox.continueChat')}
                    </button>
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
