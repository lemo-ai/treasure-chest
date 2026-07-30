import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { BirthCalendar, BirthHourBranch, BirthProfile, FortuneAspectKey, FortuneInputMode } from '@shared'
import { BIRTH_HOUR_BRANCHES } from '@shared'
import { validateBaziPillars } from '../lib/BaZiService'
import { BirthDatePicker } from '../components/BirthDatePicker'
import { FortuneAnalysis } from '../components/FortuneAnalysis'
import { useFortune } from '../hooks/useFortune'
import styles from './FortunePage.module.css'

const ASPECT_KEYS: FortuneAspectKey[] = ['career', 'wealth', 'relationship', 'health', 'mood']

export function FortunePage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const { profile, fortune, loading, aiStage, aiMessage, refresh } = useFortune()
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
  const [profileExpanded, setProfileExpanded] = useState(false)
  const userToggledProfile = useRef(false)

  useEffect(() => {
    if (loading) return

    if (!profile) {
      setProfileExpanded(true)
      userToggledProfile.current = false
      return
    }

    setInputMode(profile.inputMode)
    setName(profile.name)
    if (profile.birthDate) setBirthDate(profile.birthDate)
    if (profile.birthCalendar) setBirthCalendar(profile.birthCalendar)
    if (profile.hourBranch) setHourBranch(profile.hourBranch)
    if (profile.yearPillar) setYearPillar(profile.yearPillar)
    if (profile.monthPillar) setMonthPillar(profile.monthPillar)
    if (profile.dayPillar) setDayPillar(profile.dayPillar)
    if (profile.hourPillar) setHourPillar(profile.hourPillar)

    if (!userToggledProfile.current) {
      setProfileExpanded(false)
    }
  }, [profile, loading])

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
    userToggledProfile.current = false
    setProfileExpanded(false)
    setSaving(false)
  }

  const onClear = async (): Promise<void> => {
    await window.treasureChest.clearBirthProfile()
    setName('')
    setError(null)
    userToggledProfile.current = false
    setProfileExpanded(true)
    await refresh()
  }

  const toggleProfile = (): void => {
    userToggledProfile.current = true
    setProfileExpanded((v) => !v)
  }

  const profileSummary = (profile?.name ?? name.trim()) || t('fortune.namePlaceholder')

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('fortune.title')}</h1>
        <p className={styles.subtitle}>{t('fortune.subtitle')}</p>
        {aiMessage ? (
          <p className={`${styles.aiStatus} ${styles[`aiStatus_${aiStage}`] ?? ''}`}>{aiMessage}</p>
        ) : null}
      </header>

      <div className={styles.mainContent}>
        {loading ? (
          <p className={styles.subtitle}>{t('fortune.loading')}</p>
        ) : fortune ? (
          <FortuneAnalysis fortune={fortune} locale={i18n.language} aspectLabels={aspectLabels} />
        ) : (
          <div className={styles.emptyCard}>
            <p className={styles.subtitle}>{t('fortune.empty')}</p>
          </div>
        )}
      </div>

      <div className={styles.profileCard}>
        <button
          type="button"
          className={styles.profileToggle}
          onClick={toggleProfile}
          aria-expanded={profileExpanded}
        >
          <span className={styles.profileToggleMain}>
            <span className={styles.cardTitleInline}>{t('fortune.profileTitle')}</span>
            {!profileExpanded && profile ? (
              <span className={styles.profileToggleSummary}>{profileSummary}</span>
            ) : null}
          </span>
          <span className={styles.profileToggleAction}>
            {profileExpanded ? t('fortune.collapseProfile') : t('fortune.editProfile')}
          </span>
        </button>

        <AnimatePresence initial={false}>
          {profileExpanded ? (
            <motion.div
              key="profile-form"
              className={styles.formGrid}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
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
            </motion.div>
          ) : null}
        </AnimatePresence>

        <p className={styles.disclaimer}>{t('fortune.disclaimerShort')}</p>
      </div>
    </section>
  )
}
