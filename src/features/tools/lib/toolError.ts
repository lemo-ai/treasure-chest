import type { TFunction } from 'i18next'
import { ToolError } from './types'

export function localizeToolError(error: unknown, t: TFunction): string {
  if (error instanceof ToolError) {
    return t(`tools.errors.${error.code}`, { defaultValue: t('tools.errors.generic') })
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return t('tools.errors.generic')
}
