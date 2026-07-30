import { dialog } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { getMainWindow } from '../../windows/mainWindowRef'
import { stocksStore } from './StocksStore'

function parseLine(line: string): string[] {
  return line
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

function isMarket(v: string): v is 'CN' | 'US' {
  return v === 'CN' || v === 'US'
}

export async function importStocksCsv(kind: 'watchlist' | 'scanner'): Promise<{ ok: boolean; count?: number; error?: string }> {
  const parent = getMainWindow()
  const result = parent
    ? await dialog.showOpenDialog(parent, {
        title: kind === 'watchlist' ? 'Import watchlist CSV' : 'Import scanner CSV',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        properties: ['openFile'],
      })
    : await dialog.showOpenDialog({
        title: kind === 'watchlist' ? 'Import watchlist CSV' : 'Import scanner CSV',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        properties: ['openFile'],
      })
  if (result.canceled || !result.filePaths[0]) return { ok: false }
  try {
    const text = readFileSync(result.filePaths[0], 'utf8')
    const lines = text
      .split(/\r?\n/g)
      .map((l) => l.trim())
      .filter(Boolean)
    const dataLines = lines[0]?.toLowerCase().includes('market') ? lines.slice(1) : lines
    let count = 0
    for (const line of dataLines) {
      const cols = parseLine(line)
      if (cols.length < 2) continue
      const market = cols[0]!.toUpperCase()
      const symbol = cols[1]!
      const name = cols[2]
      if (!isMarket(market)) continue
      if (kind === 'watchlist') {
        stocksStore.upsertWatchlistItem({ market, symbol, name })
      } else {
        stocksStore.upsertScannerPoolItem({ market, symbol, name })
      }
      count += 1
    }
    return { ok: true, count }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function exportStocksCsv(kind: 'watchlist' | 'scanner'): Promise<{ ok: boolean; path?: string; error?: string }> {
  const parent = getMainWindow()
  const stamp = new Date().toISOString().slice(0, 10)
  const result = parent
    ? await dialog.showSaveDialog(parent, {
        title: kind === 'watchlist' ? 'Export watchlist CSV' : 'Export scanner CSV',
        defaultPath: `${kind}-${stamp}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
    : await dialog.showSaveDialog({
        title: kind === 'watchlist' ? 'Export watchlist CSV' : 'Export scanner CSV',
        defaultPath: `${kind}-${stamp}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
  if (result.canceled || !result.filePath) return { ok: false }
  try {
    const rows = kind === 'watchlist' ? stocksStore.getWatchlist() : stocksStore.getScannerPool()
    const body = ['market,symbol,name']
      .concat(rows.map((r) => `${r.market},${r.symbol},${r.name ?? ''}`))
      .join('\n')
    writeFileSync(result.filePath, body, 'utf8')
    return { ok: true, path: result.filePath }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
