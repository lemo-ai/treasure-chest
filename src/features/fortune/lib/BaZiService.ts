import { Lunar, Solar } from 'lunar-javascript'
import type { BaZiSnapshot, BirthCalendar, BirthHourBranch, BirthProfile } from '@shared'

const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const
const ANIMALS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'] as const

const ELEMENT_BY_GAN: Record<string, string> = {
  甲: '木',
  乙: '木',
  丙: '火',
  丁: '火',
  戊: '土',
  己: '土',
  庚: '金',
  辛: '金',
  壬: '水',
  癸: '水',
}

/** Mid-hour sample for each branch (traditional 时辰). */
const HOUR_BRANCH_TIME: Record<Exclude<BirthHourBranch, 'unknown'>, [number, number]> = {
  zi: [0, 0],
  chou: [2, 0],
  yin: [4, 0],
  mao: [6, 0],
  chen: [8, 0],
  si: [10, 0],
  wu: [12, 0],
  wei: [14, 0],
  shen: [16, 0],
  you: [18, 0],
  xu: [20, 0],
  hai: [22, 0],
}

function isValidGanZhi(value: string): boolean {
  if (value.length !== 2) return false
  return GAN.includes(value[0] as (typeof GAN)[number]) && ZHI.includes(value[1] as (typeof ZHI)[number])
}

function animalFromYearPillar(year: string): string {
  const zhi = year[1]
  const idx = ZHI.indexOf(zhi as (typeof ZHI)[number])
  return idx >= 0 ? ANIMALS[idx]! : ''
}

function dayMasterMeta(dayMaster: string): Pick<BaZiSnapshot, 'yinYang' | 'element'> {
  const yangGan = ['甲', '丙', '戊', '庚', '壬']
  return {
    yinYang: yangGan.includes(dayMaster) ? 'yang' : 'yin',
    element: ELEMENT_BY_GAN[dayMaster] ?? '土',
  }
}

function snapshotFromPillars(
  year: string,
  month: string,
  day: string,
  hour: string | null,
  animal: string,
): BaZiSnapshot {
  const dayMaster = day[0] ?? '甲'
  return {
    year,
    month,
    day,
    hour,
    dayMaster,
    hourKnown: hour !== null,
    animal,
    ...dayMasterMeta(dayMaster),
  }
}

function lunarFromBirth(
  y: number,
  m: number,
  d: number,
  calendar: BirthCalendar,
  hourBranch: BirthHourBranch,
): ReturnType<typeof Lunar.fromYmdHms> {
  const [hh, mm] =
    hourBranch !== 'unknown' ? HOUR_BRANCH_TIME[hourBranch] : ([12, 0] as [number, number])
  const hasHour = hourBranch !== 'unknown'

  if (calendar === 'lunar') {
    return hasHour ? Lunar.fromYmdHms(y, m, d, hh, mm, 0) : Lunar.fromYmdHms(y, m, d, 12, 0, 0)
  }

  const solar = hasHour ? Solar.fromYmdHms(y, m, d, hh, mm, 0) : Solar.fromYmd(y, m, d)
  return solar.getLunar()
}

export function computeBaZiFromProfile(profile: BirthProfile): BaZiSnapshot | null {
  if (profile.inputMode === 'bazi') {
    const year = profile.yearPillar?.trim() ?? ''
    const month = profile.monthPillar?.trim() ?? ''
    const day = profile.dayPillar?.trim() ?? ''
    const hourRaw = profile.hourPillar?.trim()
    if (!isValidGanZhi(year) || !isValidGanZhi(month) || !isValidGanZhi(day)) return null
    const hourKnown = Boolean(hourRaw && isValidGanZhi(hourRaw))
    const hour = hourKnown ? hourRaw! : null
    return snapshotFromPillars(year, month, day, hour, animalFromYearPillar(year))
  }

  if (!profile.birthDate) return null
  const [y, m, d] = profile.birthDate.split('-').map(Number)
  if (!y || !m || !d) return null

  const calendar = profile.birthCalendar ?? 'solar'
  const hourBranch = profile.hourBranch ?? 'unknown'
  const lunar = lunarFromBirth(y, m, d, calendar, hourBranch)
  const eight = lunar.getEightChar()
  const hourKnown = hourBranch !== 'unknown'

  return snapshotFromPillars(
    eight.getYear(),
    eight.getMonth(),
    eight.getDay(),
    hourKnown ? eight.getTime() : null,
    lunar.getYearShengXiao(),
  )
}

export function validateBaziPillars(
  year: string,
  month: string,
  day: string,
  hour?: string,
): string | null {
  if (!isValidGanZhi(year)) return 'invalidYear'
  if (!isValidGanZhi(month)) return 'invalidMonth'
  if (!isValidGanZhi(day)) return 'invalidDay'
  if (hour && hour.length > 0 && !isValidGanZhi(hour)) return 'invalidHour'
  return null
}
