import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { app } from 'electron'
import {
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFArray,
  PDFDict,
  PDFNumber,
  PDFBool,
  decodePDFRawStream,
} from 'pdf-lib'
import { logger } from '../../utils/logger'
import { getFfmpegBinary, checkFfmpegAvailable } from './VideoFfmpeg'

function jpegQFromQuality(quality: number): number {
  // ffmpeg -q:v: 2 (best) … 31 (worst). Map UI 40–95 → ~12–2
  const q = Math.min(95, Math.max(40, quality))
  return Math.round(2 + ((95 - q) / 55) * 10)
}

function maxEdgeFromQuality(quality: number): number {
  if (quality < 55) return 1280
  if (quality < 70) return 1600
  if (quality < 85) return 2048
  return 2880
}

function runFfmpeg(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(getFfmpegBinary(), args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? 1, stderr }))
  })
}

async function ffmpegToJpeg(
  inputPath: string,
  outputPath: string,
  quality: number,
  maxEdge: number,
): Promise<Uint8Array | null> {
  const qv = jpegQFromQuality(quality)
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-vf',
    `scale='min(${maxEdge},iw)':'min(${maxEdge},ih)':force_original_aspect_ratio=decrease`,
    '-q:v',
    String(qv),
    outputPath,
  ]
  const { code, stderr } = await runFfmpeg(args)
  if (code !== 0) {
    logger.warn(`pdf jpeg recompress ffmpeg failed: ${stderr.slice(-200)}`)
    return null
  }
  if (!existsSync(outputPath)) return null
  return new Uint8Array(await readFile(outputPath))
}

function filterIs(dict: PDFDict, name: string): boolean {
  const filter = dict.get(PDFName.of('Filter'))
  if (!filter) return false
  if (filter instanceof PDFName) return filter === PDFName.of(name)
  if (filter instanceof PDFArray) {
    for (let i = 0; i < filter.size(); i++) {
      const item = filter.get(i)
      if (item === PDFName.of(name)) return true
    }
  }
  return false
}

function colorSpaceIsDeviceRgb(dict: PDFDict): boolean {
  const cs = dict.get(PDFName.of('ColorSpace'))
  return cs === PDFName.of('DeviceRGB')
}

function readNumber(dict: PDFDict, key: string): number | null {
  const v = dict.get(PDFName.of(key))
  if (v instanceof PDFNumber) return v.asNumber()
  return null
}

function collectSMaskRefs(doc: PDFDocument): Set<string> {
  const refs = new Set<string>()
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    const smask = obj.dict.get(PDFName.of('SMask'))
    if (smask) refs.add(String(smask))
  }
  return refs
}

function writePpm(path: string, width: number, height: number, rgb: Uint8Array): Promise<void> {
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`, 'utf8')
  return writeFile(path, Buffer.concat([header, Buffer.from(rgb)]))
}

/**
 * Recompress embedded PDF images (JPEG / DeviceRGB) via FFmpeg, then rewrite with object streams.
 * Skips soft masks / stencil masks. Keeps text selectable.
 */
export async function recompressPdfImages(
  bytes: Uint8Array,
  jpegQuality: number,
): Promise<{ bytes: Uint8Array; imagesTouched: number; imagesShrunk: number }> {
  const check = checkFfmpegAvailable()
  if (!check.ok) {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const saved = await doc.save({ useObjectStreams: true, addDefaultPage: false })
    return { bytes: saved, imagesTouched: 0, imagesShrunk: 0 }
  }

  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const smasks = collectSMaskRefs(doc)
  const tmpDir = join(app.getPath('temp'), `treasure-pdf-img-${Date.now()}`)
  await mkdir(tmpDir, { recursive: true })
  const maxEdge = maxEdgeFromQuality(jpegQuality)
  let imagesTouched = 0
  let imagesShrunk = 0
  let idx = 0

  try {
    for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue
      const { dict } = obj
      if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue
      if (smasks.has(String(ref))) continue
      if (dict.has(PDFName.of('SMask'))) continue
      {
        const im = dict.lookupMaybe(PDFName.of('ImageMask'), PDFBool)
        if (im?.asBoolean()) continue
      }
      if (dict.has(PDFName.of('Mask')) || dict.has(PDFName.of('Decode'))) continue

      const width = readNumber(dict, 'Width')
      const height = readNumber(dict, 'Height')
      if (!width || !height || width < 32 || height < 32) continue

      const bpc = readNumber(dict, 'BitsPerComponent') ?? 8
      const original = obj.getContents()
      if (original.byteLength < 2048) continue

      idx += 1
      const inPath = join(tmpDir, `in-${idx}`)
      const outPath = join(tmpDir, `out-${idx}.jpg`)
      let prepared = false

      try {
        if (filterIs(dict, 'DCTDecode')) {
          await writeFile(inPath, Buffer.from(original))
          prepared = true
        } else if (filterIs(dict, 'FlateDecode') && colorSpaceIsDeviceRgb(dict) && bpc === 8) {
          try {
            const decoded = decodePDFRawStream(obj).decode()
            if (decoded.length < width * height * 3) continue
            await writePpm(`${inPath}.ppm`, width, height, decoded.subarray(0, width * height * 3))
            const jpeg = await ffmpegToJpeg(`${inPath}.ppm`, outPath, jpegQuality, maxEdge)
            await unlink(`${inPath}.ppm`).catch(() => undefined)
            if (!jpeg || jpeg.byteLength >= original.byteLength) continue
            imagesTouched += 1
            imagesShrunk += 1
            const newDict = doc.context.obj({
              Type: 'XObject',
              Subtype: 'Image',
              Width: width,
              Height: height,
              ColorSpace: 'DeviceRGB',
              BitsPerComponent: 8,
              Filter: 'DCTDecode',
              Length: jpeg.byteLength,
            })
            doc.context.assign(ref, PDFRawStream.of(newDict, jpeg))
            continue
          } catch (err) {
            logger.warn(`pdf flate image skip: ${err instanceof Error ? err.message : String(err)}`)
            continue
          }
        } else {
          continue
        }

        if (!prepared) continue
        const jpeg = await ffmpegToJpeg(inPath, outPath, jpegQuality, maxEdge)
        await unlink(inPath).catch(() => undefined)
        await unlink(outPath).catch(() => undefined)
        if (!jpeg) continue
        imagesTouched += 1
        if (jpeg.byteLength >= original.byteLength * 0.98) continue
        imagesShrunk += 1
        const newDict = doc.context.obj({
          Type: 'XObject',
          Subtype: 'Image',
          Width: width,
          Height: height,
          ColorSpace: 'DeviceRGB',
          BitsPerComponent: 8,
          Filter: 'DCTDecode',
          Length: jpeg.byteLength,
        })
        doc.context.assign(ref, PDFRawStream.of(newDict, jpeg))
      } catch (err) {
        logger.warn(`pdf image recompress skip: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    const saved = await doc.save({ useObjectStreams: true, addDefaultPage: false })
    return { bytes: saved, imagesTouched, imagesShrunk }
  } finally {
    // best-effort cleanup
    try {
      const { rmSync } = await import('node:fs')
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}
