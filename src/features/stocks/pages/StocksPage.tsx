import { useEffect, useMemo, useState } from 'react'
import type { ScannerPoolItem, StockMarket, StocksRangeKey, StocksReport, StocksReportSummary, WatchlistItem } from '@shared'
import { DEFAULT_STOCKS_SETTINGS, getMarketSessionStatus } from '@shared'
import { useTranslation } from 'react-i18next'
import { StockQuickPicks } from '../components/StockQuickPicks'
import { StockRecommendationCard } from '../components/StockRecommendationCard'
import { StockTrendModal } from '../components/StockTrendModal'
import styles from './StocksPage.module.css'

export function StocksPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [market, setMarket] = useState<StockMarket>('CN')
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [scannerPool, setScannerPool] = useState<ScannerPoolItem[]>([])
  const [report, setReport] = useState<StocksReport | null>(null)
  const [history, setHistory] = useState<StocksReportSummary[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [reportMarket, setReportMarket] = useState<'all' | StockMarket>('all')
  const [visibleRanges, setVisibleRanges] = useState<StocksRangeKey[]>(DEFAULT_STOCKS_SETTINGS.defaultRanges)
  const [trendItem, setTrendItem] = useState<WatchlistItem | null>(null)

  const refresh = async (): Promise<void> => {
    setLoading(true)
    const [list, scanner, latest, reports] = await Promise.all([
      window.treasureChest.getStocksWatchlist(),
      window.treasureChest.getStocksScannerPool(),
      window.treasureChest.getLatestStocksReport(),
      window.treasureChest.listStocksReports(30),
    ])
    setWatchlist(list)
    setScannerPool(scanner)
    setReport(latest)
    setHistory(reports)
    setSelectedDate(latest?.date ?? null)
    setLoading(false)
  }

  useEffect(() => {
    void refresh()
    void window.treasureChest.getSettingsSnapshot().then((snap) => {
      if (snap.stocks?.defaultRanges?.length) setVisibleRanges(snap.stocks.defaultRanges)
    })
  }, [])

  const grouped = useMemo(
    () => ({
      CN: watchlist.filter((item) => item.market === 'CN'),
      US: watchlist.filter((item) => item.market === 'US'),
    }),
    [watchlist],
  )
  const scannerGrouped = useMemo(
    () => ({
      CN: scannerPool.filter((item) => item.market === 'CN'),
      US: scannerPool.filter((item) => item.market === 'US'),
    }),
    [scannerPool],
  )

  const filteredRecommendations = useMemo(() => {
    if (!report) return []
    if (reportMarket === 'all') return report.recommendations
    return report.recommendations.filter((rec) => rec.market === reportMarket)
  }, [report, reportMarket])

  const onPickSymbol = (pickedSymbol: string, pickedName: string): void => {
    setSymbol(pickedSymbol)
    setName(pickedName)
    setMarket(pickedSymbol.includes('.') ? 'CN' : 'US')
  }

  const onAdd = async (): Promise<void> => {
    const s = symbol.trim().toUpperCase()
    if (!s) {
      setHint(t('stocks.error.symbolRequired'))
      return
    }
    await window.treasureChest.addStocksWatchlistItem({ market, symbol: s, name: name.trim() || undefined })
    setSymbol('')
    setName('')
    setHint(t('stocks.savedWatchlist'))
    await refresh()
  }

  const onRemove = async (item: WatchlistItem): Promise<void> => {
    await window.treasureChest.removeStocksWatchlistItem({ market: item.market, symbol: item.symbol })
    await refresh()
  }

  const onAddScanner = async (): Promise<void> => {
    const s = symbol.trim().toUpperCase()
    if (!s) {
      setHint(t('stocks.error.symbolRequired'))
      return
    }
    await window.treasureChest.addStocksScannerPoolItem({ market, symbol: s, name: name.trim() || undefined })
    setSymbol('')
    setName('')
    setHint(t('stocks.savedScanner'))
    await refresh()
  }

  const onRemoveScanner = async (item: ScannerPoolItem): Promise<void> => {
    await window.treasureChest.removeStocksScannerPoolItem({ market: item.market, symbol: item.symbol })
    await refresh()
  }

  const onGenerate = async (): Promise<void> => {
    setRunning(true)
    const next = await window.treasureChest.generateStocksReport()
    setReport(next)
    setSelectedDate(next.date)
    setHint(t('stocks.generatedAt', { time: new Date(next.generatedAt).toLocaleString() }))
    const reports = await window.treasureChest.listStocksReports(30)
    setHistory(reports)
    setRunning(false)
  }

  const onSelectHistory = async (date: string): Promise<void> => {
    const next = await window.treasureChest.getStocksReportByDate(date)
    if (!next) {
      setHint(t('stocks.historyMissing'))
      return
    }
    setReport(next)
    setSelectedDate(date)
  }

  const sourceStatus = {
    total: report?.source.status?.total ?? report?.recommendations.length ?? 0,
    quoteFallbackCount: report?.source.status?.quoteFallbackCount ?? 0,
    newsHitCount: report?.source.status?.newsHitCount ?? 0,
    cacheHitCount: report?.source.status?.cacheHitCount ?? 0,
    ai: (report?.source.status?.ai ?? (report?.source.aiEnhanced ? 'fallback' : 'disabled')) as
      | 'disabled'
      | 'success'
      | 'fallback',
  }

  const onImportWatchlistCsv = async (): Promise<void> => {
    const res = await window.treasureChest.importStocksWatchlistCsv()
    if (res.ok) {
      setHint(t('stocks.csvImportOk', { count: res.count ?? 0 }))
      await refresh()
      return
    }
    if (res.error) setHint(t('stocks.csvImportFail', { error: res.error }))
  }

  const onExportWatchlistCsv = async (): Promise<void> => {
    const res = await window.treasureChest.exportStocksWatchlistCsv()
    if (res.ok) {
      setHint(t('stocks.csvExportOk', { path: res.path ?? '' }))
      return
    }
    if (res.error) setHint(t('stocks.csvExportFail', { error: res.error }))
  }

  const onImportScannerCsv = async (): Promise<void> => {
    const res = await window.treasureChest.importStocksScannerCsv()
    if (res.ok) {
      setHint(t('stocks.csvImportOk', { count: res.count ?? 0 }))
      await refresh()
      return
    }
    if (res.error) setHint(t('stocks.csvImportFail', { error: res.error }))
  }

  const onExportScannerCsv = async (): Promise<void> => {
    const res = await window.treasureChest.exportStocksScannerCsv()
    if (res.ok) {
      setHint(t('stocks.csvExportOk', { path: res.path ?? '' }))
      return
    }
    if (res.error) setHint(t('stocks.csvExportFail', { error: res.error }))
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1 className={styles.title}>{t('stocks.title')}</h1>
          <p className={styles.subtitle}>{t('stocks.subtitle')}</p>
        </div>
        <p className={styles.disclaimer}>{t('stocks.disclaimer')}</p>
      </header>

      <div className={`${styles.card} ${styles.reportCard}`}>
        <div className={styles.reportHead}>
          <div>
            <h2>{t('stocks.reportTitle')}</h2>
            {report ? (
              <p className={styles.reportMeta}>
                {t('stocks.generatedAt', { time: new Date(report.generatedAt).toLocaleString() })}
              </p>
            ) : null}
          </div>
          <button type="button" className={styles.primaryBtn} disabled={running || loading} onClick={() => void onGenerate()}>
            {running ? t('stocks.generating') : t('stocks.generateNow')}
          </button>
        </div>

        <div className={styles.marketStatusRow}>
          {(['CN', 'US'] as const).map((m) => {
            const st = report?.marketStatus?.[m] ?? getMarketSessionStatus(m)
            return (
              <span
                key={m}
                className={`${styles.marketStatusChip} ${st.open ? styles.marketStatusOpen : styles.marketStatusClosed}`}
                title={st.reason}
              >
                {m} · {st.open ? t('stocks.marketStatus.open') : t('stocks.marketStatus.closed')}
                {!st.open && st.reason ? ` · ${st.reason}` : ''}
              </span>
            )
          })}
        </div>

        {history.length > 0 ? (
          <div className={styles.historyBlock}>
            <span className={styles.historyLabel}>{t('stocks.historyTitle')}</span>
            <div className={styles.historyList}>
              {history.map((item) => (
                <button
                  key={item.date}
                  type="button"
                  className={`${styles.historyChip} ${selectedDate === item.date ? styles.historyChipActive : ''}`}
                  onClick={() => void onSelectHistory(item.date)}
                >
                  <strong>{item.date}</strong>
                  <span>{t('stocks.historyCount', { count: item.count })}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {report ? (
          <div className={styles.statusPanel}>
            <div className={styles.statusItem}>
              <span className={styles.statusKey}>{t('stocks.status.total', { count: sourceStatus.total })}</span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.statusKey}>{t('stocks.status.quoteFallback', { count: sourceStatus.quoteFallbackCount })}</span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.statusKey}>{t('stocks.status.newsHit', { count: sourceStatus.newsHitCount })}</span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.statusKey}>{t('stocks.status.cacheHit', { count: sourceStatus.cacheHitCount })}</span>
            </div>
            <div className={`${styles.statusItem} ${styles[`statusAi_${sourceStatus.ai}`]}`}>
              <span className={styles.statusKey}>{t(`stocks.status.ai.${sourceStatus.ai}`)}</span>
            </div>
          </div>
        ) : null}

        {report ? (
          <div className={styles.marketTabs}>
            {(['all', 'CN', 'US'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`${styles.marketTab} ${reportMarket === tab ? styles.marketTabActive : ''}`}
                onClick={() => setReportMarket(tab)}
              >
                {tab === 'all' ? t('stocks.marketAll') : tab}
              </button>
            ))}
          </div>
        ) : null}

        {report ? (
          <div className={styles.reportList}>
            {filteredRecommendations.length === 0 ? (
              <p className={styles.empty}>{t('stocks.emptyReportFiltered')}</p>
            ) : (
              filteredRecommendations.map((rec, idx) => (
                <StockRecommendationCard
                  key={`${rec.market}-${rec.symbol}`}
                  rec={rec}
                  rank={idx + 1}
                  visibleRanges={visibleRanges}
                  onViewTrend={() =>
                    setTrendItem({
                      market: rec.market,
                      symbol: rec.symbol,
                      name: rec.name,
                      enabled: true,
                      updatedAt: new Date().toISOString(),
                    })
                  }
                />
              ))
            )}
            <p className={styles.reportDisclaimer}>{report.disclaimer}</p>
          </div>
        ) : (
          <p className={styles.empty}>{t('stocks.emptyReport')}</p>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h2>{t('stocks.watchlistTitle')}</h2>
          <div className={styles.toolbarRow}>
            <button type="button" className={styles.ghostBtn} onClick={() => void onImportWatchlistCsv()}>
              {t('stocks.importCsv')}
            </button>
            <button type="button" className={styles.ghostBtn} onClick={() => void onExportWatchlistCsv()}>
              {t('stocks.exportCsv')}
            </button>
          </div>
        </div>
        <div className={styles.formRow}>
          <select value={market} onChange={(e) => setMarket(e.target.value as StockMarket)} className={styles.select}>
            <option value="CN">A 股</option>
            <option value="US">US</option>
          </select>
          <input
            className={styles.input}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder={t('stocks.symbolPlaceholder')}
          />
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('stocks.namePlaceholder')}
          />
          <button type="button" className={styles.primaryBtn} onClick={() => void onAdd()}>
            {t('stocks.addWatch')}
          </button>
        </div>
        <StockQuickPicks market={market} onPick={onPickSymbol} />
        <div className={styles.watchCols}>
          <div className={styles.watchCol}>
            <h3>A 股</h3>
            {grouped.CN.length === 0 ? <p className={styles.empty}>{t('stocks.emptyWatch')}</p> : null}
            {grouped.CN.map((item) => (
              <div key={`${item.market}-${item.symbol}`} className={styles.watchRow}>
                <button type="button" className={styles.watchMain} onClick={() => setTrendItem(item)}>
                  <strong>{item.symbol}</strong>
                  {item.name ? <span className={styles.watchName}>{item.name}</span> : null}
                  <span className={styles.trendHint}>{t('stocks.viewTrend')}</span>
                </button>
                <button type="button" onClick={() => void onRemove(item)} className={styles.linkBtn}>
                  {t('stocks.remove')}
                </button>
              </div>
            ))}
          </div>
          <div className={styles.watchCol}>
            <h3>US</h3>
            {grouped.US.length === 0 ? <p className={styles.empty}>{t('stocks.emptyWatch')}</p> : null}
            {grouped.US.map((item) => (
              <div key={`${item.market}-${item.symbol}`} className={styles.watchRow}>
                <button type="button" className={styles.watchMain} onClick={() => setTrendItem(item)}>
                  <strong>{item.symbol}</strong>
                  {item.name ? <span className={styles.watchName}>{item.name}</span> : null}
                  <span className={styles.trendHint}>{t('stocks.viewTrend')}</span>
                </button>
                <button type="button" onClick={() => void onRemove(item)} className={styles.linkBtn}>
                  {t('stocks.remove')}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h2>{t('stocks.scannerTitle')}</h2>
          <div className={styles.toolbarRow}>
            <button
              type="button"
              className={styles.ghostBtn}
              disabled={running}
              onClick={() => {
                void (async () => {
                  setRunning(true)
                  setHint(null)
                  try {
                    const res = await window.treasureChest.refreshStocksScanner()
                    await refresh()
                    setHint(
                      res.ok
                        ? t('stocks.scannerRefreshOk', {
                            count: res.added,
                            scanned: res.scanned,
                            news: res.meta?.newsProbed ?? 0,
                          })
                        : t('stocks.scannerRefreshFailed'),
                    )
                  } catch (err) {
                    setHint(err instanceof Error ? err.message : String(err))
                  } finally {
                    setRunning(false)
                  }
                })()
              }}
            >
              {t('stocks.refreshScanner')}
            </button>
            <button type="button" className={styles.ghostBtn} onClick={() => void onImportScannerCsv()}>
              {t('stocks.importCsv')}
            </button>
            <button type="button" className={styles.ghostBtn} onClick={() => void onExportScannerCsv()}>
              {t('stocks.exportCsv')}
            </button>
          </div>
        </div>
        <div className={styles.formRow}>
          <select value={market} onChange={(e) => setMarket(e.target.value as StockMarket)} className={styles.select}>
            <option value="CN">A 股</option>
            <option value="US">US</option>
          </select>
          <input
            className={styles.input}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder={t('stocks.symbolPlaceholder')}
          />
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('stocks.namePlaceholder')}
          />
          <button type="button" className={styles.primaryBtn} onClick={() => void onAddScanner()}>
            {t('stocks.addScanner')}
          </button>
        </div>
        <StockQuickPicks market={market} onPick={onPickSymbol} />
        <div className={styles.watchCols}>
          <div className={styles.watchCol}>
            <h3>A 股</h3>
            {scannerGrouped.CN.length === 0 ? <p className={styles.empty}>{t('stocks.emptyScanner')}</p> : null}
            {scannerGrouped.CN.map((item) => (
              <div key={`${item.market}-${item.symbol}`} className={styles.watchRow}>
                <button
                  type="button"
                  className={styles.watchMain}
                  onClick={() => setTrendItem({ ...item, note: undefined })}
                >
                  <strong>{item.symbol}</strong>
                  {item.name ? <span className={styles.watchName}>{item.name}</span> : null}
                  <span className={styles.trendHint}>{t('stocks.viewTrend')}</span>
                </button>
                <button type="button" onClick={() => void onRemoveScanner(item)} className={styles.linkBtn}>
                  {t('stocks.remove')}
                </button>
              </div>
            ))}
          </div>
          <div className={styles.watchCol}>
            <h3>US</h3>
            {scannerGrouped.US.length === 0 ? <p className={styles.empty}>{t('stocks.emptyScanner')}</p> : null}
            {scannerGrouped.US.map((item) => (
              <div key={`${item.market}-${item.symbol}`} className={styles.watchRow}>
                <button
                  type="button"
                  className={styles.watchMain}
                  onClick={() => setTrendItem({ ...item, note: undefined })}
                >
                  <strong>{item.symbol}</strong>
                  {item.name ? <span className={styles.watchName}>{item.name}</span> : null}
                  <span className={styles.trendHint}>{t('stocks.viewTrend')}</span>
                </button>
                <button type="button" onClick={() => void onRemoveScanner(item)} className={styles.linkBtn}>
                  {t('stocks.remove')}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {hint ? <p className={styles.hint}>{hint}</p> : null}
      {trendItem ? <StockTrendModal item={trendItem} onClose={() => setTrendItem(null)} /> : null}
    </section>
  )
}
