import { extname } from 'node:path'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import * as XLSX from 'xlsx'
import { logger } from '../../utils/logger'

const TEXT_EXTS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.html',
  '.htm',
  '.xml',
  '.log',
  '.tsv',
  '.yaml',
  '.yml',
  '.rst',
])

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeXmlText(xml: string): string {
  return xml
    .replace(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

async function extractPptx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const parts: string[] = []
  for (const name of names) {
    const xml = await zip.file(name)?.async('string')
    if (!xml) continue
    const text = decodeXmlText(xml)
    if (text) parts.push(text)
  }
  return parts.join('\n\n')
}

async function extractXlsx(buffer: Buffer): Promise<string> {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const parts: string[] = []
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    if (!sheet) continue
    const csv = XLSX.utils.sheet_to_csv(sheet)
    if (csv.trim()) parts.push(`## ${name}\n${csv.trim()}`)
  }
  return parts.join('\n\n')
}

async function ocrImageBuffer(buffer: Buffer, lang = 'chi_sim+eng'): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(lang)
  try {
    const result = await worker.recognize(buffer)
    return (result.data.text || '').trim()
  } finally {
    await worker.terminate()
  }
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()
    const text = String((result as { text?: string }).text || '').trim()
    if (text && text.length >= 40) return text

    // Scanned / image-only PDF: screenshot first pages and OCR.
    logger.info('PDF text thin — trying OCR via page screenshots')
    const parts: string[] = []
    const maxPages = 5
    for (let page = 1; page <= maxPages; page++) {
      try {
        const shot = (await (
          parser as unknown as {
            getScreenshot: (opts: { partial?: number[] }) => Promise<{
              pages?: Array<{ data?: Uint8Array | Buffer }>
              data?: Uint8Array | Buffer
            }>
          }
        ).getScreenshot({ partial: [page] })) as {
          pages?: Array<{ data?: Uint8Array | Buffer }>
          data?: Uint8Array | Buffer
        }
        const raw = shot.pages?.[0]?.data || shot.data
        if (!raw) break
        const imgBuf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
        const ocr = await ocrImageBuffer(imgBuf)
        if (ocr) parts.push(ocr)
      } catch {
        break
      }
    }
    const ocrText = parts.join('\n\n').trim()
    if (ocrText) return ocrText
    if (text) return text
    throw new Error('PDF has no extractable text (OCR also empty)')
  } finally {
    await parser.destroy().catch(() => undefined)
  }
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  fileName: string,
  mime?: string,
): Promise<{ text: string; mime: string }> {
  const ext = extname(fileName).toLowerCase()
  const lowerMime = (mime || '').toLowerCase()

  try {
    if (
      ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff'].includes(ext) ||
      lowerMime.startsWith('image/')
    ) {
      const text = await ocrImageBuffer(buffer)
      if (!text) throw new Error('OCR produced empty text')
      return { text, mime: lowerMime || 'image/png' }
    }

    if (ext === '.pdf' || lowerMime.includes('pdf')) {
      const text = await extractPdf(buffer)
      if (!text) throw new Error('PDF has no extractable text (may be scanned images)')
      return { text, mime: 'application/pdf' }
    }

    if (ext === '.docx' || lowerMime.includes('wordprocessingml')) {
      const result = await mammoth.extractRawText({ buffer })
      const text = (result.value || '').trim()
      if (!text) throw new Error('DOCX has no extractable text')
      return { text, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    }

    if (ext === '.pptx' || lowerMime.includes('presentationml')) {
      const text = (await extractPptx(buffer)).trim()
      if (!text) throw new Error('PPTX has no extractable text')
      return {
        text,
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }
    }

    if (
      ext === '.xlsx' ||
      ext === '.xls' ||
      lowerMime.includes('spreadsheetml') ||
      lowerMime.includes('excel')
    ) {
      const text = (await extractXlsx(buffer)).trim()
      if (!text) throw new Error('Spreadsheet is empty')
      return {
        text,
        mime:
          ext === '.xls'
            ? 'application/vnd.ms-excel'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }
    }

    if (ext === '.html' || ext === '.htm' || lowerMime.includes('text/html')) {
      const text = stripHtml(buffer.toString('utf8'))
      if (!text) throw new Error('HTML has no extractable text')
      return { text, mime: 'text/html' }
    }

    if (TEXT_EXTS.has(ext) || lowerMime.startsWith('text/') || lowerMime.includes('json')) {
      const text = buffer.toString('utf8').trim()
      if (!text) throw new Error('empty text')
      const guessed =
        mime?.trim() ||
        (ext === '.md' || ext === '.markdown'
          ? 'text/markdown'
          : ext === '.json'
            ? 'application/json'
            : ext === '.csv'
              ? 'text/csv'
              : 'text/plain')
      return { text, mime: guessed }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`extract failed for ${fileName}: ${msg}`)
    throw err instanceof Error ? err : new Error(msg)
  }

  throw new Error(
    `Unsupported file type: ${ext || mime || 'unknown'}. Supported: txt/md/csv/json/html/pdf/docx/pptx/xlsx/png/jpg`,
  )
}
