import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BirthProfile, DailyFortune, FortuneSettings } from '@shared'
import { DEFAULT_FORTUNE_SETTINGS } from '@shared'
import { computeDailyFortune } from '../lib/FortuneService'

export function useFortune(date = new Date()): {
  profile: BirthProfile | null
  fortune: DailyFortune | null
  fortuneSettings: FortuneSettings
  loading: boolean
  refresh: () => Promise<void>
} {
  const { i18n } = useTranslation()
  const [profile, setProfile] = useState<BirthProfile | null>(null)
  const [fortuneSettings, setFortuneSettings] = useState<FortuneSettings>(DEFAULT_FORTUNE_SETTINGS)
  const [loading, setLoading] = useState(true)

  const refresh = async (): Promise<void> => {
    setLoading(true)
    const [nextProfile, snap] = await Promise.all([
      window.treasureChest.getBirthProfile(),
      window.treasureChest.getSettingsSnapshot(),
    ])
    setProfile(nextProfile)
    setFortuneSettings(snap.fortune ?? DEFAULT_FORTUNE_SETTINGS)
    setLoading(false)
  }

  useEffect(() => {
    void refresh()
  }, [])

  const fortune = useMemo(() => {
    if (!profile) return null
    return computeDailyFortune(profile, date, i18n.language, fortuneSettings)
  }, [profile, date, i18n.language, fortuneSettings])

  return { profile, fortune, fortuneSettings, loading, refresh }
}
