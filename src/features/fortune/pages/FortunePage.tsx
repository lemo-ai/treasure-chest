import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BirthCalendar, BirthHourBranch, BirthProfile, FortuneAspectKey, FortuneInputMode } from '@shared'
import { BIRTH_HOUR_BRANCHES } from '@shared'
import { validateBaziPillars } from '../lib/BaZiService'
import { BirthDatePicker } from '../components/BirthDatePicker'
import { useFortune } from '../hooks/useFortune'
import styles from './FortunePage.module.css'

const ASPECT_KEYS: FortuneAspectKey[] = ['career', 'wealth', 'relationship', 'health', 'mood']

function levelClass(level: string): string {
  return styles[`fortuneLevel_${level}` as keyof typeof styles] ?? ''
}

export function FortunePage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const { profile, fortune, loading, refresh } = useFortune()
  const [inputMode, setInputMode] = useState<FortuneInputMode>(profile?.inputMode ?? 'birthDate')
  const [name, setName] = useState(profile?.name ?? '')
  const [birthDate, setBirthDate] = useState(profile?.birthDate ?? '1990-01-01')
  const [birthCalendar, setBirthCalendar] = useState<BirthCalendar>(profile?.birthCalendar ?? 'solar')
  const [hourBranch, setHourBranch] = useState<BirthHourBranch>(profile?.hourBranch ?? 'unknown')
  const [yearPillar, setYearPillar] = useState(profile?.yearPillar ?? '')
  const [monthPillar, setMonthPillar] = useState(profile?.monthPillar ?? '')
  const [dayPillar, setDayPillar] = useState(profile?.dayPillar ?? '')
  const [hourPillar, setHourPillar] = useState(profile?.hourPillar ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    setInputMode(profile.inputMode)
    setName(profile.name)
    if (profile.birthDate) setBirthDate(profile.birthDate)
    if (profile.birthCalendar) setBirthCalendar(profile.birthCalendar)
    if (profile.hourBranch) setHourBranch(profile.hourBranch)
    if (profile.yearPillar) setYearPillar(profile.yearPillar)
    if (profile.monthPillar) setMonthPillar(profile.monthPillar)
    if (profile.dayPillar) setDayPillar(profile.dayPillar)
    if (profile.hourPillar) setHourPillar(profile.hourPillar)
  }, [profile])

  const aspectLabels = useMemo(
    () =>
      Object.fromEntries(ASPECT_KEYS.map((key) => [key, t(`fortune.aspect.${key}`)])) as Record<
        FortuneAspectKey,
        string
      >,
    [t],
  )

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
    await window.treasureChest.saveBirthProfile(payload)
    await refresh()
    setSaving(false)
  }

  const onClear = async (): Promise<void> => {
    await window.treasureChest.clearBirthProfile()
    setName('')
    setError(null)
    await refresh()
  }

  return (
    <section className={styles.page}>
      <header>
        <h1 className={styles.title}>{t('fortune.title')}</h1>
        <p className={styles.subtitle}>{t('fortune.subtitle')}</p>
      </header>

      <p className={styles.disclaimer}>{t('fortune.disclaimer')}</p>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{t('fortune.profileTitle')}</h2>
        <div className={styles.formGrid}>
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
        </div>
      </div>

      {loading ? (
        <p className={styles.subtitle}>{t('fortune.loading')}</p>
      ) : fortune ? (
        <div className={styles.card}>
          <div className={styles.heroFortune}>
            <div className={styles.profileMeta}>
              <span className={styles.chip}>{fortune.bazi.year}</span>
              <span className={styles.chip}>{fortune.bazi.month}</span>
              <span className={styles.chip}>{fortune.bazi.day}</span>
              {fortune.bazi.hour ? <span className={styles.chip}>{fortune.bazi.hour}</span> : null}
              <span className={styles.chip}>
                {t('fortune.dayMaster', { master: fortune.bazi.dayMaster, element: fortune.bazi.element })}
              </span>
            </div>

            <div className={styles.hexRow}>
              <h2 className={styles.hexName}>
                {i18n.language.startsWith('en') ? fortune.hexagram.nameEn : fortune.hexagram.nameFull}
              </h2>
              <span className={`${styles.hexScore} ${levelClass(fortune.overall.level)}`}>
                {t(`fortune.level.${fortune.overall.level}`)} · {fortune.overall.score}
              </span>
            </div>
            <p className={styles.hexSummary}>{fortune.hexagram.summary}</p>
            <p className={styles.overallBlurb}>{fortune.overall.blurb}</p>
            <p className={styles.overallBlurb}>{fortune.hexagram.advice}</p>

            <div className={styles.aspectGrid}>
              {ASPECT_KEYS.map((key) => (
                <div key={key} className={styles.aspectCard}>
                  <h3 className={styles.aspectTitle}>{aspectLabels[key]}</h3>
                  <p className={`${styles.aspectScore} ${levelClass(fortune.aspects[key].level)}`}>
                    {fortune.aspects[key].score} · {t(`fortune.level.${fortune.aspects[key].level}`)}
                  </p>
                  <p className={styles.aspectBlurb}>{fortune.aspects[key].blurb}</p>
                </div>
              ))}
            </div>

            <div className={styles.luckyRow}>
              <span className={styles.chip}>
                {t('fortune.lucky.colors', { value: fortune.lucky.colors.join('、') })}
              </span>
              <span className={styles.chip}>
                {t('fortune.lucky.directions', { value: fortune.lucky.directions.join('、') })}
              </span>
              <span className={styles.chip}>
                {t('fortune.lucky.numbers', { value: fortune.lucky.numbers.join('、') })}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.card}>
          <p className={styles.subtitle}>{t('fortune.empty')}</p>
        </div>
      )}
    </section>
  )
}
