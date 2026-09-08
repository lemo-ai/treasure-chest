import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'
import { BrowserWindow, dialog } from 'electron'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from 'docx'
import { logger } from '../../utils/logger'

export interface DocOpResult {
  ok: boolean
  path?: string
  error?: string
  pageCount?: number
  bytesBefore?: number
  bytesAfter?: number
}

function candidateUnicodeFonts(): string[] {
  const home = homedir()
  return [
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/Library/Fonts/Arial Unicode.ttf',
    '/System/Library/Fonts/STHeiti Light.ttc',
    '/System/Library/Fonts/PingFang.ttc',
    'C:\\Windows\\Fonts\\msyh.ttc',
    'C:\\Windows\\Fonts\\msyh.ttf',
    'C:\\Windows\\Fonts\\simhei.ttf',
    'C:\\Windows\\Fonts\\simsun.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
    join(home, '.fonts/NotoSansSC-Regular.otf'),
  ]
}

async function embedTextFont(doc: PDFDocument, preferUnicode: boolean): Promise<PDFFont> {
  doc.registerFontkit(fontkit)
  if (preferUnicode) {
    for (const p of candidateUnicodeFonts()) {
      if (!existsSync(p)) continue
      try {
        const bytes = await readFile(p)
        return await doc.embedFont(bytes, { subset: true })
      } catch (err) {
        logger.warn(`font embed failed ${p}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
  return doc.embedFont(StandardFonts.Helvetica)
}

async function pickOpenPdfs(): Promise<string[]> {
  const win = BrowserWindow.getFocusedWindow()
  const opts: Electron.OpenDialogOptions = {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (result.canceled) return []
  return result.filePaths
}

async function pickOpenPdf(): Promise<string | null> {
  const files = await pickOpenPdfs()
  return files[0] ?? null
}

async function chooseSave(defaultName: string, extensions: string[]): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow()
  const opts: Electron.SaveDialogOptions = {
    defaultPath: defaultName,
    filters: [{ name: 'Document', extensions }],
  }
  const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (result.canceled || !result.filePath) return null
  return result.filePath
}

export async function mergePdfs(payload?: { paths?: string[] }): Promise<DocOpResult> {
  try {
    const paths = payload?.paths?.length ? payload.paths : await pickOpenPdfs()
    if (paths.length < 2) return { ok: false, error: 'need at least 2 PDFs' }
    const merged = await PDFDocument.create()
    for (const p of paths) {
      const bytes = await readFile(p)
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const pages = await merged.copyPages(src, src.getPageIndices())
      for (const page of pages) merged.addPage(page)
    }
    const out = await chooseSave(`merged-${Date.now()}.pdf`, ['pdf'])
    if (!out) return { ok: false, error: 'cancelled' }
    await writeFile(out, await merged.save())
    return { ok: true, path: out, pageCount: merged.getPageCount() }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`mergePdfs failed: ${msg}`)
    return { ok: false, error: msg }
  }
}

export async function splitPdf(payload?: {
  path?: string
  /** 1-based inclusive ranges like "1-3,5" */
  ranges?: string
}): Promise<DocOpResult> {
  try {
    const path = payload?.path || (await pickOpenPdf())
    if (!path) return { ok: false, error: 'cancelled' }
    const bytes = await readFile(path)
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const total = src.getPageCount()
    const ranges = parsePageRanges(payload?.ranges || `1-${total}`, total)
    if (!ranges.length) return { ok: false, error: 'invalid page ranges' }

    const outDoc = await PDFDocument.create()
    for (const pageIndex of ranges) {
      const [copied] = await outDoc.copyPages(src, [pageIndex])
      outDoc.addPage(copied)
    }
    const base = basename(path, '.pdf')
    const out = await chooseSave(`${base}-split.pdf`, ['pdf'])
    if (!out) return { ok: false, error: 'cancelled' }
    await writeFile(out, await outDoc.save())
    return { ok: true, path: out, pageCount: outDoc.getPageCount() }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`splitPdf failed: ${msg}`)
    return { ok: false, error: msg }
  }
}

/** Parse "1-3,5,8-9" into 0-based page indices. */
export function parsePageRanges(input: string, totalPages: number): number[] {
  const set = new Set<number>()
  for (const part of input.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d+)\s*[-–~]\s*(\d+)$/.exec(part)
    if (m) {
      let a = Number(m[1])
      let b = Number(m[2])
      if (a > b) [a, b] = [b, a]
      for (let i = a; i <= b; i++) {
        if (i >= 1 && i <= totalPages) set.add(i - 1)
      }
      continue
    }
    const n = Number(part)
    if (Number.isInteger(n) && n >= 1 && n <= totalPages) set.add(n - 1)
  }
  return [...set].sort((a, b) => a - b)
}

export async function exportTextAsPdf(payload: {
  content: string
  defaultName?: string
}): Promise<DocOpResult> {
  try {
    const text = payload.content.replace(/\r\n/g, '\n')
    if (!text.trim()) return { ok: false, error: 'empty content' }
    const needsUnicode = /[^\u0000-\u00FF]/.test(text)
    const out = await chooseSave(payload.defaultName || `document-${Date.now()}.pdf`, ['pdf'])
    if (!out) return { ok: false, error: 'cancelled' }

    const doc = await PDFDocument.create()
    let font: PDFFont
    try {
      font = await embedTextFont(doc, needsUnicode)
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'No Unicode font found for PDF export. Install Noto Sans CJK or use Export DOCX.',
      }
    }
    if (needsUnicode && font.name.toLowerCase().includes('helvetica')) {
      return {
        ok: false,
        error:
          'No CJK system font found (tried Arial Unicode / 微软雅黑 / Noto). Use Export DOCX, or install a Unicode TTF.',
      }
    }

    const fontSize = 11
    const lineHeight = 16
    const margin = 48
    const pageWidth = 595.28
    const pageHeight = 841.89
    const maxWidth = pageWidth - margin * 2

    const paragraphs = text.split('\n')
    let page = doc.addPage([pageWidth, pageHeight])
    let y = pageHeight - margin

    const drawLine = (line: string): void => {
      if (y < margin + lineHeight) {
        page = doc.addPage([pageWidth, pageHeight])
        y = pageHeight - margin
      }
      page.drawText(line || ' ', {
        x: margin,
        y: y - fontSize,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1),
      })
      y -= lineHeight
    }

    for (const para of paragraphs) {
      if (!para) {
        y -= lineHeight * 0.6
        continue
      }
      let rest = para
      while (rest.length) {
        let lo = 1
        let hi = rest.length
        let fit = 1
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2)
          const w = font.widthOfTextAtSize(rest.slice(0, mid), fontSize)
          if (w <= maxWidth) {
            fit = mid
            lo = mid + 1
          } else hi = mid - 1
        }
        // Avoid splitting surrogate pairs mid-char
        if (fit < rest.length && /[\uD800-\uDBFF]/.test(rest[fit - 1] || '')) fit -= 1
        if (fit < 1) fit = 1
        drawLine(rest.slice(0, fit))
        rest = rest.slice(fit)
      }
    }

    await writeFile(out, await doc.save({ useObjectStreams: true }))
    return { ok: true, path: out, pageCount: doc.getPageCount() }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`exportTextAsPdf failed: ${msg}`)
    return { ok: false, error: msg }
  }
}

export async function exportTextAsDocx(payload: {
  content: string
  defaultName?: string
}): Promise<DocOpResult> {
  try {
    const text = payload.content.replace(/\r\n/g, '\n')
    if (!text.trim()) return { ok: false, error: 'empty content' }
    const out = await chooseSave(payload.defaultName || `document-${Date.now()}.docx`, ['docx'])
    if (!out) return { ok: false, error: 'cancelled' }

    const children: Paragraph[] = []
    for (const line of text.split('\n')) {
      if (line.startsWith('# ')) {
        children.push(
          new Paragraph({
            text: line.slice(2),
            heading: HeadingLevel.HEADING_1,
          }),
        )
      } else if (line.startsWith('## ')) {
        children.push(
          new Paragraph({
            text: line.slice(3),
            heading: HeadingLevel.HEADING_2,
          }),
        )
      } else {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line || ' ', size: 22 })],
          }),
        )
      }
    }

    const doc = new Document({
      sections: [{ properties: {}, children }],
    })
    const buf = await Packer.toBuffer(doc)
    await writeFile(out, buf)
    return { ok: true, path: out }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`exportTextAsDocx failed: ${msg}`)
    return { ok: false, error: msg }
  }
}

export async function probePdfPageCount(path: string): Promise<DocOpResult> {
  try {
    const bytes = await readFile(path)
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
    return { ok: true, path, pageCount: src.getPageCount() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Rebuild PDF; recompress embedded JPEG/RGB images via FFmpeg when available. */
export async function compressPdf(payload?: {
  path?: string
  /** Target JPEG quality for embedded images (40–95). */
  jpegQuality?: number
}): Promise<DocOpResult> {
  try {
    const path = payload?.path || (await pickOpenPdf())
    if (!path) return { ok: false, error: 'cancelled' }
    const before = await readFile(path)
    const quality = Math.min(95, Math.max(40, Math.round(payload?.jpegQuality ?? 75)))
    const { recompressPdfImages } = await import('./PdfImageCompress')
    const { bytes: after, imagesShrunk } = await recompressPdfImages(
      new Uint8Array(before),
      quality,
    )
    // If recompress grew the file, fall back to structural rebuild only.
    let outBytes = after
    if (after.byteLength >= before.byteLength) {
      const src = await PDFDocument.load(before, { ignoreEncryption: true })
      const outDoc = await PDFDocument.create()
      const pages = await outDoc.copyPages(src, src.getPageIndices())
      for (const page of pages) outDoc.addPage(page)
      outBytes = await outDoc.save({ useObjectStreams: true, addDefaultPage: false })
      logger.info(
        `compressPdf: image pass no gain (touched shrink=${imagesShrunk}); structural save ${before.byteLength}→${outBytes.byteLength}`,
      )
    } else {
      logger.info(
        `compressPdf: image recompress shrunk ${imagesShrunk} imgs ${before.byteLength}→${after.byteLength}`,
      )
    }
    const out = await chooseSave(`${basename(path, '.pdf')}-compressed.pdf`, ['pdf'])
    if (!out) return { ok: false, error: 'cancelled' }
    await writeFile(out, outBytes)
    const pageDoc = await PDFDocument.load(outBytes, { ignoreEncryption: true })
    return {
      ok: true,
      path: out,
      pageCount: pageDoc.getPageCount(),
      bytesBefore: before.byteLength,
      bytesAfter: outBytes.byteLength,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`compressPdf failed: ${msg}`)
    return { ok: false, error: msg }
  }
}

/** Password-protect a PDF (open password). */
export async function encryptPdf(payload: {
  path?: string
  userPassword: string
  ownerPassword?: string
  allowPrinting?: boolean
  allowCopying?: boolean
}): Promise<DocOpResult> {
  try {
    const password = payload.userPassword.trim()
    if (!password) return { ok: false, error: 'password required' }
    const path = payload.path || (await pickOpenPdf())
    if (!path) return { ok: false, error: 'cancelled' }
    const before = await readFile(path)
    const { encryptPDF } = await import('@pdfsmaller/pdf-encrypt-lite')
    const encrypted = await encryptPDF(new Uint8Array(before), password, {
      ownerPassword: payload.ownerPassword?.trim() || password,
      allowPrinting: payload.allowPrinting !== false,
      allowCopying: payload.allowCopying === true,
      allowModifying: false,
      allowFillingForms: true,
    })
    const out = await chooseSave(`${basename(path, '.pdf')}-locked.pdf`, ['pdf'])
    if (!out) return { ok: false, error: 'cancelled' }
    await writeFile(out, Buffer.from(encrypted))
    return { ok: true, path: out }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`encryptPdf failed: ${msg}`)
    return { ok: false, error: msg }
  }
}
