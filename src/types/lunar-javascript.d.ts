declare module 'lunar-javascript' {
  export class Solar {
    static fromDate(date: Date): Solar
    static fromYmd(year: number, month: number, day: number): Solar
    getYear(): number
    getMonth(): number
    getDay(): number
    getWeek(): number
    getWeekInChinese(): string
    getSolarWeek(start: number): SolarWeek
    getFestivals(): string[]
    getOtherFestivals(): string[]
    getLunar(): Lunar
    next(days: number): Solar
    toYmd(): string
  }

  export class SolarWeek {
    getIndex(): number
    toString(): string
  }

  export class SolarMonth {
    static fromYm(year: number, month: number): SolarMonth
    getDays(): Solar[]
  }

  export class Lunar {
    getYearInChinese(): string
    getMonthInChinese(): string
    getDayInChinese(): string
    getYearInGanZhi(): string
    getMonthInGanZhi(): string
    getDayInGanZhi(): string
    getYearShengXiao(): string
    getFestivals(): string[]
    getOtherFestivals(): string[]
    getJieQi(): string
    getNextJieQi(): JieQi | null
    getPrevJieQi(): JieQi | null
    getDayYi(): string[]
    getDayJi(): string[]
    toString(): string
  }

  export class JieQi {
    getName(): string
    getSolar(): Solar
  }
}
