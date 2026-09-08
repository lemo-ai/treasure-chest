export type AdjustValues = {
  brightness: number
  contrast: number
  saturation: number
  hue: number
  blur: number
  sharpen: number
}

export const DEFAULT_ADJUST: AdjustValues = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
  sharpen: 0,
}

export type FilterId =
  | 'none'
  | 'grayscale'
  | 'sepia'
  | 'cool'
  | 'warm'
  | 'invert'
  | 'vintage'
  | 'fade'
  | 'vignette'
  | 'sharpen'
  | 'soft'

export type CropRatioId = '1:1' | '4:3' | '3:2' | '16:9' | '9:16' | 'free'

export type TextPosition = 'center' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image_load_failed'))
    img.src = src
  })
}

export function canvasFromImage(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unsupported')
  ctx.drawImage(img, 0, 0)
  return canvas
}

export async function dataUrlFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('file_read_failed'))
    reader.readAsDataURL(file)
  })
}

export function exportCanvas(
  canvas: HTMLCanvasElement,
  mime: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality = 0.92,
): string {
  return canvas.toDataURL(mime, quality)
}

export async function getImageSize(src: string): Promise<{ width: number; height: number }> {
  const img = await loadImageElement(src)
  return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height }
}

function buildAdjustFilter(values: AdjustValues): string {
  const parts = [
    `brightness(${values.brightness}%)`,
    `contrast(${values.contrast}%)`,
    `saturate(${values.saturation}%)`,
    `hue-rotate(${values.hue}deg)`,
  ]
  if (values.blur > 0) parts.push(`blur(${values.blur}px)`)
  // CSS has no sharpen; approximate with contrast bump when sharpen > 0
  if (values.sharpen > 0) {
    parts.push(`contrast(${100 + values.sharpen * 0.35}%)`)
  }
  return parts.join(' ')
}

export async function applyAdjust(src: string, values: AdjustValues): Promise<string> {
  const img = await loadImageElement(src)
  const canvas = canvasFromImage(img)
  const ctx = canvas.getContext('2d')!
  ctx.filter = buildAdjustFilter(values)
  ctx.drawImage(img, 0, 0)
  ctx.filter = 'none'
  if (values.sharpen > 0) {
    applyUnsharpMask(ctx, canvas.width, canvas.height, values.sharpen / 100)
  }
  return exportCanvas(canvas)
}

/** Simple unsharp-mask style pass. */
function applyUnsharpMask(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amount: number,
): void {
  const image = ctx.getImageData(0, 0, w, h)
  const data = image.data
  const copy = new Uint8ClampedArray(data)
  const strength = Math.min(1, Math.max(0, amount)) * 0.55
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4
      for (let c = 0; c < 3; c++) {
        const center = copy[i + c]!
        const up = copy[((y - 1) * w + x) * 4 + c]!
        const down = copy[((y + 1) * w + x) * 4 + c]!
        const left = copy[(y * w + x - 1) * 4 + c]!
        const right = copy[(y * w + x + 1) * 4 + c]!
        const edge = center * 5 - up - down - left - right
        data[i + c] = Math.min(255, Math.max(0, center * (1 - strength) + edge * strength))
      }
    }
  }
  ctx.putImageData(image, 0, 0)
}

export async function autoEnhance(src: string): Promise<string> {
  return applyAdjust(src, {
    brightness: 108,
    contrast: 112,
    saturation: 118,
    hue: 0,
    blur: 0,
    sharpen: 25,
  })
}

export async function applyFilter(src: string, filter: FilterId): Promise<string> {
  if (filter === 'none') return src
  const img = await loadImageElement(src)
  const canvas = canvasFromImage(img)
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height

  if (filter === 'vignette') {
    ctx.drawImage(img, 0, 0)
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    return exportCanvas(canvas)
  }

  if (filter === 'sharpen') {
    ctx.drawImage(img, 0, 0)
    applyUnsharpMask(ctx, w, h, 0.45)
    return exportCanvas(canvas)
  }

  const map: Record<Exclude<FilterId, 'none' | 'vignette' | 'sharpen'>, string> = {
    grayscale: 'grayscale(1)',
    sepia: 'sepia(0.85)',
    cool: 'saturate(0.85) hue-rotate(195deg)',
    warm: 'sepia(0.25) saturate(1.2) hue-rotate(-10deg)',
    invert: 'invert(1)',
    vintage: 'sepia(0.45) contrast(110%) saturate(0.85) brightness(102%)',
    fade: 'contrast(90%) saturate(0.7) brightness(110%)',
    soft: 'blur(0.8px) brightness(105%) contrast(95%) saturate(1.05)',
  }
  ctx.filter = map[filter]
  ctx.drawImage(img, 0, 0)
  ctx.filter = 'none'
  return exportCanvas(canvas)
}

export async function rotateImage(src: string, degrees: number): Promise<string> {
  const img = await loadImageElement(src)
  const rad = (degrees * Math.PI) / 180
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * cos + h * sin)
  canvas.height = Math.round(w * sin + h * cos)
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(rad)
  ctx.drawImage(img, -w / 2, -h / 2)
  return exportCanvas(canvas)
}

export async function flipImage(src: string, axis: 'h' | 'v'): Promise<string> {
  const img = await loadImageElement(src)
  const canvas = canvasFromImage(img)
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  if (axis === 'h') {
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
  } else {
    ctx.translate(0, canvas.height)
    ctx.scale(1, -1)
  }
  ctx.drawImage(img, 0, 0)
  ctx.restore()
  return exportCanvas(canvas)
}

export async function compressImage(
  src: string,
  mime: 'image/jpeg' | 'image/webp' | 'image/png',
  quality: number,
  maxEdge?: number,
): Promise<string> {
  const img = await loadImageElement(src)
  let w = img.naturalWidth || img.width
  let h = img.naturalHeight || img.height
  if (maxEdge && Math.max(w, h) > maxEdge) {
    const scale = maxEdge / Math.max(w, h)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
  return exportCanvas(canvas, mime, quality)
}

export async function resizeImage(
  src: string,
  width: number,
  height: number,
): Promise<string> {
  const img = await loadImageElement(src)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return exportCanvas(canvas)
}

export async function upscaleImage(src: string, scale: 2 | 3 | 4): Promise<string> {
  const img = await loadImageElement(src)
  const w = (img.naturalWidth || img.width) * scale
  const h = (img.naturalHeight || img.height) * scale
  return resizeImage(src, w, h)
}

export async function denoiseImage(src: string): Promise<string> {
  const img = await loadImageElement(src)
  const canvas = canvasFromImage(img)
  const ctx = canvas.getContext('2d')!
  ctx.filter = 'blur(0.6px) contrast(105%) saturate(102%)'
  ctx.drawImage(img, 0, 0)
  ctx.filter = 'none'
  return exportCanvas(canvas)
}

export async function replaceBackgroundColor(src: string, color: string): Promise<string> {
  const img = await loadImageElement(src)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)
  return exportCanvas(canvas)
}

const RATIO_MAP: Record<Exclude<CropRatioId, 'free'>, [number, number]> = {
  '1:1': [1, 1],
  '4:3': [4, 3],
  '3:2': [3, 2],
  '16:9': [16, 9],
  '9:16': [9, 16],
}

export async function cropByRatio(src: string, ratio: CropRatioId): Promise<string> {
  if (ratio === 'free') return src
  const [rw, rh] = RATIO_MAP[ratio]
  return cropCenter(src, rw, rh)
}

export async function cropCenter(src: string, ratioW: number, ratioH: number): Promise<string> {
  const img = await loadImageElement(src)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const target = ratioW / ratioH
  const current = w / h
  let cw = w
  let ch = h
  let sx = 0
  let sy = 0
  if (current > target) {
    cw = Math.round(h * target)
    sx = Math.round((w - cw) / 2)
  } else {
    ch = Math.round(w / target)
    sy = Math.round((h - ch) / 2)
  }
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  canvas.getContext('2d')!.drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch)
  return exportCanvas(canvas)
}

export async function addTextOverlay(
  src: string,
  opts: {
    text: string
    position: TextPosition
    fontSize: number
    color: string
    opacity: number
  },
): Promise<string> {
  const text = opts.text.trim()
  if (!text) return src
  const img = await loadImageElement(src)
  const canvas = canvasFromImage(img)
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height
  const size = Math.max(12, Math.round((Math.min(w, h) * opts.fontSize) / 100))
  ctx.font = `600 ${size}px system-ui, -apple-system, sans-serif`
  ctx.fillStyle = opts.color
  ctx.globalAlpha = Math.min(1, Math.max(0.05, opts.opacity))
  ctx.textBaseline = 'middle'
  const metrics = ctx.measureText(text)
  const tw = metrics.width
  const pad = Math.round(size * 0.6)
  let x = w / 2 - tw / 2
  let y = h / 2
  switch (opts.position) {
    case 'top':
      y = pad + size / 2
      break
    case 'bottom':
      y = h - pad - size / 2
      break
    case 'top-left':
      x = pad
      y = pad + size / 2
      break
    case 'top-right':
      x = w - pad - tw
      y = pad + size / 2
      break
    case 'bottom-left':
      x = pad
      y = h - pad - size / 2
      break
    case 'bottom-right':
      x = w - pad - tw
      y = h - pad - size / 2
      break
    default:
      break
  }
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 4
  ctx.fillText(text, x, y)
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
  return exportCanvas(canvas)
}

export type WatermarkMode = 'corner' | 'tile'

export async function addWatermark(
  src: string,
  opts: {
    text: string
    mode: WatermarkMode
    position: TextPosition
    fontSize: number
    color: string
    opacity: number
    /** Degrees; used for tile and corner. */
    rotate?: number
    /** Tile spacing as fraction of min(edge); default 0.22 */
    gap?: number
    /** Optional image stamp (data URL); drawn instead of text when set. */
    imageDataUrl?: string | null
    /** Image stamp scale relative to min(edge); default 0.18 */
    imageScale?: number
  },
): Promise<string> {
  const text = opts.text.trim()
  const stampSrc = opts.imageDataUrl?.trim() || ''
  if (!text && !stampSrc) return src

  const img = await loadImageElement(src)
  const canvas = canvasFromImage(img)
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height
  const minEdge = Math.min(w, h)
  const opacity = Math.min(1, Math.max(0.05, opts.opacity))
  const rotate = ((opts.rotate ?? -24) * Math.PI) / 180

  let stamp: HTMLImageElement | null = null
  if (stampSrc) {
    try {
      stamp = await loadImageElement(stampSrc)
    } catch {
      stamp = null
    }
  }

  const fontSize = Math.max(12, Math.round((minEdge * opts.fontSize) / 100))
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`
  const tw = text ? ctx.measureText(text).width : 0
  const th = fontSize
  const stampScale = Math.min(1, Math.max(0.04, opts.imageScale ?? 0.18))
  const stampW = stamp ? Math.round(minEdge * stampScale) : 0
  const stampH = stamp && stamp.naturalWidth
    ? Math.round((stampW * stamp.naturalHeight) / stamp.naturalWidth)
    : stampW
  const markW = stamp ? stampW : tw
  const markH = stamp ? stampH : th

  const drawMark = (): void => {
    ctx.globalAlpha = opacity
    if (stamp) {
      ctx.drawImage(stamp, -markW / 2, -markH / 2, markW, markH)
    } else {
      ctx.fillStyle = opts.color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = 'rgba(0,0,0,0.28)'
      ctx.shadowBlur = 3
      ctx.fillText(text, 0, 0)
      ctx.shadowBlur = 0
    }
    ctx.globalAlpha = 1
  }

  if (opts.mode === 'tile') {
    const gap = Math.max(0.12, opts.gap ?? 0.28) * minEdge
    const stepX = markW + gap
    const stepY = markH + gap
    ctx.save()
    // Expand bounds so rotated tiles cover corners.
    for (let y = -stepY; y < h + stepY; y += stepY) {
      for (let x = -stepX; x < w + stepX; x += stepX) {
        ctx.save()
        ctx.translate(x + markW / 2, y + markH / 2)
        ctx.rotate(rotate)
        drawMark()
        ctx.restore()
      }
    }
    ctx.restore()
    return exportCanvas(canvas)
  }

  const pad = Math.round(fontSize * 0.7)
  let cx = w / 2
  let cy = h / 2
  switch (opts.position) {
    case 'top':
      cy = pad + markH / 2
      break
    case 'bottom':
      cy = h - pad - markH / 2
      break
    case 'top-left':
      cx = pad + markW / 2
      cy = pad + markH / 2
      break
    case 'top-right':
      cx = w - pad - markW / 2
      cy = pad + markH / 2
      break
    case 'bottom-left':
      cx = pad + markW / 2
      cy = h - pad - markH / 2
      break
    case 'bottom-right':
      cx = w - pad - markW / 2
      cy = h - pad - markH / 2
      break
    default:
      break
  }
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rotate)
  drawMark()
  ctx.restore()
  return exportCanvas(canvas)
}

export async function addBorder(
  src: string,
  opts: { width: number; color: string },
): Promise<string> {
  const img = await loadImageElement(src)
  const bw = Math.max(0, Math.round(opts.width))
  if (bw <= 0) return src
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const canvas = document.createElement('canvas')
  canvas.width = w + bw * 2
  canvas.height = h + bw * 2
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = opts.color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, bw, bw)
  return exportCanvas(canvas)
}

export async function roundCorners(src: string, radiusPercent: number): Promise<string> {
  const img = await loadImageElement(src)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const r = Math.round((Math.min(w, h) * Math.min(50, Math.max(0, radiusPercent))) / 100)
  if (r <= 0) return src
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.arcTo(w, 0, w, h, r)
  ctx.arcTo(w, h, 0, h, r)
  ctx.arcTo(0, h, 0, 0, r)
  ctx.arcTo(0, 0, w, 0, r)
  ctx.closePath()
  ctx.clip()
  ctx.drawImage(img, 0, 0)
  return exportCanvas(canvas, 'image/png')
}
