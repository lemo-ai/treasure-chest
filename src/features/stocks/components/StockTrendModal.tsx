import { useEffect, useState } from 'react'
import type { StockQuoteDetail, StocksRangeKey, WatchlistItem } from '@shared'
import { useTranslation } from 'react-i18next'
import { TrendChart } from './TrendChart'
import styles from './StockTrendModal.module.css'

interface StockTrendModalProps {
  item: WatchlistItem
  onClose: () => void
}

const RANGE_TABS: StocksRangeKey[] = ['w1', 'm1', 'm3', 'm6', 'ytd', 'y1']

export function StockTrendModal({ item, onClose }: StockTrendModalProps): React.JSX.Element {
  const { t } = useTranslation()
  const [detail, setDetail] = useState<StockQuoteDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rangeKey, setRangeKey] = useState<StocksRangeKey>('m3')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void window.treasureChest
      .getStockQuote({ market: item.market, symbol: item.symbol, name: item.name })
      .then((next) => {
        if (!cancelled) {
          setDetail(next)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(String(err))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [item.market, item.symbol, item.name])

  const fmtPct = (v: number): string => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
  const pctClass = (v: number): string =>
    v > 0.05 ? styles.up : v < -0.05 ? styles.down : styles.flat

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t('stocks.trendTitle')}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>
              {item.symbol}
              {item.name ? <span className={styles.name}>{item.name}</span> : null}
            </h2>
            <p className={styles.sub}>{t('stocks.trendSubtitle')}</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            {t('stocks.trendClose')}
          </button>
        </header>

        {loading ? <p className={styles.hint}>{t('stocks.trendLoading')}</p> : null}
        {error ? <p className={styles.error}>{t('stocks.trendFail', { error })}</p> : null}

        {detail ? (
          <>
            <div className={styles.priceRow}>
              <div>
                <span className={styles.priceLabel}>{t('stocks.latestPrice')}</span>
                <p className={styles.price}>
                  <span className={styles.currency}>{detail.currency}</span>
                  {detail.price.toFixed(2)}
                </p>
              </div>
              {detail.fromCache ? <span className={styles.cacheTag}>{t('stocks.fromCache')}</span> : null}
            </div>

            <div className={styles.tabs}>
              {RANGE_TABS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.tab} ${rangeKey === key ? styles.tabActive : ''}`}
                  onClick={() => setRangeKey(key)}
                >
                  {t(`stocks.range.${key}`)}
                </button>
              ))}
            </div>

            <TrendChart bars={detail.bars} rangeKey={rangeKey} />

            <div className={styles.rangeGrid}>
              {(['d1', 'w1', 'm1', 'm3', 'm6', 'ytd', 'y1'] as StocksRangeKey[]).map((key) => (
                <div key={key} className={styles.rangeCell}>
                  <span>{t(`stocks.range.${key}`)}</span>
                  <strong className={pctClass(detail.ranges[key])}>{fmtPct(detail.ranges[key])}</strong>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
