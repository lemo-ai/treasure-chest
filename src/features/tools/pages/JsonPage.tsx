import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CopyButton } from '../components/CopyButton'
import { ToolShell } from '../components/ToolShell'
import { escapeJson, formatJsonLocal, unescapeJson } from '../lib/json'
import { localizeToolError } from '../lib/toolError'
import type { JsonFormatMode } from '../lib/types'
import form from './ToolForm.module.css'
import styles from './JsonPage.module.css'

const EXAMPLE = {
  code: 0,
  message: 'success',
  data: {
    total: 100,
    list: [
      { id: 1, name: 'Ada', age: 25 },
      { id: 2, name: 'Lin', age: 30 },
    ],
  },
}

export function JsonPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [content, setContent] = useState('')
  const [mode, setMode] = useState<JsonFormatMode>('pretty')
  const [indent, setIndent] = useState(2)
  const [error, setError] = useState('')
  const [output, setOutput] = useState('')

  const stats = useMemo(() => {
    if (!output) return null
    return {
      chars: output.length,
      lines: output.split('\n').length,
      size: new Blob([output]).size,
    }
  }, [output])

  const runFormat = (nextContent = content): void => {
    try {
      setError('')
      setOutput(formatJsonLocal(nextContent, mode, indent))
    } catch (err) {
      setOutput('')
      setError(localizeToolError(err, t))
    }
  }

  const onEscape = (): void => {
    try {
      setError('')
      const escaped = escapeJson(content)
      setContent(escaped)
      setOutput(escaped)
    } catch (err) {
      setError(localizeToolError(err, t))
    }
  }

  const onUnescape = (): void => {
    try {
      setError('')
      const unescaped = unescapeJson(content)
      setContent(unescaped)
      setOutput(formatJsonLocal(unescaped, mode, indent))
    } catch (err) {
      setError(localizeToolError(err, t))
    }
  }

  const onDownload = (): void => {
    if (!output) return
    const blob = new Blob([output], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `formatted-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <ToolShell title={t('tools.json.title')} subtitle={t('tools.json.desc')}>
      <div className={form.layout}>
        <div className={form.panel}>
          <p className={form.panelTag}>{t('tools.json.input')}</p>
          <label className={form.field}>
            <span className={form.label}>{t('tools.json.content')}</span>
            <textarea
              className={form.textarea}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('tools.json.placeholder')}
            />
          </label>

          <div className={form.field}>
            <span className={form.label}>{t('tools.json.mode')}</span>
            <div className={form.segmented}>
              {(['pretty', 'minify'] as JsonFormatMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`${form.segBtn} ${mode === m ? form.segBtnActive : ''}`}
                  onClick={() => setMode(m)}
                >
                  {t(`tools.json.mode.${m}`)}
                </button>
              ))}
            </div>
          </div>

          {mode === 'pretty' ? (
            <label className={form.field}>
              <span className={form.label}>{t('tools.json.indent')}</span>
              <input
                className={form.input}
                type="number"
                min={1}
                max={8}
                value={indent}
                onChange={(e) => setIndent(Number(e.target.value) || 2)}
              />
            </label>
          ) : null}

          <div className={form.actions}>
            <button type="button" className={form.primaryBtn} onClick={() => runFormat()}>
              {t('tools.json.format')}
            </button>
            <button
              type="button"
              className={form.ghostBtn}
              onClick={() => {
                const example = JSON.stringify(EXAMPLE, null, 2)
                setContent(example)
                runFormat(example)
              }}
            >
              {t('tools.json.example')}
            </button>
            <button type="button" className={form.ghostBtn} onClick={onEscape}>
              {t('tools.json.escape')}
            </button>
            <button type="button" className={form.ghostBtn} onClick={onUnescape}>
              {t('tools.json.unescape')}
            </button>
            <button
              type="button"
              className={form.ghostBtn}
              onClick={() => {
                setContent('')
                setOutput('')
                setError('')
              }}
            >
              {t('tools.json.clear')}
            </button>
          </div>
        </div>

        <div className={form.panel}>
          <div className={styles.resultHead}>
            <p className={form.panelTag}>{t('tools.common.result')}</p>
            <div className={form.actions}>
              {output ? <CopyButton value={output} /> : null}
              <button
                type="button"
                className={form.ghostBtn}
                disabled={!output}
                onClick={onDownload}
              >
                {t('tools.json.download')}
              </button>
            </div>
          </div>
          {error ? <p className={form.error}>{error}</p> : null}
          {stats ? (
            <p className={styles.stats}>
              {t('tools.json.stats', {
                chars: stats.chars,
                lines: stats.lines,
                size: stats.size,
              })}
            </p>
          ) : null}
          <pre className={styles.output}>{output || t('tools.json.emptyOutput')}</pre>
        </div>
      </div>
    </ToolShell>
  )
}
