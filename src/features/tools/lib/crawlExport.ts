import * as XLSX from 'xlsx'

export type CrawlTable = {
  headers: string[]
  rows: string[][]
  caption?: string
}

export type CrawlLink = { href: string; text: string }

export type CrawlSnapshot = {
  ok: boolean
  url: string
  finalUrl?: string
  status?: number
  contentType?: string | null
  encoding?: string
  title?: string
  text?: string
  tables?: CrawlTable[]
  links?: CrawlLink[]
  truncated?: boolean
  retrievedAt: string
  error?: string
}

/** Escape one CSV field (RFC-ish). */
export function csvEscape(value: string): string {
  const s = value ?? ''
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function tableToCsv(table: CrawlTable): string {
  const lines: string[] = []
  if (table.headers.length) {
    lines.push(table.headers.map(csvEscape).join(','))
  }
  for (const row of table.rows) {
    const cells = table.headers.length
      ? table.headers.map((_, i) => csvEscape(row[i] ?? ''))
      : row.map(csvEscape)
    lines.push(cells.join(','))
  }
  return lines.join('\n')
}

export function linksToTable(links: CrawlLink[]): CrawlTable {
  return {
    headers: ['text', 'href'],
    rows: links.map((l) => [l.text || '', l.href]),
  }
}

export function tablesToWorkbook(tables: CrawlTable[], sheetPrefix = 'Sheet'): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()
  tables.forEach((table, idx) => {
    const base = (table.caption || `${sheetPrefix}${idx + 1}`)
      .replace(/[\\/?*[\]:]/g, '_')
      .slice(0, 28)
    let name = base || `${sheetPrefix}${idx + 1}`
    let n = 2
    while (used.has(name)) {
      name = `${base.slice(0, 26)}_${n++}`
    }
    used.add(name)
    const aoa = [table.headers, ...table.rows]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(wb, ws, name)
  })
  if (!wb.SheetNames.length) {
    const ws = XLSX.utils.aoa_to_sheet([['(empty)']])
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  }
  return wb
}

export function workbookToUint8Array(wb: XLSX.WorkBook): Uint8Array {
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function downloadText(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  // BOM helps Excel open UTF-8 CSV correctly
  const body = mime.includes('csv') ? `\uFEFF${content}` : content
  downloadBlob(filename, new Blob([body], { type: mime }))
}

export function downloadXlsx(filename: string, tables: CrawlTable[]): void {
  const wb = tablesToWorkbook(tables)
  const bytes = workbookToUint8Array(wb)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  downloadBlob(
    filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`,
    new Blob([copy], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
}

export function stampName(prefix: string, ext: string): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
  return `${prefix}-${stamp}.${ext}`
}
