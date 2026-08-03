import { useEffect, useState } from 'react'
import type { ThemeAccent, ThemeMode } from '@shared'
import { DEFAULT_THEME_ACCENT } from '@shared'

function resolveSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode: ThemeMode): void {
  const resolved = mode === 'system' ? resolveSystemTheme() : mode
  document.documentElement.dataset.theme = resolved
}

function applyAccent(accent: ThemeAccent): void {
  document.documentElement.dataset.accent = accent
}

export function useTheme(): {
  theme: ThemeMode
  setTheme: (mode: ThemeMode) => Promise<void>
  accent: ThemeAccent
  setAccent: (accent: ThemeAccent) => Promise<void>
} {
  const [theme, setThemeState] = useState<ThemeMode>('system')
  const [accent, setAccentState] = useState<ThemeAccent>(DEFAULT_THEME_ACCENT)

  useEffect(() => {
    void window.treasureChest.getTheme().then((mode) => {
      setThemeState(mode)
      applyTheme(mode)
    })
    void window.treasureChest.getAccent().then((next) => {
      setAccentState(next)
      applyAccent(next)
    })

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => {
      void window.treasureChest.getTheme().then((mode) => {
        if (mode === 'system') applyTheme('system')
      })
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setTheme = async (mode: ThemeMode): Promise<void> => {
    const next = await window.treasureChest.setTheme(mode)
    setThemeState(next)
    applyTheme(next)
  }

  const setAccent = async (nextAccent: ThemeAccent): Promise<void> => {
    const next = await window.treasureChest.setAccent(nextAccent)
    setAccentState(next)
    applyAccent(next)
  }

  return { theme, setTheme, accent, setAccent }
}
