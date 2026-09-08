import { ToolError } from './types'
import type { JsonFormatMode } from './types'

const clampIndent = (indent?: number): number => {
  if (typeof indent !== 'number' || Number.isNaN(indent)) return 2
  return Math.min(8, Math.max(1, Math.floor(indent)))
}

export const formatJsonLocal = (
  content: string,
  mode: JsonFormatMode = 'pretty',
  indent = 2,
): string => {
  if (!content || !content.trim()) throw new ToolError('jsonEmpty')
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new ToolError('jsonInvalid')
  }

  if (mode === 'minify') return JSON.stringify(parsed)
  return JSON.stringify(parsed, null, clampIndent(indent))
}

export const escapeJson = (content: string): string => {
  if (!content || !content.trim()) throw new ToolError('jsonEmpty')
  try {
    JSON.parse(content)
  } catch {
    throw new ToolError('jsonInvalid')
  }
  return JSON.stringify(content)
}

export const unescapeJson = (content: string): string => {
  if (!content || !content.trim()) throw new ToolError('jsonEmpty')
  try {
    const unescaped = JSON.parse(content)
    if (typeof unescaped !== 'string') throw new ToolError('jsonUnescapeFailed')
    JSON.parse(unescaped)
    return unescaped
  } catch (error) {
    if (error instanceof ToolError) throw error
    throw new ToolError('jsonUnescapeFailed')
  }
}
