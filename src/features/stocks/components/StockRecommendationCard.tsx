import { useState } from 'react'
import type { StockRecommendation, StocksRangeKey } from '@shared'
import { useTranslation } from 'react-i18next'
import { IconCopy } from '@renderer/shared/ui/icons'
import { Sparkline } from './Sparkline'
import styles from './StockRecommendationCard.module.css'

function fmtPct(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function pctClass(value: number): string {
  if (value > 0.05) return styles.pctUp
  if (value < -0.05) return styles.pctDown
  return styles.pctFlat
}

function rangeValue(ranges: StockRecommendation['ranges'] | undefined, key: StocksRangeKey): number {
  const v = ranges?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function cleanNewsTitle(title: string): string {
  return title
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface StockRecommendationCardProps {
  rec: StockRecommendation
  rank: number
  visibleRanges?: StocksRangeKey[]
  onViewTrend?: () => void
}

export function StockRecommendationCard({
  rec,
  rank,
  visibleRanges = ['d1', 'w1', 'm1', 'm3', 'm6', 'ytd'],
  onViewTrend,
}: StockRecommendationCardProps): React.JSX.Element {
  const { t } = useTranslation()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const signalClass =
    rec.signal === 'buy' ? styles.signalBuy : rec.signal === 'watch' ? styles.signalWatch : styles.signalAvoid

  const ranges = visibleRanges.map((key) => ({
    key: t(`stocks.range.${key}`),
    value: rangeValue(rec.ranges, key),
  }))

  const excessKeys = (['w1', 'm1', 'm3', 'ytd'] as StocksRangeKey[]).filter((k) => visibleRanges.includes(k))
  const excess = excessKeys.map((key) => ({
    key: t(`stocks.range.${key}`),
    value: rangeValue(rec.benchmark.excess, key),
  }))

  const onCopyNewsLink = async (url: string, key: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedKey(key)
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev))
      }, 1600)
    } catch {
      setCopiedKey(`fail:${key}`)
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === `fail:${key}` ? null : prev))
      }, 1600)
    }
  }

  return (
    <article className={styles.card}>
      <div className={styles.cardGlow} aria-hidden />
      <header className={styles.header}>
        <div className={styles.rankBadge}>{rank}</div>
        <div className={styles.identity}>
          <div className={styles.symbolRow}>
            <h3 className={styles.symbol}>{rec.symbol}</h3>
            <span className={styles.marketTag}>{rec.market}</span>
            <span className={`${styles.sourceTag} ${styles[`source_${rec.source}`]}`}>
              {t(`stocks.source.${rec.source}`)}
            </span>
            {rec.fromCache ? <span className={styles.cacheTag}>{t('stocks.fromCache')}</span> : null}
            {onViewTrend ? (
              <button type="button" className={styles.trendBtn} onClick={onViewTrend}>
                {t('stocks.viewTrend')}
              </button>
            ) : null}
          </div>
          {rec.name ? <p className={styles.name}>{rec.name}</p> : null}
        </div>
        <div className={styles.headerRight}>
          <div className={`${styles.signalBadge} ${signalClass}`}>{t(`stocks.signal.${rec.signal}`)}</div>
          <div className={styles.scoreRing} style={{ '--score': rec.score } as React.CSSProperties}>
            <span className={styles.scoreValue}>{rec.score}</span>
            <span className={styles.scoreLabel}>{t('stocks.score')}</span>
          </div>
        </div>
      </header>

      <div className={styles.priceRow}>
        <div>
          <span className={styles.priceLabel}>{t('stocks.latestPrice')}</span>
          <p className={styles.price}>
            <span className={styles.currency}>{rec.currency}</span>
            {rec.price > 0 ? rec.price.toFixed(2) : '—'}
          </p>
          {rec.sparkline && rec.sparkline.length > 1 ? (
            <div className={styles.sparkWrap}>
              <Sparkline values={rec.sparkline} />
            </div>
          ) : null}
        </div>
        <div className={styles.rangeGrid}>
          {ranges.map((item) => (
            <div key={item.key} className={styles.rangeCell}>
              <span className={styles.rangeKey}>{item.key}</span>
              <span className={`${styles.rangeValue} ${pctClass(item.value)}`}>{fmtPct(item.value)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.benchmarkRow}>
        <span className={styles.benchmarkLabel}>
          {t('stocks.vsBenchmark', { symbol: rec.benchmark.symbol })}
        </span>
        <div className={styles.excessChips}>
          {excess.map((item) => (
            <span key={item.key} className={`${styles.excessChip} ${pctClass(item.value)}`}>
              {item.key} {fmtPct(item.value)}
            </span>
          ))}
        </div>
      </div>

      <section className={styles.infoBlock}>
        <h4>{t('stocks.companyIntroTitle')}</h4>
        <p>{rec.companyIntro?.trim() || t('stocks.companyIntroMissing')}</p>
      </section>

      <blockquote className={styles.summary}>{rec.summary}</blockquote>

      <section className={`${styles.infoBlock} ${styles.outlookBlock}`}>
        <h4>{t('stocks.outlookTitle')}</h4>
        <p>{rec.outlook?.trim() || t('stocks.outlookMissing')}</p>
      </section>

      <div className={styles.insightGrid}>
        <section className={styles.insightBlock}>
          <h4>{t('stocks.reasonsTitle')}</h4>
          <ul>
            {rec.reasons.map((reason, idx) => (
              <li key={`${rec.symbol}-r-${idx}`}>{reason}</li>
            ))}
          </ul>
        </section>
        <section className={`${styles.insightBlock} ${styles.riskBlock}`}>
          <h4>{t('stocks.risksTitle')}</h4>
          <ul>
            {rec.risks.map((risk, idx) => (
              <li key={`${rec.symbol}-k-${idx}`}>{risk}</li>
            ))}
          </ul>
        </section>
      </div>

      {rec.news.length > 0 ? (
        <section className={styles.newsSection}>
          <h4>{t('stocks.newsTitle')}</h4>
          <div className={styles.newsList}>
            {rec.news.slice(0, 6).map((news, idx) => {
              const key = `${rec.symbol}-n-${idx}`
              const copied = copiedKey === key
              const failed = copiedKey === `fail:${key}`
              const title = cleanNewsTitle(news.title)
              const sourceKey = news.source ? `stocks.newsSource.${news.source}` : null
              return (
                <div key={key} className={styles.newsItem}>
                  <span className={`${styles.sentiment} ${styles[`sentiment_${news.sentiment}`]}`}>
                    {t(`stocks.sentiment.${news.sentiment}`)}
                  </span>
                  {sourceKey ? (
                    <span className={styles.newsSource} title={t(sourceKey)}>
                      {t(sourceKey)}
                    </span>
                  ) : null}
                  <a
                    href={news.url}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.newsTitle}
                    title={news.url}
                  >
                    {title}
                  </a>
                  <button
                    type="button"
                    className={styles.copyLinkBtn}
                    onClick={() => void onCopyNewsLink(news.url, key)}
                    title={t('stocks.copyNewsLink')}
                    aria-label={t('stocks.copyNewsLink')}
                  >
                    <IconCopy />
                    <span>
                      {copied
                        ? t('stocks.copyNewsLinkDone')
                        : failed
                          ? t('stocks.copyNewsLinkFail')
                          : t('stocks.copyNewsLink')}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}
    </article>
  )
}
