import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { McpServerConfig, McpServerStatus, McpTransport } from '@shared'
import { IconLayers, IconPlus } from '@renderer/shared/ui/icons'
import { ToggleSwitch } from '@renderer/shared/ui/ToggleSwitch'
import styles from './McpServersPanel.module.css'

type KvPair = { key: string; value: string }

type McpDraft = {
  id: string
  name: string
  enabled: boolean
  transport: McpTransport
  command: string
  argsText: string
  url: string
  envPairs: KvPair[]
  headerPairs: KvPair[]
}

function pairsToRecord(pairs: KvPair[]): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const p of pairs) {
    const k = p.key.trim()
    if (!k) continue
    out[k] = p.value
  }
  return Object.keys(out).length ? out : undefined
}

function toDraft(s: McpServerConfig): McpDraft {
  return {
    id: s.id,
    name: s.name,
    enabled: s.enabled,
    transport: s.transport === 'sse' ? 'sse' : 'stdio',
    command: s.command,
    argsText: (s.args ?? []).join(' '),
    url: s.url ?? '',
    envPairs: Object.entries(s.env ?? {}).map(([key, value]) => ({ key, value })),
    headerPairs: Object.entries(s.headers ?? {}).map(([key, value]) => ({ key, value })),
  }
}

function emptyDraft(): McpDraft {
  return {
    id: `mcp_${Date.now().toString(36)}`,
    name: '',
    enabled: true,
    transport: 'stdio',
    command: 'npx',
    argsText: '-y @modelcontextprotocol/server-memory',
    url: '',
    envPairs: [],
    headerPairs: [],
  }
}

function draftToConfig(d: McpDraft): McpServerConfig {
  return {
    id: d.id,
    name: d.name.trim() || d.id,
    enabled: d.enabled,
    transport: d.transport,
    command: d.command.trim(),
    args: d.argsText
      .trim()
      .split(/\s+/)
      .filter(Boolean),
    url: d.url.trim() || undefined,
    env: pairsToRecord(d.envPairs),
    headers: pairsToRecord(d.headerPairs),
  }
}

export function McpServersPanel(): React.JSX.Element {
  const { t } = useTranslation()
  const [servers, setServers] = useState<McpDraft[]>([])
  const [statuses, setStatuses] = useState<McpServerStatus[]>([])
  const [toolCount, setToolCount] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [editor, setEditor] = useState<McpDraft | null>(null)
  const [isCreate, setIsCreate] = useState(false)

  const applyStatus = (snap: { servers: McpServerStatus[]; toolCount: number }): void => {
    setStatuses(snap.servers)
    setToolCount(snap.toolCount)
  }

  const reload = async (): Promise<void> => {
    const [mcp, status] = await Promise.all([
      window.treasureChest.getMcpSettings(),
      window.treasureChest.getMcpStatus(),
    ])
    setServers(mcp.servers.map(toDraft))
    applyStatus(status)
  }

  useEffect(() => {
    void reload().catch(() => undefined)
  }, [])

  const persist = async (next: McpDraft[], refresh = true): Promise<void> => {
    setServers(next)
    const saved = await window.treasureChest.setMcpSettings({
      servers: next.map(draftToConfig),
    })
    setServers(saved.servers.map(toDraft))
    if (refresh) {
      setRefreshing(true)
      try {
        applyStatus(await window.treasureChest.refreshMcpStatus())
      } finally {
        setRefreshing(false)
      }
    }
  }

  const statusOf = (id: string): McpServerStatus | undefined => statuses.find((s) => s.id === id)

  const onRefresh = (): void => {
    setRefreshing(true)
    void window.treasureChest
      .refreshMcpStatus()
      .then(applyStatus)
      .finally(() => setRefreshing(false))
  }

  const openCreate = (): void => {
    setIsCreate(true)
    setEditor(emptyDraft())
  }

  const openEdit = (draft: McpDraft): void => {
    setIsCreate(false)
    setEditor({
      ...draft,
      envPairs: draft.envPairs.map((p) => ({ ...p })),
      headerPairs: draft.headerPairs.map((p) => ({ ...p })),
    })
  }

  const saveEditor = async (): Promise<void> => {
    if (!editor) return
    const next = isCreate
      ? [...servers, editor]
      : servers.map((s) => (s.id === editor.id ? editor : s))
    setEditor(null)
    await persist(next)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h2 className={styles.title}>{t('settings.mcp.title')}</h2>
          <p className={styles.desc}>{t('settings.mcp.desc')}</p>
          <p className={styles.toolSummary}>
            {t('settings.mcp.refreshTools', { count: toolCount })}
          </p>
        </div>
        <div className={styles.headActions}>
          <button
            type="button"
            className={styles.refreshBtn}
            disabled={refreshing}
            onClick={onRefresh}
          >
            {refreshing ? t('settings.mcp.refreshing') : t('settings.mcp.refreshTools', { count: toolCount })}
          </button>
          <button type="button" className={styles.addBtn} onClick={openCreate}>
            <IconPlus />
            {t('settings.mcp.add')}
          </button>
        </div>
      </div>

      <p className={styles.hint}>{t('settings.mcp.hint')}</p>

      {servers.length === 0 ? (
        <div className={styles.empty}>
          <strong className={styles.emptyTitle}>{t('settings.mcp.emptyTitle')}</strong>
          <p className={styles.emptyDesc}>{t('settings.mcp.emptyDesc')}</p>
          <button type="button" className={styles.addBtn} onClick={openCreate}>
            <IconPlus />
            {t('settings.mcp.add')}
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          {servers.map((server) => {
            const st = statusOf(server.id)
            const statusKey = st?.status ?? 'disconnected'
            const tools = st?.tools ?? []
            const summary =
              server.transport === 'sse'
                ? server.url || '—'
                : `${server.command} ${server.argsText}`.trim() || '—'
            return (
              <article
                key={server.id}
                className={`${styles.card} ${server.enabled ? '' : styles.cardOff}`}
              >
                <div className={styles.cardTop}>
                  <div className={styles.cardIdentity}>
                    <span className={styles.mark}>
                      <IconLayers />
                    </span>
                    <div className={styles.cardMeta}>
                      <h3 className={styles.cardName}>{server.name || server.id}</h3>
                      <div className={styles.badges}>
                        <span className={`${styles.badge} ${styles.badgeTransport}`}>
                          {server.transport}
                        </span>
                        <span className={`${styles.badge} ${styles[`badge_${statusKey}`] ?? ''}`}>
                          {t(`settings.mcp.status.${statusKey}`)}
                        </span>
                        <span className={styles.badge}>
                          {t('settings.mcp.toolsCount', { count: tools.length })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ToggleSwitch
                    label={t('settings.mcp.enabled')}
                    checked={server.enabled}
                    onChange={(enabled) => {
                      void persist(
                        servers.map((s) => (s.id === server.id ? { ...s, enabled } : s)),
                      )
                    }}
                  />
                </div>

                <p className={styles.summary} title={summary}>
                  {summary}
                </p>
                {st?.error ? <p className={styles.error}>{st.error}</p> : null}

                {tools.length > 0 ? (
                  <div className={styles.tools}>
                    {tools.slice(0, 6).map((tool) => (
                      <span key={tool.name} className={styles.toolChip} title={tool.description}>
                        {tool.name}
                      </span>
                    ))}
                    {tools.length > 6 ? (
                      <span className={styles.toolMore}>+{tools.length - 6}</span>
                    ) : null}
                  </div>
                ) : (
                  <p className={styles.hint}>{t('settings.mcp.toolsEmpty')}</p>
                )}

                <div className={styles.cardActions}>
                  <div className={styles.actionBtns}>
                    <button type="button" className={styles.ghostBtn} onClick={() => openEdit(server)}>
                      {t('settings.mcp.edit')}
                    </button>
                    <button
                      type="button"
                      className={styles.dangerBtn}
                      onClick={() => {
                        void persist(servers.filter((s) => s.id !== server.id))
                      }}
                    >
                      {t('settings.mcp.remove')}
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {editor ? (
        <div
          className={styles.backdrop}
          role="presentation"
          onClick={() => setEditor(null)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>
              {isCreate ? t('settings.mcp.editorCreate') : t('settings.mcp.editorTitle')}
            </h3>
            <p className={styles.hint}>{t('settings.mcp.formCompatHint')}</p>

            <label className={styles.field}>
              <span>{t('settings.mcp.name')}</span>
              <input
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                placeholder="Memory"
              />
            </label>

            <label className={styles.field}>
              <span>{t('settings.mcp.transport')}</span>
              <select
                value={editor.transport}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    transport: e.target.value === 'sse' ? 'sse' : 'stdio',
                  })
                }
              >
                <option value="stdio">{t('settings.mcp.transport.stdio')}</option>
                <option value="sse">{t('settings.mcp.transport.sse')}</option>
              </select>
            </label>

            {editor.transport === 'sse' ? (
              <>
                <label className={styles.field}>
                  <span>{t('settings.mcp.url')}</span>
                  <input
                    value={editor.url}
                    placeholder="http://127.0.0.1:3000/sse"
                    onChange={(e) => setEditor({ ...editor, url: e.target.value })}
                  />
                  <em className={styles.hint}>{t('settings.mcp.urlHint')}</em>
                </label>
                <div className={styles.kvBlock}>
                  <div className={styles.fieldLabel}>{t('settings.mcp.headers')}</div>
                  {editor.headerPairs.map((pair, pIdx) => (
                    <div key={`h-${pIdx}`} className={styles.kvRow}>
                      <input
                        placeholder={t('settings.mcp.headerKey')}
                        value={pair.key}
                        onChange={(e) => {
                          const headerPairs = editor.headerPairs.map((p, i) =>
                            i === pIdx ? { ...p, key: e.target.value } : p,
                          )
                          setEditor({ ...editor, headerPairs })
                        }}
                      />
                      <input
                        placeholder={t('settings.mcp.headerValue')}
                        value={pair.value}
                        onChange={(e) => {
                          const headerPairs = editor.headerPairs.map((p, i) =>
                            i === pIdx ? { ...p, value: e.target.value } : p,
                          )
                          setEditor({ ...editor, headerPairs })
                        }}
                      />
                      <button
                        type="button"
                        className={styles.kvRemove}
                        onClick={() =>
                          setEditor({
                            ...editor,
                            headerPairs: editor.headerPairs.filter((_, i) => i !== pIdx),
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className={styles.kvAdd}
                    onClick={() =>
                      setEditor({
                        ...editor,
                        headerPairs: [...editor.headerPairs, { key: '', value: '' }],
                      })
                    }
                  >
                    {t('settings.mcp.headerAdd')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className={styles.field}>
                  <span>{t('settings.mcp.command')}</span>
                  <input
                    value={editor.command}
                    placeholder="npx"
                    onChange={(e) => setEditor({ ...editor, command: e.target.value })}
                  />
                  <em className={styles.hint}>{t('settings.mcp.commandHint')}</em>
                </label>
                <label className={styles.field}>
                  <span>{t('settings.mcp.args')}</span>
                  <input
                    value={editor.argsText}
                    placeholder="-y @modelcontextprotocol/server-memory"
                    onChange={(e) => setEditor({ ...editor, argsText: e.target.value })}
                  />
                  <em className={styles.hint}>{t('settings.mcp.argsHint')}</em>
                </label>
                <div className={styles.kvBlock}>
                  <div className={styles.fieldLabel}>{t('settings.mcp.env')}</div>
                  <p className={styles.hint}>{t('settings.mcp.envHint')}</p>
                  {editor.envPairs.map((pair, pIdx) => (
                    <div key={`e-${pIdx}`} className={styles.kvRow}>
                      <input
                        placeholder={t('settings.mcp.envKey')}
                        value={pair.key}
                        onChange={(e) => {
                          const envPairs = editor.envPairs.map((p, i) =>
                            i === pIdx ? { ...p, key: e.target.value } : p,
                          )
                          setEditor({ ...editor, envPairs })
                        }}
                      />
                      <input
                        placeholder={t('settings.mcp.envValue')}
                        value={pair.value}
                        onChange={(e) => {
                          const envPairs = editor.envPairs.map((p, i) =>
                            i === pIdx ? { ...p, value: e.target.value } : p,
                          )
                          setEditor({ ...editor, envPairs })
                        }}
                      />
                      <button
                        type="button"
                        className={styles.kvRemove}
                        onClick={() =>
                          setEditor({
                            ...editor,
                            envPairs: editor.envPairs.filter((_, i) => i !== pIdx),
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className={styles.kvAdd}
                    onClick={() =>
                      setEditor({
                        ...editor,
                        envPairs: [...editor.envPairs, { key: '', value: '' }],
                      })
                    }
                  >
                    {t('settings.mcp.envAdd')}
                  </button>
                </div>
              </>
            )}

            <div className={styles.modalActions}>
              <button type="button" className={styles.modalGhost} onClick={() => setEditor(null)}>
                {t('settings.mcp.cancel')}
              </button>
              <button
                type="button"
                className={styles.modalPrimary}
                disabled={
                  editor.transport === 'sse' ? !editor.url.trim() : !editor.command.trim()
                }
                onClick={() => void saveEditor()}
              >
                {t('settings.mcp.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
