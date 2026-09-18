import { persistGeneratedMedia } from './GeneratedMediaStore'

function isLoopbackUrl(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(url)
}

/**
 * Turn a remote or data: media URL into a short loopback URL under userData/generated-media.
 * Avoids embedding multi-MB base64 into chat markdown (which freezes the composer).
 */
export async function materializeMediaUrl(url: string): Promise<string> {
  const trimmed = url.trim()
  if (!trimmed) throw new Error('empty media url')
  if (isLoopbackUrl(trimmed)) return trimmed
  if (trimmed.startsWith('data:')) {
    return persistGeneratedMedia({ dataUrl: trimmed })
  }
  return persistGeneratedMedia({ remoteUrl: trimmed })
}

/** Image-specific alias kept for existing imports. */
export const materializeImageUrl = materializeMediaUrl
