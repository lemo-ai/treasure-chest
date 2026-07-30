/** Calendar system used for birth date input. */
export type BirthCalendar = 'solar' | 'lunar'

/** Traditional Chinese hour branches; `unknown` skips the hour pillar. */
export type BirthHourBranch =
  | 'unknown'
  | 'zi'
  | 'chou'
  | 'yin'
  | 'mao'
  | 'chen'
  | 'si'
  | 'wu'
  | 'wei'
  | 'shen'
  | 'you'
  | 'xu'
  | 'hai'

export const BIRTH_HOUR_BRANCHES: BirthHourBranch[] = [
  'unknown',
  'zi',
  'chou',
  'yin',
  'mao',
  'chen',
  'si',
  'wu',
  'wei',
  'shen',
  'you',
  'xu',
  'hai',
]

export type FortuneInputMode = 'birthDate' | 'bazi'

export interface BirthProfile {
  id: string
  name: string
  inputMode: FortuneInputMode
  /** YYYY-MM-DD when inputMode is birthDate */
  birthDate?: string
  birthCalendar?: BirthCalendar
  hourBranch?: BirthHourBranch
  /** Four pillars when inputMode is bazi, e.g. 甲子 */
  yearPillar?: string
  monthPillar?: string
  dayPillar?: string
  hourPillar?: string
  updatedAt: string
}

export interface BaZiSnapshot {
  year: string
  month: string
  day: string
  hour: string | null
  dayMaster: string
  hourKnown: boolean
  animal: string
  yinYang: 'yang' | 'yin'
  element: string
}

export type FortuneLevel = 'excellent' | 'good' | 'fair' | 'caution'

export type HexagramTendency = 'favorable' | 'neutral' | 'caution'

export interface HexagramInfo {
  id: number
  name: string
  nameFull: string
  nameEn: string
  tendency: HexagramTendency
}

export type FortuneAspectKey = 'career' | 'wealth' | 'relationship' | 'health' | 'mood'

export interface FortuneAspect {
  score: number
  level: FortuneLevel
  blurb: string
}

export interface DailyFortune {
  date: string
  profileId: string
  bazi: BaZiSnapshot
  hexagram: HexagramInfo & {
    summary: string
    advice: string
  }
  overall: {
    score: number
    level: FortuneLevel
    blurb: string
  }
  aspects: Record<FortuneAspectKey, FortuneAspect>
  lucky: {
    colors: string[]
    directions: string[]
    numbers: number[]
  }
  disclaimer: string
  source: {
    engine: string
    aiPolished: boolean
  }
}
