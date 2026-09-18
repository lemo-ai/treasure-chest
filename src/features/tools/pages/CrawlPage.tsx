import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CopyButton } from '../components/CopyButton'
import { ToolShell } from '../components/ToolShell'
import {
  type CrawlSnapshot,
  type CrawlTable,
  downloadText,
  downloadXlsx,
  linksToTable,
  stampName,
  tableToCsv,
} from '../lib/crawlExport'
import { localizeToolError } from '../lib/toolError'
import form from './ToolForm.module.css'
import styles from './CrawlPage.module.css'

type CrawlMode = 'auto' | 'text' | 'tables' | 'links'
type ViewFormat = 'table' | 'csv' | 'json' | 'text' | 'links'

function pickDefaultView(snap: CrawlSnapshot, crawlMode: CrawlMode): ViewFormat {
  if (crawlMode === 'text') return 'text'
  if (crawlMode === 'links') return 'links'
  if (crawlMode === 'tables') return 'table'
  if (snap.tables && snap.tables.length > 0) return 'table'
  if (snap.links && snap.links.length > 0) return 'links'
  if (snap.text) return 'text'
  return 'json'
}

export function CrawlPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [url, setUrl] = useState(
    'https://www.okooo.com/jingcai/kaijiang/?LotteryType=SportteryWDL&StartDate=2024-09-15&EndDate=2024-09-15',
  )
  const [mode, setMode] = useState<CrawlMode>('auto')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [snap, setSnap] = useState<CrawlSnapshot | null>(null)
  const [view, setView] = useState<ViewFormat>('table')
  const [tableIndex, setTableIndex] = useState(0)

  const tables = snap?.tables ?? []
  const activeTable: CrawlTable | null = tables[tableIndex] ?? null
  const linksTable = useMemo(
    () => (snap?.links?.length ? linksToTable(snap.links) : null),
    [snap],
  )

  useEffect(() => {
    if (tableIndex >= tables.length) setTableIndex(0)
  }, [tables.length, tableIndex])

  const csvText = useMemo(() => {
    if (view === 'links' && linksTable) return tableToCsv(linksTable)
    if (activeTable) return tableToCsv(activeTable)
    return ''
  }, [view, activeTable, linksTable])

  const jsonText = useMemo(() => {
    if (!snap) return ''
    return JSON.stringify(
      {
        title: snap.title,
        url: snap.finalUrl || snap.url,
        encoding: snap.encoding,
        text: snap.text,
        tables: snap.tables,
        links: snap.links,
        retrievedAt: snap.retrievedAt,
      },
      null,
      2,
    )
  }, [snap])

  const copyValue = useMemo(() => {
    if (!snap) return ''
    if (view === 'csv') return csvText
    if (view === 'json') return jsonText
    if (view === 'text') return snap.text || ''
    if (view === 'links') return csvText || (snap.links || []).map((l) => `${l.text}\t${l.href}`).join('\n')
    if (view === 'table' && activeTable) return csvText
    return jsonText
  }, [snap, view, csvText, jsonText, activeTable])

  const meta = useMemo(() => {
    if (!snap?.ok) return ''
    return [
      snap.title ? `${t('tools.crawl.titleLabel')}: ${snap.title}` : null,
      snap.finalUrl && snap.finalUrl !== snap.url
        ? `${t('tools.crawl.finalUrl')}: ${snap.finalUrl}`
        : null,
      snap.encoding ? `${t('tools.crawl.encoding')}: ${snap.encoding}` : null,
      snap.status != null ? `HTTP ${snap.status}` : null,
      snap.tables?.length
        ? t('tools.crawl.tablesCount', { count: snap.tables.length })
        : null,
      snap.links?.length ? t('tools.crawl.linksCount', { count: snap.links.length }) : null,
      snap.truncated ? t('tools.crawl.truncated') : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }, [snap, t])

  const runCrawl = async (): Promise<void> => {
    const target = url.trim()
    if (!target) {
      setError(t('tools.crawl.urlRequired'))
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await window.treasureChest.crawlUrl({ url: target, mode })
      if (!result.ok) {
        setSnap(null)
        setError(result.error || t('tools.crawl.failed'))
        return
      }
      const next = result as CrawlSnapshot
      setSnap(next)
      setTableIndex(0)
      setView(pickDefaultView(next, mode))
    } catch (err) {
      setSnap(null)
      setError(localizeToolError(err, t))
    } finally {
      setLoading(false)
    }
  }

  const clearAll = (): void => {
    setUrl('')
    setSnap(null)
    setError('')
    setTableIndex(0)
  }

  const exportCsv = (): void => {
    if (!csvText) return
    downloadText(stampName('crawl', 'csv'), csvText, 'text/csv;charset=utf-8')
  }

  const exportExcel = (): void => {
    const pack: CrawlTable[] = []
    if (tables.length) pack.push(...tables)
    else if (view === 'links' && linksTable) pack.push(linksTable)
    if (!pack.length) return
    downloadXlsx(stampName('crawl', 'xlsx'), pack)
  }

  const exportJson = (): void => {
    if (!jsonText) return
    downloadText(stampName('crawl', 'json'), jsonText, 'application/json;charset=utf-8')
  }

  const exportTxt = (): void => {
    if (!snap?.text) return
    downloadText(stampName('crawl', 'txt'), snap.text, 'text/plain;charset=utf-8')
  }

  const viewOptions: ViewFormat[] = ['table', 'csv', 'json', 'text', 'links']

  return (
    <ToolShell title={t('tools.crawl.title')} subtitle={t('tools.crawl.desc')} wide>
      <div className={styles.layout}>
        <div className={form.panel}>
          <p className={form.panelTag}>{t('tools.crawl.input')}</p>
          <label className={form.field}>
            <span className={form.label}>{t('tools.crawl.url')}</span>
            <input
              className={form.input}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('tools.crawl.placeholder')}
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runCrawl()
              }}
            />
          </label>
          <label className={form.field}>
            <span className={form.label}>{t('tools.crawl.mode')}</span>
            <select
              className={form.select}
              value={mode}
              onChange={(e) => setMode(e.target.value as CrawlMode)}
            >
              <option value="auto">{t('tools.crawl.mode.auto')}</option>
              <option value="text">{t('tools.crawl.mode.text')}</option>
              <option value="tables">{t('tools.crawl.mode.tables')}</option>
              <option value="links">{t('tools.crawl.mode.links')}</option>
            </select>
          </label>
          <div className={form.actions}>
            <button
              type="button"
              className={form.primaryBtn}
              disabled={loading}
              onClick={() => void runCrawl()}
            >
              {loading ? t('tools.crawl.running') : t('tools.crawl.run')}
            </button>
            <button type="button" className={form.ghostBtn} disabled={loading} onClick={clearAll}>
              {t('tools.crawl.clear')}
            </button>
          </div>
          {error ? <p className={form.error}>{error}</p> : null}
          <p className={styles.hint}>{t('tools.crawl.hint')}</p>
        </div>

        <div className={`${form.panel} ${styles.resultPanel}`}>
          <div className={styles.outHead}>
            <p className={form.panelTag}>{t('tools.crawl.output')}</p>
            {snap?.ok ? <CopyButton value={copyValue} /> : null}
          </div>

          {meta ? <p className={styles.meta}>{meta}</p> : null}

          {snap?.ok ? (
            <>
              <div className={styles.toolbar}>
                <div className={form.segmented} role="tablist" aria-label={t('tools.crawl.view')}>
                  {viewOptions.map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={view === v}
                      className={`${form.segBtn} ${view === v ? form.segBtnActive : ''}`}
                      onClick={() => setView(v)}
                    >
                      {t(`tools.crawl.view.${v}`)}
                    </button>
                  ))}
                </div>
                <div className={styles.exportRow}>
                  <button
                    type="button"
                    className={form.ghostBtn}
                    disabled={!csvText}
                    onClick={exportCsv}
                  >
                    {t('tools.crawl.export.csv')}
                  </button>
                  <button
                    type="button"
                    className={form.ghostBtn}
                    disabled={!tables.length && !linksTable}
                    onClick={exportExcel}
                  >
                    {t('tools.crawl.export.xlsx')}
                  </button>
                  <button
                    type="button"
                    className={form.ghostBtn}
                    disabled={!jsonText}
                    onClick={exportJson}
                  >
                    {t('tools.crawl.export.json')}
                  </button>
                  <button
                    type="button"
                    className={form.ghostBtn}
                    disabled={!snap.text}
                    onClick={exportTxt}
                  >
                    {t('tools.crawl.export.txt')}
                  </button>
                </div>
              </div>

              {view === 'table' && tables.length > 1 ? (
                <div className={styles.tableTabs}>
                  {tables.map((tb, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`${styles.tableTab} ${i === tableIndex ? styles.tableTabActive : ''}`}
                      onClick={() => setTableIndex(i)}
                    >
                      {tb.caption?.trim() || t('tools.crawl.tableN', { n: i + 1 })}
                      <span className={styles.tableTabMeta}>
                        {tb.rows.length}×{Math.max(tb.headers.length, tb.rows[0]?.length ?? 0)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className={styles.viewport}>
                {view === 'table' ? (
                  activeTable ? (
                    <CrawlTableView table={activeTable} />
                  ) : (
                    <p className={styles.empty}>{t('tools.crawl.noTables')}</p>
                  )
                ) : null}

                {view === 'csv' ? (
                  csvText ? (
                    <pre className={styles.pre}>{csvText}</pre>
                  ) : (
                    <p className={styles.empty}>{t('tools.crawl.noTables')}</p>
                  )
                ) : null}

                {view === 'json' ? <pre className={styles.pre}>{jsonText}</pre> : null}

                {view === 'text' ? (
                  snap.text ? (
                    <pre className={styles.pre}>{snap.text}</pre>
                  ) : (
                    <p className={styles.empty}>{t('tools.crawl.noText')}</p>
                  )
                ) : null}

                {view === 'links' ? (
                  linksTable ? (
                    <CrawlTableView table={linksTable} />
                  ) : (
                    <p className={styles.empty}>{t('tools.crawl.noLinks')}</p>
                  )
                ) : null}
              </div>

              {view === 'table' && activeTable ? (
                <p className={styles.stats}>
                  {t('tools.crawl.tableStats', {
                    rows: activeTable.rows.length,
                    cols: Math.max(activeTable.headers.length, activeTable.rows[0]?.length ?? 0),
                  })}
                </p>
              ) : null}
            </>
          ) : (
            <p className={styles.empty}>{t('tools.crawl.emptyOutput')}</p>
          )}
        </div>
      </div>
    </ToolShell>
  )
}

function CrawlTableView({ table }: { table: CrawlTable }): React.JSX.Element {
  const colCount = Math.max(
    table.headers.length,
    ...table.rows.map((r) => r.length),
    1,
  )
  const headers =
    table.headers.length > 0
      ? Array.from({ length: colCount }, (_, i) => table.headers[i] || `col_${i + 1}`)
      : Array.from({ length: colCount }, (_, i) => `col_${i + 1}`)

  return (
    <div className={styles.tableWrap}>
      {table.caption ? <p className={styles.caption}>{table.caption}</p> : null}
      <table className={styles.table}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri}>
              {headers.map((_, ci) => (
                <td key={ci}>{row[ci] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
