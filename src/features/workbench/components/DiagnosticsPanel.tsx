import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { LspCompletionItem, LspLocation, SandboxDiagnostic } from '@shared'
import styles from './DiagnosticsPanel.module.css'

interface DiagnosticsPanelProps {
  active: boolean
  refreshKey?: number
}

export function DiagnosticsPanel({ active, refreshKey }: DiagnosticsPanelProps): ReactNode {
  const { t } = useTranslation()
  const [items, setItems] = useState<SandboxDiagnostic[]>([])
  const [loading, setLoading] = useState(false)
  const [lspPath, setLspPath] = useState('index.ts')
  const [lspLine, setLspLine] = useState('1')
  const [lspColumn, setLspColumn] = useState('1')
  const [lspDef, setLspDef] = useState<LspLocation | null>(null)
  const [lspItems, setLspItems] = useState<LspCompletionItem[]>([])

  const refresh = (): void => {
    setLoading(true)
    void window.treasureChest
      .harnessGetDiagnostics()
      .then(setItems)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!active) return
    refresh()
  }, [active, refreshKey])

  const runDefinition = (): void => {
    void window.treasureChest
      .harnessLspDefinition(lspPath, Number(lspLine) || 1, Number(lspColumn) || 1)
      .then(setLspDef)
  }

  const runCompletion = (): void => {
    void window.treasureChest
      .harnessLspCompletion(lspPath, Number(lspLine) || 1, Number(lspColumn) || 1)
      .then(setLspItems)
  }

  if (!active) return null

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span>{t('workbench.diagnosticsSub')}</span>
        <button type="button" className={styles.refreshBtn} disabled={loading} onClick={refresh}>
          {t('workbench.diagnosticsRefresh')}
        </button>
      </div>
      <div className={styles.lspBar}>
        <input
          className={styles.lspInput}
          value={lspPath}
          onChange={(e) => setLspPath(e.target.value)}
          placeholder={t('workbench.lspPath')}
        />
        <input
          className={styles.lspNum}
          value={lspLine}
          onChange={(e) => setLspLine(e.target.value)}
          aria-label={t('workbench.lspLine')}
        />
        <input
          className={styles.lspNum}
          value={lspColumn}
          onChange={(e) => setLspColumn(e.target.value)}
          aria-label={t('workbench.lspColumn')}
        />
        <button type="button" className={styles.lspBtn} onClick={runDefinition}>
          {t('workbench.lspDefinition')}
        </button>
        <button type="button" className={styles.lspBtn} onClick={runCompletion}>
          {t('workbench.lspCompletion')}
        </button>
      </div>
      {lspDef ? (
        <p className={styles.lspResult}>
          {t('workbench.lspDefinitionResult', {
            path: lspDef.path,
            line: lspDef.line,
            column: lspDef.column,
          })}
        </p>
      ) : null}
      {lspItems.length > 0 ? (
        <ul className={styles.lspList}>
          {lspItems.map((item) => (
            <li key={item.label + (item.detail ?? '')}>
              <code>{item.label}</code>
              {item.detail ? <span className={styles.lspDetail}>{item.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {loading ? <p className={styles.empty}>{t('workbench.diagnosticsLoading')}</p> : null}
      {!loading && items.length === 0 ? (
        <p className={styles.empty}>{t('workbench.diagnosticsEmpty')}</p>
      ) : null}
      {!loading && items.length > 0 ? (
        <ul className={styles.list}>
          {items.map((d, idx) => (
            <li key={`${d.path}:${d.line}:${d.column}:${idx}`} className={styles.item} data-severity={d.severity}>
              <span className={styles.loc}>
                {d.path}:{d.line}:{d.column}
              </span>
              <span className={styles.msg}>{d.message}</span>
              <span className={styles.src}>{d.source}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
