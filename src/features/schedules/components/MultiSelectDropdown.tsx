import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import styles from './MultiSelectDropdown.module.css'

export type MultiSelectOption = {
  id: string
  label: string
  hint?: string
  disabled?: boolean
}

type Props = {
  label: string
  placeholder?: string
  options: MultiSelectOption[]
  value: string[]
  onChange: (next: string[]) => void
  emptyText?: string
  trailing?: ReactNode
}

export function MultiSelectDropdown({
  label,
  placeholder,
  options,
  value,
  onChange,
  emptyText,
  trailing,
}: Props): React.JSX.Element {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const selected = useMemo(() => {
    const map = new Map(options.map((o) => [o.id, o]))
    return value.map((v) => map.get(v)).filter(Boolean) as MultiSelectOption[]
  }, [options, value])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (optId: string): void => {
    const hit = options.find((o) => o.id === optId)
    if (hit?.disabled) return
    onChange(value.includes(optId) ? value.filter((x) => x !== optId) : [...value, optId])
  }

  return (
    <div className={styles.wrap} ref={rootRef}>
      <div className={styles.labelRow}>
        <span className={styles.label} id={id}>
          {label}
        </span>
        {trailing}
      </div>

      <div
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        role="combobox"
        aria-controls={`${id}-list`}
        aria-expanded={open}
        aria-labelledby={id}
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((v) => !v)
          }
        }}
      >
        <div className={styles.triggerBody}>
          {selected.length === 0 ? (
            <span className={styles.placeholder}>{placeholder || emptyText || '—'}</span>
          ) : (
            <div className={styles.chips}>
              {selected.map((s) => (
                <span key={s.id} className={styles.chip}>
                  <span className={styles.chipText}>{s.label}</span>
                  <button
                    type="button"
                    className={styles.chipX}
                    aria-label="remove"
                    onClick={(e) => {
                      e.stopPropagation()
                      onChange(value.filter((x) => x !== s.id))
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <span className={styles.caret} aria-hidden>
          ▾
        </span>
      </div>

      {open ? (
        <div className={styles.menu} role="listbox" id={`${id}-list`} aria-multiselectable>
          {options.length === 0 ? (
            <p className={styles.empty}>{emptyText || '—'}</p>
          ) : (
            options.map((opt) => {
              const checked = value.includes(opt.id)
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  disabled={opt.disabled}
                  className={`${styles.option} ${checked ? styles.optionOn : ''}`}
                  onClick={() => toggle(opt.id)}
                >
                  <span className={`${styles.box} ${checked ? styles.boxOn : ''}`}>
                    {checked ? '✓' : ''}
                  </span>
                  <span className={styles.optionText}>
                    <span className={styles.optionLabel}>{opt.label}</span>
                    {opt.hint ? <span className={styles.optionHint}>{opt.hint}</span> : null}
                  </span>
                </button>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}
