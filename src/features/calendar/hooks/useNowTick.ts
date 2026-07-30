import { useEffect, useState } from 'react'

/** Ticks every second for flip clock / live time. */
export function useNowTick(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return now
}
