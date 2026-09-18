import bgFortune from '@renderer/assets/schedule-bg-fortune.png'
import bgStocks from '@renderer/assets/schedule-bg-stocks.png'
import type { ScheduleCoverPreset, ScheduleTask } from '@shared'

export function resolveScheduleCoverUrl(task: ScheduleTask): string | undefined {
  if (task.coverImage?.startsWith('data:image/')) return task.coverImage
  const preset = task.coverPreset || inferPreset(task)
  if (preset === 'fortune') return bgFortune
  if (preset === 'stocks' || preset === 'lottery') return bgStocks
  return undefined
}

export function inferPreset(task: ScheduleTask): ScheduleCoverPreset {
  if (task.coverPreset) return task.coverPreset
  if (task.action.type === 'fortune_notify') return 'fortune'
  if (task.action.type === 'stocks_report') return 'stocks'
  return 'agent'
}
