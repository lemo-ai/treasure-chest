import bgFortune from '@renderer/assets/schedule-bg-fortune.png'
import bgStocks from '@renderer/assets/schedule-bg-stocks.png'
import type { ScheduleCoverPreset, ScheduleTask } from '@shared'
import { isUsableCoverUrl } from './scheduleCover'

export function resolveScheduleCoverUrl(task: ScheduleTask): string | null {
  if (isUsableCoverUrl(task.coverImage)) return task.coverImage.trim()
  const preset = task.coverPreset || inferPreset(task)
  if (preset === 'fortune') return bgFortune
  if (preset === 'stocks') return bgStocks
  return null
}

export function inferPreset(task: ScheduleTask): ScheduleCoverPreset {
  if (task.coverPreset) return task.coverPreset
  if (task.action.type === 'fortune_notify') return 'fortune'
  if (task.action.type === 'stocks_report') return 'stocks'
  if (task.coverImage) return 'custom'
  return 'agent'
}
