import type {
  BirthProfile,
  DailyFortune,
  FortuneAspect,
  FortuneAspectKey,
  FortuneLevel,
  FortuneSettings,
  HexagramSchool,
  HexagramTendency,
} from '@shared'
import { DEFAULT_FORTUNE_SETTINGS } from '@shared'
import { Solar } from 'lunar-javascript'
import { computeBaZiFromProfile } from './BaZiService'
import { getHexagramById } from './hexagrams'

const ASPECT_KEYS: FortuneAspectKey[] = ['career', 'wealth', 'relationship', 'health', 'mood']

const COLORS = ['青绿', '天蓝', '暖金', '霜白', '潮青']
const DIRECTIONS = ['东', '南', '西', '北', '东南', '西南']

function hashSeed(...parts: string[]): number {
  let h = 2166136261
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
  }
  return h >>> 0
}

function scoreToLevel(score: number): FortuneLevel {
  if (score >= 85) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 55) return 'fair'
  return 'caution'
}

function deriveScore(seed: number, salt: number, min = 52, max = 92): number {
  const v = (seed ^ Math.imul(salt, 2654435761)) >>> 0
  return min + (v % (max - min + 1))
}

function aspectBlurb(key: FortuneAspectKey, level: FortuneLevel, locale: string): string {
  const zh: Record<FortuneAspectKey, Record<FortuneLevel, string>> = {
    career: {
      excellent: '思路清晰，适合推进关键事项或展示成果。',
      good: '稳步推进即可，把重点放在一件最重要的事上。',
      fair: '宜先整理优先级，避免同时开太多战线。',
      caution: '今天适合复盘与准备，重大决策可缓一缓。',
    },
    wealth: {
      excellent: '正财稳健，小额规划或整理账目都有收获。',
      good: '收支平衡，适合记账与长期安排。',
      fair: '控制冲动消费，留意细节条款。',
      caution: '不宜冒进投资，守成为上。',
    },
    relationship: {
      excellent: '沟通顺畅，适合表达感谢或联络重要的人。',
      good: '保持真诚与耐心，关系会逐步升温。',
      fair: '多听少说，给彼此一点空间。',
      caution: '避免带情绪对话，先冷静再交流。',
    },
    health: {
      excellent: '精力不错，适度活动有助于状态。',
      good: '作息规律即可，别透支。',
      fair: '注意补水与拉伸，别久坐。',
      caution: '放慢节奏，保证睡眠。',
    },
    mood: {
      excellent: '心境开阔，适合记录灵感或整理思绪。',
      good: '保持平常心，小确幸也能点亮一天。',
      fair: '给自己留一点独处时间。',
      caution: '少刷负面信息，做点轻松的小事。',
    },
  }
  const en: Record<FortuneAspectKey, Record<FortuneLevel, string>> = {
    career: {
      excellent: 'Clear focus — good for key tasks and visibility.',
      good: 'Steady progress; prioritize one main goal.',
      fair: 'Sort priorities before taking on more.',
      caution: 'Review and prepare; defer big decisions.',
    },
    wealth: {
      excellent: 'Stable flow; budgeting and planning pay off.',
      good: 'Balance income and spending; plan ahead.',
      fair: 'Watch impulse buys and fine print.',
      caution: 'Avoid risky bets; preserve capital.',
    },
    relationship: {
      excellent: 'Smooth talks — reach out to people who matter.',
      good: 'Patience and sincerity strengthen bonds.',
      fair: 'Listen more; give others breathing room.',
      caution: 'Cool down before difficult conversations.',
    },
    health: {
      excellent: 'Good energy — light activity helps.',
      good: 'Keep regular routines; avoid overwork.',
      fair: 'Hydrate, stretch, and break up sitting.',
      caution: 'Slow down and protect your sleep.',
    },
    mood: {
      excellent: 'Open mind — jot ideas or tidy thoughts.',
      good: 'Small joys can brighten the day.',
      fair: 'Schedule quiet time for yourself.',
      caution: 'Limit doom-scrolling; do something light.',
    },
  }
  const table = locale.startsWith('en') ? en : zh
  return table[key][level]
}

function hexagramCopy(
  hexId: number,
  tendency: string,
  locale: string,
): { summary: string; advice: string } {
  const hex = getHexagramById(hexId)
  if (locale.startsWith('en')) {
    const summaries: Record<string, string> = {
      favorable: `${hex.nameEn} (${hex.nameFull}) — supportive energy for aligned action.`,
      neutral: `${hex.nameEn} (${hex.nameFull}) — observe and adapt; no rush.`,
      caution: `${hex.nameEn} (${hex.nameFull}) — proceed carefully and simplify.`,
    }
    const advices: Record<string, string> = {
      favorable: 'Move on what you have already prepared; cooperation helps.',
      neutral: 'Stay flexible and finish small wins first.',
      caution: 'Reduce scope, double-check, and avoid unnecessary risks.',
    }
    return { summary: summaries[tendency] ?? summaries.neutral!, advice: advices[tendency] ?? advices.neutral! }
  }
  const summaries: Record<string, string> = {
    favorable: `「${hex.nameFull}」气运偏助，宜顺势而行、与人同心。`,
    neutral: `「${hex.nameFull}」气运平和，宜观察形势、小步验证。`,
    caution: `「${hex.nameFull}」气运宜慎，先简后繁、守正待机。`,
  }
  const advices: Record<string, string> = {
    favorable: '把已准备的事推进一步，主动沟通比独自纠结更有效。',
    neutral: '先完成眼前一件小事，再决定是否加码。',
    caution: '缩减战线，复核细节，避免情绪化决策。',
  }
  return { summary: summaries[tendency] ?? summaries.neutral!, advice: advices[tendency] ?? advices.neutral! }
}

function overallBlurb(level: FortuneLevel, locale: string): string {
  const zh: Record<FortuneLevel, string> = {
    excellent: '整体气场较顺，把握节奏即可。',
    good: '整体平稳向上，按计划推进。',
    fair: '起伏不大，宜守不宜攻。',
    caution: '宜静不宜动，先调整状态。',
  }
  const en: Record<FortuneLevel, string> = {
    excellent: 'Overall flow is supportive — keep your rhythm.',
    good: 'Steady and upward; follow your plan.',
    fair: 'Moderate day — conserve energy.',
    caution: 'A quiet day — reset before pushing hard.',
  }
  return locale.startsWith('en') ? en[level] : zh[level]
}

function tendencyLabel(tendency: HexagramTendency, locale: string): string {
  if (locale.startsWith('en')) {
    return tendency === 'favorable' ? 'favorable' : tendency
  }
  const map: Record<HexagramTendency, string> = {
    favorable: '吉',
    neutral: '平',
    caution: '慎',
  }
  return map[tendency] ?? '平'
}

function levelLabel(level: FortuneLevel, locale: string): string {
  if (locale.startsWith('en')) {
    return level === 'excellent' ? 'Excellent' : level
  }
  const map: Record<FortuneLevel, string> = {
    excellent: '优',
    good: '良',
    fair: '平',
    caution: '慎',
  }
  return map[level] ?? '平'
}

function buildAiAnalysis(input: {
  locale: string
  bazi: { dayMaster: string; element: string; hourKnown: boolean }
  hexagram: { id: number; nameFull: string; nameEn: string; tendency: HexagramTendency }
  overall: { level: FortuneLevel; score: number; blurb: string }
  aspects: Record<FortuneAspectKey, FortuneAspect>
  lucky: { colors: string[]; directions: string[]; numbers: number[] }
}): string {
  const { locale, bazi, hexagram, overall, aspects, lucky } = input

  const entries = Object.entries(aspects) as Array<[FortuneAspectKey, FortuneAspect]>
  entries.sort((a, b) => b[1].score - a[1].score)
  const top = entries.slice(0, 2)

  const hexName = locale.startsWith('en') ? hexagram.nameEn : hexagram.nameFull
  const tendency = tendencyLabel(hexagram.tendency, locale)
  const lvl = levelLabel(overall.level, locale)
  const hourLine = bazi.hourKnown
    ? locale.startsWith('en')
      ? 'Hour pillar is included.'
      : '已纳入时柱。'
    : locale.startsWith('en')
      ? 'Hour pillar is not used.'
      : '未使用时柱。'

  const aspectNameZh: Record<FortuneAspectKey, string> = {
    career: '事业 / 学业',
    wealth: '财运',
    relationship: '感情 / 人际',
    health: '健康',
    mood: '情绪',
  }
  const aspectNameEn: Record<FortuneAspectKey, string> = {
    career: 'Career / study',
    wealth: 'Wealth',
    relationship: 'Relationships',
    health: 'Health',
    mood: 'Mood',
  }
  const aspectName = locale.startsWith('en') ? aspectNameEn : aspectNameZh

  const topLine = top
    .map(([k, a]) => {
      const prefix = locale.startsWith('en') ? `${aspectName[k]} (${a.score})` : `${aspectName[k]}：${a.score}`
      return `${prefix} — ${a.blurb}`
    })
    .join(locale.startsWith('en') ? '\n' : '\n')

  const luckyLine = locale.startsWith('en')
    ? `Lucky colors: ${lucky.colors.join(', ')}\nLucky direction: ${lucky.directions.join(', ')}\nLucky numbers: ${lucky.numbers.join(' / ')}`
    : `幸运色：${lucky.colors.join('、')}\n方位：${lucky.directions.join('、')}\n数字：${lucky.numbers.join(' / ')}`

  if (locale.startsWith('en')) {
    return [
      'AI analysis result (local polish)',
      `Overall: ${lvl} (${overall.score}) — ${overall.blurb}`,
      `Day master: ${bazi.dayMaster} (Element: ${bazi.element})`,
      `Hexagram: ${hexName} (#${hexagram.id}), tendency: ${tendency}`,
      hourLine,
      '',
      'Top aspects (by score):',
      topLine,
      '',
      'Open-journey hints:',
      luckyLine,
    ].join('\n')
  }

  return [
    'AI分析结果（本地润色补写）',
    `总评：${lvl}（${overall.score}）——${overall.blurb}`,
    `日主：${bazi.dayMaster}，五行：${bazi.element}`,
    `卦象：${hexagram.nameFull}（#${hexagram.id}），偏向：${tendency}`,
    hourLine,
    '',
    '重点分项（按分数高低）：',
    topLine,
    '',
    '开运提示：',
    luckyLine,
  ].join('\n')
}

function todayGanZhi(date: Date): string {
  const solar = Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate())
  const lunar = solar.getLunar()
  return lunar.getDayInGanZhi()
}

function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function hexagramIdForSchool(
  school: HexagramSchool,
  profileId: string,
  bazi: { dayMaster: string; day: string },
  dayGz: string,
  dateStr: string,
): number {
  if (school === 'meihua') {
    const seed = hashSeed('meihua', dateStr, bazi.dayMaster, dayGz)
    return (seed % 64) + 1
  }
  if (school === 'liuyao') {
    const seed = hashSeed('liuyao', profileId, bazi.day, dayGz, dateStr)
    return (seed % 64) + 1
  }
  const seed = hashSeed(profileId, bazi.dayMaster, bazi.day, dayGz, dateStr)
  return (seed % 64) + 1
}

export function computeDailyFortune(
  profile: BirthProfile,
  date: Date = new Date(),
  locale = 'zh-CN',
  options: Partial<FortuneSettings> = {},
): DailyFortune | null {
  const bazi = computeBaZiFromProfile(profile)
  if (!bazi) return null

  const settings = { ...DEFAULT_FORTUNE_SETTINGS, ...options }
  const dateStr = formatDate(date)
  const dayGz = todayGanZhi(date)
  const hexId = hexagramIdForSchool(settings.hexagramSchool, profile.id, bazi, dayGz, dateStr)
  const seed = hashSeed(settings.hexagramSchool, profile.id, bazi.dayMaster, bazi.day, dayGz, dateStr)
  const hex = getHexagramById(hexId)
  const copy = hexagramCopy(hexId, hex.tendency, locale)

  const aspects = {} as Record<FortuneAspectKey, FortuneAspect>
  let total = 0
  ASPECT_KEYS.forEach((key, idx) => {
    const score = deriveScore(seed, idx + 1)
    const level = scoreToLevel(score)
    aspects[key] = { score, level, blurb: aspectBlurb(key, level, locale) }
    total += score
  })

  const overallScore = Math.round(total / ASPECT_KEYS.length)
  const overallLevel = scoreToLevel(overallScore)

  const luckySeed = hashSeed(dateStr, bazi.dayMaster)
  const colors = [COLORS[luckySeed % COLORS.length]!, COLORS[(luckySeed >> 3) % COLORS.length]!]
  const directions = [DIRECTIONS[luckySeed % DIRECTIONS.length]!]
  const numbers = [(luckySeed % 9) + 1, ((luckySeed >> 4) % 9) + 1]

  const aspectsOut = aspects
  const aiAnalysis = settings.aiPolish
    ? buildAiAnalysis({
        locale,
        bazi: { dayMaster: bazi.dayMaster, element: bazi.element, hourKnown: bazi.hourKnown },
        hexagram: { id: hexId, nameFull: hex.nameFull, nameEn: hex.nameEn, tendency: hex.tendency },
        overall: { level: overallLevel, score: overallScore, blurb: overallBlurb(overallLevel, locale) },
        aspects: aspectsOut,
        lucky: { colors, directions, numbers },
      })
    : undefined

  return {
    date: dateStr,
    profileId: profile.id,
    bazi,
    hexagram: { ...hex, ...copy },
    overall: {
      score: overallScore,
      level: overallLevel,
      blurb: overallBlurb(overallLevel, locale),
    },
    aspects: aspectsOut,
    lucky: { colors, directions, numbers },
    disclaimer: locale.startsWith('en')
      ? 'For cultural entertainment only; not professional advice.'
      : '仅供传统文化娱乐参考，不构成任何现实决策建议。',
    source: { engine: `local-v1/${settings.hexagramSchool}`, aiPolished: settings.aiPolish },
    aiAnalysis,
  }
}

export function fortuneSummaryLine(fortune: DailyFortune, locale: string): string {
  const hexLabel = locale.startsWith('en')
    ? `${fortune.hexagram.nameEn} · ${fortune.overall.level}`
    : `${fortune.hexagram.nameFull} · ${fortune.overall.blurb.slice(0, 12)}`
  return hexLabel
}
