import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '@renderer/shared/ui/IconButton'
import { IconCheck, IconCopy } from '@renderer/shared/ui/icons'

interface CopyButtonProps {
  value: string
  label?: string
}

export function CopyButton({ value, label }: CopyButtonProps): React.JSX.Element {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  return (
    <IconButton
      icon={copied ? <IconCheck /> : <IconCopy />}
      label={label ?? (copied ? t('tools.copied') : t('tools.copy'))}
      variant="soft"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
    />
  )
}
