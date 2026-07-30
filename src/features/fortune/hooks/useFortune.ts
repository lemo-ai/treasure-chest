import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BirthProfile, DailyFortune, FortuneSettings } from '@shared'
import { DEFAULT_FORTUNE_SETTINGS } from '@shared'
import { computeDailyFortune } from '../lib/FortuneService'

function friendlyAiError(locale: string, raw: string | undefined): string {
  const msg = (raw ?? '').toLowerCase()
  const isEn = locale.startsWith('en')
  if (msg.includes('empty ai response')) {
    return isEn
      ? 'Analysis service responded but returned no readable text. Please check model/API format.'
      : '分析服务已响应，但没有返回可读内容。请检查模型或 API 格式。'
  }
  if (msg.includes('timeout') || msg.includes('abort')) {
    return isEn
      ? 'Analysis request timed out. Please check network or provider settings.'
      : '分析请求超时，请检查网络或供应商配置后重试。'
  }
  if (msg.includes('401') || msg.includes('invalid api key') || msg.includes('authentication')) {
    return isEn ? 'API key is invalid. Please verify and retry.' : 'API Key 无效，请检查后重试。'
  }
  if (msg.includes('404') || msg.includes('not found')) {
    return isEn ? 'Endpoint or model not found. Please verify Base URL and model.' : '接口地址或模型不存在，请检查 Base URL 和模型。'
  }
  return isEn
    ? 'Online analysis is temporarily unavailable. Local result is shown.'
    : '在线分析暂时不可用，已为你展示本地结果。'
}

export function useFortune(date = new Date()): {
  profile: BirthProfile | null
  fortune: DailyFortune | null
  fortuneSettings: FortuneSettings
  loading: boolean
  aiStage: 'idle' | 'analyzing' | 'done' | 'error'
  aiMessage: string | null
  refresh: () => Promise<void>
} {
  const { i18n } = useTranslation()
  const [profile, setProfile] = useState<BirthProfile | null>(null)
  const [fortuneSettings, setFortuneSettings] = useState<FortuneSettings>(DEFAULT_FORTUNE_SETTINGS)
  const [fortune, setFortune] = useState<DailyFortune | null>(null)
  const [loading, setLoading] = useState(true)
  const [aiStage, setAiStage] = useState<'idle' | 'analyzing' | 'done' | 'error'>('idle')
  const [aiMessage, setAiMessage] = useState<string | null>(null)
  const requestSeq = useRef(0)

  const dateToken = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

  const refresh = async (): Promise<void> => {
    const seq = ++requestSeq.current
    setLoading(true)
    setAiStage('idle')
    setAiMessage(null)

    try {
      const [nextProfile, snap] = await Promise.all([
        window.treasureChest.getBirthProfile(),
        window.treasureChest.getSettingsSnapshot(),
      ])
      if (seq !== requestSeq.current) return
      setProfile(nextProfile)
      const nextSettings = snap.fortune ?? DEFAULT_FORTUNE_SETTINGS
      setFortuneSettings(nextSettings)

      const localFortune = nextProfile ? computeDailyFortune(nextProfile, date, i18n.language, nextSettings) : null
      setFortune(localFortune)
      setLoading(false)

      const shouldUseOnlineAi = Boolean(
        localFortune &&
        nextSettings.aiPolish &&
        nextSettings.aiApiKey.trim() &&
        nextSettings.aiBaseUrl.trim() &&
        nextSettings.aiModel.trim(),
      )
      if (!localFortune || !shouldUseOnlineAi) return

      setAiStage('analyzing')
      setAiMessage(i18n.language.startsWith('en') ? 'Analyzing…' : '分析中…')
      const ai = await window.treasureChest.generateFortuneAiAnalysis(localFortune, i18n.language)
      if (seq !== requestSeq.current) return
      if (ai.ok && ai.text) {
        setFortune((prev) =>
          prev
            ? {
                ...prev,
                aiAnalysis: ai.text,
                source: {
                  ...prev.source,
                  engine: `${prev.source.engine}+ai/${nextSettings.aiModel.trim()}`,
                },
              }
            : prev,
        )
        setAiStage('done')
        setAiMessage(i18n.language.startsWith('en') ? 'Analysis ready' : '分析已完成')
      } else {
        setAiStage('error')
        setAiMessage(friendlyAiError(i18n.language, ai.error))
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [i18n.language, dateToken])

  return { profile, fortune, fortuneSettings, loading, aiStage, aiMessage, refresh }
}
