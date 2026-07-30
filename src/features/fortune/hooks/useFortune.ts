import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BirthProfile, DailyFortune } from '@shared'
import { computeDailyFortune } from '../lib/FortuneService'

export function useFortune(date = new Date()): {
  profile: BirthProfile | null
  fortune: DailyFortune | null
  loading: boolean
  refresh: () => Promise<void>
} {
  const { i18n } = useTranslation()
  const [profile, setProfile] = useState<BirthProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async (): Promise<void> => {
    setLoading(true)
    const next = await window.treasureChest.getBirthProfile()
    setProfile(next)
    setLoading(false)
  }

  useEffect(() => {
    void refresh()
  }, [])

  const fortune = useMemo(() => {
    if (!profile) return null
    return computeDailyFortune(profile, date, i18n.language)
  }, [profile, date, i18n.language])

  return { profile, fortune, loading, refresh }
}
