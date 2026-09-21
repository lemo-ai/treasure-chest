import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { UsagePricing, UsageSnapshot } from '@shared'
import { PanelBodyState } from '@renderer/shared/ui/PanelBodyState'
import { SettingActionButton } from '@renderer/shared/ui/SettingActionButton'
import { IconCheck, IconDownload, IconTrash } from '@renderer/shared/ui/icons'
import styles from './UsagePanel.module.css'

type Snap = UsageSnapshot & { todayCostUsd: number | null }

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 10_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return n.toLocaleString()
}

export function UsagePanel(): ReactNode {
  const { t } = useTranslation()
  const [snap, setSnap] = useState<Snap | null>(null)
  const [pricing, setPricing] = useState<UsagePricing>({ promptPerMillion: 0, completionPerMillion: 0 })
  const [rules, setRules] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const reload = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const s = await window.treasureChest.usageGetSnapshot()
      setSnap(s)
      setPricing(s.pricing)
    } catch {
      setError(t('settings.usage.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    void window.treasureChest.usageGetGlobalRules().then(setRules).catch(() => undefined)
  }, [])

  const savePricing = async (): Promise<void> => {
    setBusy(true)
    setMsg('')
    try {
      await window.treasureChest.usageSetPricing(pricing)
      await reload()
      setMsg(t('settings.usage.saved'))
    } catch {
      setMsg(t('settings.usage.saveError'))
    } finally {
      setBusy(false)
    }
  }

  const saveRules = async (): Promise<void> => {
    setBusy(true)
    setMsg('')
    try {
      await window.treasureChest.usageSetGlobalRules(rules)
      setMsg(t('settings.usage.rulesSaved'))
    } catch {
      setMsg(t('settings.usage.saveError'))
    } finally {
      setBusy(false)
    }
  }

  const today = snap?.today
  const prompt = today?.promptTokens ?? 0
  const completion = today?.completionTokens ?? 0
  const total = today?.totalTokens ?? 0
  const promptPct = total > 0 ? Math.round((prompt / total) * 100) : 50

  const dayRows = useMemo(() => {
    const days = [...(snap?.days ?? [])].slice(0, 14)
    const max = Math.max(1, ...days.map((d) => d.totalTokens))
    return days.map((d) => ({
      ...d,
      pct: Math.max(4, Math.round((d.totalTokens / max) * 100)),
      inPct: d.totalTokens > 0 ? Math.round((d.promptTokens / d.totalTokens) * 100) : 50,
    }))
  }, [snap?.days])

  if (loading && !snap) {
    return (
      <div className={styles.wrap}>
        <PanelBodyState
          status="loading"
          loadingLabel={t('settings.usage.loading')}
          emptyLabel={t('settings.usage.empty')}
        />
      </div>
    )
  }

  if (error && !snap) {
    return (
      <div className={styles.wrap}>
        <PanelBodyState
          status="error"
          loadingLabel={t('settings.usage.loading')}
          emptyLabel={t('settings.usage.empty')}
          errorLabel={error}
        />
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.intro}>
        <p className={styles.lede}>{t('settings.usage.hint')}</p>
        {msg ? <p className={styles.toast}>{msg}</p> : null}
        {error ? (
          <p className={styles.toastError} role="alert">
            {error}
          </p>
        ) : null}
      </header>

      <section className={styles.hero} aria-label={t('settings.usage.todayTotal')}>
        <div className={styles.heroMain}>
          <span className={styles.heroEyebrow}>{t('settings.usage.todayTotal')}</span>
          <div className={styles.heroValueRow}>
            <strong className={styles.heroValue}>{formatCompact(total)}</strong>
            <span className={styles.heroUnit}>{t('settings.usage.tokensUnit')}</span>
          </div>
          <p className={styles.heroExact}>{total.toLocaleString()} · {t('settings.usage.localOnly')}</p>
        </div>
        <div className={styles.heroSide}>
          <div className={styles.metaBlock}>
            <span className={styles.metaLabel}>{t('settings.usage.todayCost')}</span>
            <strong className={styles.metaValue}>
              {snap?.todayCostUsd != null
                ? `$${snap.todayCostUsd.toFixed(4)}`
                : t('settings.usage.costUnset')}
            </strong>
          </div>
          <div className={styles.metaBlock}>
            <span className={styles.metaLabel}>{t('settings.usage.todayCalls')}</span>
            <strong className={styles.metaValue}>{(today?.calls ?? 0).toLocaleString()}</strong>
            {(today?.estimatedCalls ?? 0) > 0 ? (
              <span className={styles.metaHint}>
                {t('settings.usage.estimatedCalls', { count: today?.estimatedCalls ?? 0 })}
              </span>
            ) : null}
          </div>
        </div>
        <div className={styles.split}>
          <div className={styles.splitTrack} aria-hidden>
            <span className={styles.splitIn} style={{ width: `${promptPct}%` }} />
            <span className={styles.splitOut} style={{ width: `${100 - promptPct}%` }} />
          </div>
          <div className={styles.splitLegend}>
            <span>
              <i className={styles.dotIn} />
              {t('settings.usage.colPrompt')} {prompt.toLocaleString()}
            </span>
            <span>
              <i className={styles.dotOut} />
              {t('settings.usage.colCompletion')} {completion.toLocaleString()}
            </span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>{t('settings.usage.recentDays')}</h3>
          <div className={styles.sectionActions}>
            <SettingActionButton
              icon={<IconDownload />}
              label={t('settings.usage.exportCsv')}
              variant="ghost"
              disabled={busy}
              onClick={() => void window.treasureChest.usageExportCsv()}
            />
            <SettingActionButton
              icon={<IconTrash />}
              label={t('settings.usage.clear')}
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(t('settings.usage.clearConfirm'))) return
                void window.treasureChest.usageClear().then(() => reload())
              }}
            />
          </div>
        </div>
        <PanelBodyState
          status={dayRows.length === 0 ? 'empty' : 'ready'}
          loadingLabel={t('settings.usage.loading')}
          emptyLabel={t('settings.usage.empty')}
          className={styles.empty}
        >
          <ul className={styles.dayList}>
            {dayRows.map((d) => (
              <li key={d.day} className={styles.dayRow}>
                <span className={styles.dayLabel}>{d.day.slice(5)}</span>
                <div className={styles.dayBarWrap} title={d.day}>
                  <div className={styles.dayBar} style={{ width: `${d.pct}%` }}>
                    <span className={styles.dayBarIn} style={{ width: `${d.inPct}%` }} />
                  </div>
                </div>
                <span className={styles.dayTotal}>{formatCompact(d.totalTokens)}</span>
                <span className={styles.dayCalls}>{d.calls}</span>
              </li>
            ))}
          </ul>
          <div className={styles.dayLegend}>
            <span>{t('settings.usage.colTotal')}</span>
            <span>{t('settings.usage.colCalls')}</span>
          </div>
        </PanelBodyState>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h3 className={styles.sectionTitle}>{t('settings.usage.pricingTitle')}</h3>
            <p className={styles.sectionHint}>{t('settings.usage.pricingHint')}</p>
          </div>
        </div>
        <div className={styles.priceGrid}>
          <label className={styles.field}>
            <span>{t('settings.usage.promptPrice')}</span>
            <div className={styles.fieldControl}>
              <input
                type="number"
                min={0}
                step={0.01}
                value={pricing.promptPerMillion}
                onChange={(e) =>
                  setPricing((p) => ({ ...p, promptPerMillion: Number(e.target.value) || 0 }))
                }
              />
              <span className={styles.fieldSuffix}>{t('settings.usage.priceUnit')}</span>
            </div>
          </label>
          <label className={styles.field}>
            <span>{t('settings.usage.completionPrice')}</span>
            <div className={styles.fieldControl}>
              <input
                type="number"
                min={0}
                step={0.01}
                value={pricing.completionPerMillion}
                onChange={(e) =>
                  setPricing((p) => ({ ...p, completionPerMillion: Number(e.target.value) || 0 }))
                }
              />
              <span className={styles.fieldSuffix}>{t('settings.usage.priceUnit')}</span>
            </div>
          </label>
        </div>
        <SettingActionButton
          icon={<IconCheck />}
          label={t('settings.usage.savePricing')}
          variant="primary"
          disabled={busy}
          onClick={() => void savePricing()}
        />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h3 className={styles.sectionTitle}>{t('settings.usage.rulesTitle')}</h3>
            <p className={styles.sectionHint}>{t('settings.usage.rulesHint')}</p>
          </div>
        </div>
        <textarea
          className={styles.rules}
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          rows={7}
          placeholder={t('settings.usage.rulesPlaceholder')}
          spellCheck={false}
        />
        <SettingActionButton
          icon={<IconCheck />}
          label={t('settings.usage.saveRules')}
          variant="secondary"
          disabled={busy}
          onClick={() => void saveRules()}
        />
      </section>
    </div>
  )
}
