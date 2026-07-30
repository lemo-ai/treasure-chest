import type { StockMarket } from '@shared'
import { useTranslation } from 'react-i18next'
import styles from './StockQuickPicks.module.css'

export const QUICK_PICKS: Record<StockMarket, Array<{ symbol: string; name: string }>> = {
  CN: [
    { symbol: '600519.SH', name: '贵州茅台' },
    { symbol: '000001.SZ', name: '平安银行' },
    { symbol: '600036.SH', name: '招商银行' },
    { symbol: '300750.SZ', name: '宁德时代' },
    { symbol: '601318.SH', name: '中国平安' },
    { symbol: '002594.SZ', name: '比亚迪' },
  ],
  US: [
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'NVDA', name: 'NVIDIA' },
    { symbol: 'AMZN', name: 'Amazon' },
    { symbol: 'META', name: 'Meta' },
    { symbol: 'GOOGL', name: 'Alphabet' },
  ],
}

interface StockQuickPicksProps {
  market: StockMarket
  onPick: (symbol: string, name: string) => void
}

export function StockQuickPicks({ market, onPick }: StockQuickPicksProps): React.JSX.Element {
  const { t } = useTranslation()
  const picks = QUICK_PICKS[market]

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>{t('stocks.quickPicks')}</span>
      <div className={styles.chips}>
        {picks.map((item) => (
          <button
            key={item.symbol}
            type="button"
            className={styles.chip}
            onClick={() => onPick(item.symbol, item.name)}
            title={item.name}
          >
            <strong>{item.symbol}</strong>
            <span>{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
