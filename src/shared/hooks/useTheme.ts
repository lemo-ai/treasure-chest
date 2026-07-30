import { useEffect, useState } from 'react'
import type { ThemeMode } from '@shared'

function resolveSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode: ThemeMode): void {
  const resolved = mode === 'system' ? resolveSystemTheme() : mode
  document.documentElement.dataset.theme = resolved
}

export function useTheme(): {
  theme: ThemeMode
  setTheme: (mode: ThemeMode) => Promise<void>
} {
  const [theme, setThemeState] = useState<ThemeMode>('system')

  useEffect(() => {
    void window.treasureChest.getTheme().then((mode) => {
      setThemeState(mode)
      applyTheme(mode)
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

  return { theme, setTheme }
}
