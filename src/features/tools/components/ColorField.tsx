import { useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './ColorField.module.css'

const DEFAULT_PRESETS = [
  '#ffffff',
  '#000000',
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
]

type ColorFieldProps = {
  value: string
  onChange: (value: string) => void
  presets?: string[]
  'aria-label'?: string
}

function normalizeHex(value: string): string {
  const v = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) {
    const [, r, g, b] = v
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return value
}

export function ColorField({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  'aria-label': ariaLabel,
}: ColorFieldProps): React.JSX.Element {
  const { t } = useTranslation()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const hex = normalizeHex(value)
  const isLight = luminance(hex) > 0.72

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={ariaLabel}
        onClick={() => inputRef.current?.click()}
      >
        <span
          className={`${styles.swatch} ${isLight ? styles.swatchLight : ''}`}
          style={{ background: hex }}
          aria-hidden
        />
        <span className={styles.meta}>
          <span className={styles.hex}>{hex.toUpperCase()}</span>
          <span className={styles.hint}>{t('tools.image.colorCustom')}</span>
        </span>
        <span className={styles.chevron} aria-hidden />
      </button>
      <input
        ref={inputRef}
        id={inputId}
        className={styles.native}
        type="color"
        value={hex.length === 7 ? hex : '#ffffff'}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
      />
      <div className={styles.presets} role="listbox" aria-label={ariaLabel}>
        {presets.map((preset) => {
          const p = normalizeHex(preset)
          const active = p === hex
          const light = luminance(p) > 0.72
          return (
            <button
              key={p}
              type="button"
              role="option"
              aria-selected={active}
              title={p.toUpperCase()}
              className={`${styles.preset} ${active ? styles.presetActive : ''} ${light ? styles.presetLight : ''}`}
              style={{ background: p }}
              onClick={() => onChange(p)}
            />
          )
        })}
      </div>
    </div>
  )
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 0
  const n = Number.parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
