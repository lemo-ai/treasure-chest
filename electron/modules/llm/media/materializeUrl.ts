/** Fetch remote image URLs into data: URLs so the renderer CSP (img-src data:) can display them. */

export async function materializeImageUrl(url: string): Promise<string> {
  const trimmed = url.trim()
  if (!trimmed) throw new Error('empty image url')
  if (trimmed.startsWith('data:')) return trimmed

  const res = await fetch(trimmed, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) {
    throw new Error(`Failed to download generated image (HTTP ${res.status})`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength === 0) throw new Error('Generated image download was empty')
  const header = res.headers.get('content-type') || ''
  const mime = header.split(';')[0]?.trim() || guessMime(trimmed)
  return `data:${mime};base64,${buf.toString('base64')}`
}

function guessMime(url: string): string {
  const path = url.split('?')[0]?.toLowerCase() || ''
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}
