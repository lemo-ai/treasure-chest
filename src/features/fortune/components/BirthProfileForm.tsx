import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BirthCalendar, BirthHourBranch, BirthProfile, FortuneInputMode } from '@shared'
import { BIRTH_HOUR_BRANCHES } from '@shared'
import { validateBaziPillars } from '../lib/BaZiService'
import { BirthDatePicker } from './BirthDatePicker'
import styles from './BirthProfileForm.module.css'

interface BirthProfileFormProps {
  /** Compact layout for settings */
  compact?: boolean
  onSaved?: (profile: BirthProfile | null) => void
}

export function BirthProfileForm({ compact = false, onSaved }: BirthProfileFormProps): React.JSX.Element {
  const { t } = useTranslation()
  const [profile, setProfile] = useState<BirthProfile | null>(null)
  const [inputMode, setInputMode] = useState<FortuneInputMode>('birthDate')
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('1990-01-01')
  const [birthCalendar, setBirthCalendar] = useState<BirthCalendar>('solar')
  const [hourBranch, setHourBranch] = useState<BirthHourBranch>('unknown')
  const [yearPillar, setYearPillar] = useState('')
  const [monthPillar, setMonthPillar] = useState('')
  const [dayPillar, setDayPillar] = useState('')
  const [hourPillar, setHourPillar] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const applyProfile = (next: BirthProfile | null): void => {
    setProfile(next)
    if (!next) {
      setInputMode('birthDate')
      setName('')
      setBirthDate('1990-01-01')
      setBirthCalendar('solar')
      setHourBranch('unknown')
      setYearPillar('')
      setMonthPillar('')
      setDayPillar('')
      setHourPillar('')
      return
    }
    setInputMode(next.inputMode)
    setName(next.name)
    if (next.birthDate) setBirthDate(next.birthDate)
    if (next.birthCalendar) setBirthCalendar(next.birthCalendar)
    if (next.hourBranch) setHourBranch(next.hourBranch)
    if (next.yearPillar) setYearPillar(next.yearPillar)
    if (next.monthPillar) setMonthPillar(next.monthPillar)
    if (next.dayPillar) setDayPillar(next.dayPillar)
    if (next.hourPillar) setHourPillar(next.hourPillar)
  }

  useEffect(() => {
    void window.treasureChest.getBirthProfile().then((next) => {
      applyProfile(next)
      setLoaded(true)
    })
  }, [])

  const onSave = async (): Promise<void> => {
    setError(null)
    if (!name.trim()) {
      setError(t('fortune.error.name'))
      return
    }
    if (inputMode === 'bazi') {
      const err = validateBaziPillars(yearPillar, monthPillar, dayPillar, hourPillar)
      if (err) {
        setError(t(`fortune.error.${err}`))
        return
      }
    }

    setSaving(true)
    try {
      const payload: BirthProfile = {
        id: profile?.id ?? 'default',
        name: name.trim(),
        inputMode,
        updatedAt: new Date().toISOString(),
        ...(inputMode === 'birthDate'
          ? { birthDate, birthCalendar, hourBranch }
          : {
              yearPillar: yearPillar.trim(),
              monthPillar: monthPillar.trim(),
              dayPillar: dayPillar.trim(),
              hourPillar: hourPillar.trim() || undefined,
            }),
      }
      const saved = await window.treasureChest.saveBirthProfile(payload)
      applyProfile(saved)
      onSaved?.(saved)
    } finally {
      setSaving(false)
    }
  }

  const onClear = async (): Promise<void> => {
    await window.treasureChest.clearBirthProfile()
    applyProfile(null)
    setError(null)
    onSaved?.(null)
  }

  if (!loaded) {
    return <p className={styles.hint}>{t('fortune.loading')}</p>
  }

  return (
    <div className={`${styles.root} ${compact ? styles.compact : ''}`.trim()}>
      <div className={styles.modeTabs}>
        {(['birthDate', 'bazi'] as FortuneInputMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`${styles.modeTab} ${inputMode === mode ? styles.modeTabActive : ''}`}
            onClick={() => setInputMode(mode)}
          >
            {t(`fortune.mode.${mode}`)}
          </button>
        ))}
      </div>

      <label className={styles.field}>
        <span className={styles.label}>{t('fortune.name')}</span>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('fortune.namePlaceholder')}
        />
      </label>

      {inputMode === 'birthDate' ? (
        <>
          <div className={styles.field}>
            <span className={styles.label}>{t('fortune.birthDate')}</span>
            <BirthDatePicker
              value={birthDate}
              onChange={setBirthDate}
              yearLabel={t('fortune.date.year')}
              monthLabel={t('fortune.date.month')}
              dayLabel={t('fortune.date.day')}
            />
          </div>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className={styles.label}>{t('fortune.birthCalendar')}</span>
              <select
                className={styles.select}
                value={birthCalendar}
                onChange={(e) => setBirthCalendar(e.target.value as BirthCalendar)}
              >
                <option value="solar">{t('fortune.calendar.solar')}</option>
                <option value="lunar">{t('fortune.calendar.lunar')}</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('fortune.hourBranch')}</span>
              <select
                className={styles.select}
                value={hourBranch}
                onChange={(e) => setHourBranch(e.target.value as BirthHourBranch)}
              >
                {BIRTH_HOUR_BRANCHES.map((branch) => (
                  <option key={branch} value={branch}>
                    {t(`fortune.hour.${branch}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      ) : (
        <div className={styles.pillarRow}>
          {(
            [
              [yearPillar, setYearPillar, 'fortune.pillar.year'],
              [monthPillar, setMonthPillar, 'fortune.pillar.month'],
              [dayPillar, setDayPillar, 'fortune.pillar.day'],
              [hourPillar, setHourPillar, 'fortune.pillar.hour'],
            ] as const
          ).map(([value, setter, labelKey]) => (
            <label key={labelKey} className={styles.field}>
              <span className={styles.label}>{t(labelKey)}</span>
              <input
                className={styles.input}
                value={value}
                onChange={(e) => setter(e.target.value)}
                placeholder={t('fortune.pillar.placeholder')}
                maxLength={2}
              />
            </label>
          ))}
        </div>
      )}

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.actions}>
        <button type="button" className={styles.primaryBtn} disabled={saving} onClick={() => void onSave()}>
          {t('fortune.saveProfile')}
        </button>
        {profile ? (
          <button type="button" className={styles.ghostBtn} onClick={() => void onClear()}>
            {t('fortune.clearProfile')}
          </button>
        ) : null}
      </div>
      <p className={styles.hint}>{t('fortune.disclaimerShort')}</p>
    </div>
  )
}
