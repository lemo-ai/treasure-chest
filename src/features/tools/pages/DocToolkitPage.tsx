import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ToolShell } from '../components/ToolShell'
import styles from './DocToolkitPage.module.css'

type TabId = 'extract' | 'convert' | 'office' | 'pdf'
type OfficeTarget = 'pdf' | 'docx' | 'odt' | 'pptx' | 'odp' | 'xlsx' | 'ods' | 'html' | 'txt'

const OFFICE_TARGETS: OfficeTarget[] = [
  'pdf',
  'docx',
  'odt',
  'pptx',
  'odp',
  'xlsx',
  'ods',
  'html',
  'txt',
]

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function countStats(text: string): { chars: number; words: number; lines: number } {
  const trimmed = text.trim()
  const words = trimmed ? trimmed.split(/\s+/).length : 0
  return {
    chars: text.length,
    words,
    lines: text ? text.split(/\n/).length : 0,
  }
}

export function DocToolkitPage(): React.JSX.Element {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<TabId>('extract')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [sourceMime, setSourceMime] = useState('')
  const [text, setText] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [splitRanges, setSplitRanges] = useState('1-')
  const [pdfPassword, setPdfPassword] = useState('')
  const [pdfPasswordConfirm, setPdfPasswordConfirm] = useState('')
  const [pdfAllowCopy, setPdfAllowCopy] = useState(false)
  const [pdfAllowPrint, setPdfAllowPrint] = useState(true)
  const [compressQuality, setCompressQuality] = useState(75)
  const [officeTarget, setOfficeTarget] = useState<OfficeTarget>('pdf')
  const [loStatus, setLoStatus] = useState<{
    ok: boolean
    path?: string
    version?: string
    error?: string
  } | null>(null)
  const stats = useMemo(() => countStats(text), [text])

  useEffect(() => {
    if (tab !== 'office') return
    void window.treasureChest.checkLibreOffice().then(setLoStatus)
  }, [tab])

  const withBusy = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tools.errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  const onPickFile = (file: File | null): void => {
    if (!file) return
    void withBusy(async () => {
      const dataBase64 = await fileToBase64(file)
      const res = await window.treasureChest.extractDocument({
        fileName: file.name,
        dataBase64,
        mime: file.type || undefined,
      })
      if (!res.ok || res.text == null) {
        setError(res.error || t('tools.doc.extractFailed'))
        return
      }
      setFileName(file.name)
      setSourceMime(res.mime || file.type || '')
      setText(res.text)
      setMessage(t('tools.doc.extractDone'))
      setTab('extract')
    })
  }

  const saveAs = (ext: 'txt' | 'md' | 'html'): void => {
    void withBusy(async () => {
      let content = text
      let defaultName = `document.${ext}`
      if (fileName) {
        const base = fileName.replace(/\.[^.]+$/, '')
        defaultName = `${base}.${ext}`
      }
      if (ext === 'html') {
        content = `<!doctype html>\n<html lang="zh-CN">\n<head><meta charset="utf-8"/><title>${defaultName}</title></head>\n<body>\n<pre>${text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</pre>\n</body>\n</html>\n`
      }
      const res = await window.treasureChest.saveTextFile({
        content,
        defaultName,
        extensions: [ext],
      })
      if (!res.ok) {
        if (res.error !== 'cancelled') setError(res.error || t('tools.errors.generic'))
        return
      }
      setMessage(t('tools.doc.saved', { path: res.path }))
    })
  }

  const exportPdf = (): void => {
    void withBusy(async () => {
      const base = fileName ? fileName.replace(/\.[^.]+$/, '') : `document-${Date.now()}`
      const res = await window.treasureChest.exportTextPdf({
        content: text,
        defaultName: `${base}.pdf`,
      })
      if (!res.ok) {
        if (res.error !== 'cancelled') setError(res.error || t('tools.doc.exportFailed'))
        return
      }
      setMessage(t('tools.doc.saved', { path: res.path }))
    })
  }

  const exportDocx = (): void => {
    void withBusy(async () => {
      const base = fileName ? fileName.replace(/\.[^.]+$/, '') : `document-${Date.now()}`
      const res = await window.treasureChest.exportTextDocx({
        content: text,
        defaultName: `${base}.docx`,
      })
      if (!res.ok) {
        if (res.error !== 'cancelled') setError(res.error || t('tools.doc.exportFailed'))
        return
      }
      setMessage(t('tools.doc.saved', { path: res.path }))
    })
  }

  return (
    <ToolShell title={t('tools.doc.title')} wide compact>
      <div className={styles.modeBar}>
        <div className={styles.modes}>
          {(['extract', 'convert', 'office', 'pdf'] as TabId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`${styles.mode} ${tab === id ? styles.modeActive : ''}`}
              onClick={() => setTab(id)}
            >
              {t(`tools.doc.tab.${id}`)}
            </button>
          ))}
        </div>
        <div className={styles.fileActions}>
          {tab !== 'pdf' && tab !== 'office' ? (
            <>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                {t('tools.doc.openFile')}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,.pptx,.xlsx,.xls,.txt,.md,.markdown,.csv,.json,.html,.htm,.png,.jpg,.jpeg,.webp"
                hidden
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                className={styles.btnGhost}
                disabled={!text || busy}
                onClick={() => saveAs('txt')}
              >
                {t('tools.doc.saveTxt')}
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={!text || busy}
                onClick={() => saveAs('md')}
              >
                {t('tools.doc.saveMd')}
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={!text || busy}
                onClick={() => saveAs('html')}
              >
                {t('tools.doc.saveHtml')}
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={!text || busy}
                onClick={exportPdf}
              >
                {t('tools.doc.savePdf')}
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={!text || busy}
                onClick={exportDocx}
              >
                {t('tools.doc.saveDocx')}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {tab === 'office' ? (
        <div className={styles.pdfLayout}>
          <section className={styles.pdfCard}>
            <h2 className={styles.panelTitle}>{t('tools.doc.officeTitle')}</h2>
            <p className={styles.banner}>{t('tools.doc.officeHint')}</p>
            {loStatus == null ? (
              <p className={styles.hint}>{t('tools.doc.officeChecking')}</p>
            ) : loStatus.ok ? (
              <p className={styles.hint}>
                {t('tools.doc.officeReady', {
                  version: loStatus.version || 'LibreOffice',
                  path: loStatus.path || '',
                })}
              </p>
            ) : (
              <p className={styles.toastErr}>
                {t('tools.doc.officeMissing')}{' '}
                <Link className={styles.link} to="/settings?section=data">
                  {t('tools.doc.officeOpenSettings')}
                </Link>
              </p>
            )}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('tools.doc.officeTarget')}</span>
              <select
                className={styles.input}
                value={officeTarget}
                disabled={busy || loStatus?.ok === false}
                onChange={(e) => setOfficeTarget(e.target.value as OfficeTarget)}
              >
                {OFFICE_TARGETS.map((id) => (
                  <option key={id} value={id}>
                    {t(`tools.doc.officeFmt.${id}`)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.btnPrimaryBlock}
              disabled={busy || loStatus?.ok === false}
              onClick={() =>
                void withBusy(async () => {
                  const res = await window.treasureChest.convertLibreOffice({
                    target: officeTarget,
                  })
                  if (!res.ok) {
                    if (res.error === 'cancelled') return
                    if (res.error === 'libreoffice_not_found') {
                      setError(t('tools.doc.officeMissing'))
                      return
                    }
                    setError(res.error || t('tools.doc.officeFailed'))
                    return
                  }
                  setMessage(t('tools.doc.officeDone', { path: res.path }))
                })
              }
            >
              {t('tools.doc.officeRun')}
            </button>
            <button
              type="button"
              className={styles.btnGhostBlock}
              disabled={busy}
              onClick={() =>
                void withBusy(async () => {
                  setLoStatus(await window.treasureChest.checkLibreOffice())
                })
              }
            >
              {t('tools.doc.officeRecheck')}
            </button>
            {(message || error) && (
              <div className={styles.toastRow}>
                {message ? <p className={styles.toastOk}>{message}</p> : null}
                {error ? <p className={styles.toastErr}>{error}</p> : null}
              </div>
            )}
          </section>
        </div>
      ) : tab === 'pdf' ? (
        <div className={styles.pdfLayout}>
          <section className={styles.pdfCard}>
            <h2 className={styles.panelTitle}>{t('tools.doc.mergeTitle')}</h2>
            <p className={styles.banner}>{t('tools.doc.mergeHint')}</p>
            <button
              type="button"
              className={styles.btnPrimaryBlock}
              disabled={busy}
              onClick={() =>
                void withBusy(async () => {
                  const res = await window.treasureChest.mergePdfs()
                  if (!res.ok) {
                    if (res.error !== 'cancelled') setError(res.error || t('tools.doc.exportFailed'))
                    return
                  }
                  setMessage(
                    t('tools.doc.mergeDone', { path: res.path, pages: res.pageCount ?? '—' }),
                  )
                })
              }
            >
              {t('tools.doc.mergeRun')}
            </button>
          </section>
          <section className={styles.pdfCard}>
            <h2 className={styles.panelTitle}>{t('tools.doc.splitTitle')}</h2>
            <p className={styles.banner}>{t('tools.doc.splitHint')}</p>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('tools.doc.splitRanges')}</span>
              <input
                className={styles.input}
                value={splitRanges}
                onChange={(e) => setSplitRanges(e.target.value)}
                placeholder="1-3,5"
                disabled={busy}
              />
            </label>
            <button
              type="button"
              className={styles.btnPrimaryBlock}
              disabled={busy}
              onClick={() =>
                void withBusy(async () => {
                  const ranges = splitRanges.trim() === '1-' ? undefined : splitRanges.trim()
                  const res = await window.treasureChest.splitPdf({ ranges })
                  if (!res.ok) {
                    if (res.error !== 'cancelled') setError(res.error || t('tools.doc.exportFailed'))
                    return
                  }
                  setMessage(
                    t('tools.doc.splitDone', { path: res.path, pages: res.pageCount ?? '—' }),
                  )
                })
              }
            >
              {t('tools.doc.splitRun')}
            </button>
          </section>
          <section className={styles.pdfCard}>
            <h2 className={styles.panelTitle}>{t('tools.doc.compressTitle')}</h2>
            <p className={styles.banner}>{t('tools.doc.compressHint')}</p>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {t('tools.doc.compressQuality')} ({compressQuality}%)
              </span>
              <input
                className={styles.input}
                type="range"
                min={40}
                max={95}
                value={compressQuality}
                disabled={busy}
                onChange={(e) => setCompressQuality(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className={styles.btnPrimaryBlock}
              disabled={busy}
              onClick={() =>
                void withBusy(async () => {
                  const res = await window.treasureChest.compressPdf({ jpegQuality: compressQuality })
                  if (!res.ok) {
                    if (res.error !== 'cancelled') setError(res.error || t('tools.doc.exportFailed'))
                    return
                  }
                  const before = res.bytesBefore ?? 0
                  const after = res.bytesAfter ?? 0
                  const saved =
                    before > 0 ? Math.max(0, Math.round((1 - after / before) * 100)) : 0
                  setMessage(
                    t('tools.doc.compressDone', {
                      path: res.path,
                      saved,
                      before: Math.round(before / 1024),
                      after: Math.round(after / 1024),
                    }),
                  )
                })
              }
            >
              {t('tools.doc.compressRun')}
            </button>
          </section>
          <section className={styles.pdfCard}>
            <h2 className={styles.panelTitle}>{t('tools.doc.encryptTitle')}</h2>
            <p className={styles.banner}>{t('tools.doc.encryptHint')}</p>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('tools.doc.encryptPassword')}</span>
              <input
                className={styles.input}
                type="password"
                autoComplete="new-password"
                value={pdfPassword}
                onChange={(e) => setPdfPassword(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('tools.doc.encryptConfirm')}</span>
              <input
                className={styles.input}
                type="password"
                autoComplete="new-password"
                value={pdfPasswordConfirm}
                onChange={(e) => setPdfPasswordConfirm(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={pdfAllowPrint}
                disabled={busy}
                onChange={(e) => setPdfAllowPrint(e.target.checked)}
              />
              <span>{t('tools.doc.encryptAllowPrint')}</span>
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={pdfAllowCopy}
                disabled={busy}
                onChange={(e) => setPdfAllowCopy(e.target.checked)}
              />
              <span>{t('tools.doc.encryptAllowCopy')}</span>
            </label>
            <button
              type="button"
              className={styles.btnPrimaryBlock}
              disabled={busy || !pdfPassword.trim()}
              onClick={() =>
                void withBusy(async () => {
                  if (pdfPassword !== pdfPasswordConfirm) {
                    setError(t('tools.doc.encryptMismatch'))
                    return
                  }
                  const res = await window.treasureChest.encryptPdf({
                    userPassword: pdfPassword,
                    allowPrinting: pdfAllowPrint,
                    allowCopying: pdfAllowCopy,
                  })
                  if (!res.ok) {
                    if (res.error !== 'cancelled') setError(res.error || t('tools.doc.exportFailed'))
                    return
                  }
                  setPdfPassword('')
                  setPdfPasswordConfirm('')
                  setMessage(t('tools.doc.encryptDone', { path: res.path }))
                })
              }
            >
              {t('tools.doc.encryptRun')}
            </button>
          </section>
          {(message || error) && (
            <div className={styles.toastRow}>
              {message ? <p className={styles.toastOk}>{message}</p> : null}
              {error ? <p className={styles.toastErr}>{error}</p> : null}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.layout}>
          <section className={styles.editorCol}>
            {tab === 'extract' ? (
              <p className={styles.banner}>{t('tools.doc.extractHint')}</p>
            ) : (
              <p className={styles.banner}>{t('tools.doc.convertHint')}</p>
            )}
            <div className={styles.editorWrap}>
              {showPreview && tab === 'convert' ? (
                <div className={styles.markdown}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{text || ' '}</ReactMarkdown>
                </div>
              ) : (
                <textarea
                  className={styles.textarea}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    tab === 'extract'
                      ? t('tools.doc.extractPlaceholder')
                      : t('tools.doc.convertPlaceholder')
                  }
                  spellCheck={false}
                />
              )}
              {busy ? <div className={styles.busyOverlay}>{t('tools.doc.working')}</div> : null}
            </div>
            {(message || error) && (
              <div className={styles.toastRow}>
                {message ? <p className={styles.toastOk}>{message}</p> : null}
                {error ? <p className={styles.toastErr}>{error}</p> : null}
              </div>
            )}
          </section>

          <aside className={styles.panel}>
            <h2 className={styles.panelTitle}>{t('tools.doc.info')}</h2>
            <dl className={styles.meta}>
              <div>
                <dt>{t('tools.doc.fileName')}</dt>
                <dd title={fileName || undefined}>{fileName || '—'}</dd>
              </div>
              <div>
                <dt>{t('tools.doc.mime')}</dt>
                <dd>{sourceMime || '—'}</dd>
              </div>
              <div>
                <dt>{t('tools.doc.chars')}</dt>
                <dd>{stats.chars}</dd>
              </div>
              <div>
                <dt>{t('tools.doc.words')}</dt>
                <dd>{stats.words}</dd>
              </div>
              <div>
                <dt>{t('tools.doc.lines')}</dt>
                <dd>{stats.lines}</dd>
              </div>
            </dl>

            {tab === 'convert' ? (
              <div className={styles.row}>
                <button
                  type="button"
                  className={`${styles.chip} ${!showPreview ? styles.chipActive : ''}`}
                  onClick={() => setShowPreview(false)}
                >
                  {t('tools.doc.edit')}
                </button>
                <button
                  type="button"
                  className={`${styles.chip} ${showPreview ? styles.chipActive : ''}`}
                  onClick={() => setShowPreview(true)}
                >
                  {t('tools.doc.previewMd')}
                </button>
              </div>
            ) : null}

            <button
              type="button"
              className={styles.btnGhostBlock}
              disabled={!text || busy}
              onClick={() => {
                void navigator.clipboard.writeText(text).then(
                  () => setMessage(t('tools.doc.copied')),
                  () => setError(t('tools.errors.generic')),
                )
              }}
            >
              {t('tools.doc.copy')}
            </button>
            <button
              type="button"
              className={styles.btnGhostBlock}
              disabled={!text || busy}
              onClick={() => {
                setText('')
                setFileName('')
                setSourceMime('')
                setMessage('')
              }}
            >
              {t('tools.doc.clear')}
            </button>
            <p className={styles.hint}>{t('tools.doc.supported')}</p>
          </aside>
        </div>
      )}
    </ToolShell>
  )
}
