import { dataUrlFromFile, loadImageElement } from '@renderer/features/tools/lib/canvasOps'

const MAX_EDGE = 960
const MAX_FILE_BYTES = 4 * 1024 * 1024

/** Downscale a cover image into a compact data URL for schedule cards. */
export async function coverDataUrlFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not_image')
  if (file.size > MAX_FILE_BYTES) throw new Error('too_large')
  const raw = await dataUrlFromFile(file)
  const img = await loadImageElement(raw)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if (!w || !h) return raw
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h))
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) return raw
  ctx.drawImage(img, 0, 0, cw, ch)
  try {
    return canvas.toDataURL('image/webp', 0.82)
  } catch {
    return canvas.toDataURL('image/jpeg', 0.85)
  }
}

export function isUsableCoverUrl(value: string | undefined | null): value is string {
  if (!value) return false
  const v = value.trim()
  return v.startsWith('data:image/') || /^https?:\/\//i.test(v)
}
