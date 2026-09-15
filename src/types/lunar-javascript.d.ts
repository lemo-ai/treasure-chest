declare module 'lunar-javascript' {
  export class Solar {
    static fromDate(date: Date): Solar
    static fromYmd(year: number, month: number, day: number): Solar
    static fromYmdHms(year: number, month: number, day: number, hour: number, minute: number, second: number): Solar
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
    /** 1 workday, 2 rest, 3 triple-pay holiday (statutory). */
    getSalaryRate(): number
  }

  export class Holiday {
    getDay(): string
    getName(): string
    isWork(): boolean
    getTarget(): string
    toString(): string
  }

  export class HolidayUtil {
    static getHoliday(year: number, month: number, day: number): Holiday | null
    static getHoliday(ymd: string): Holiday | null
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
    static fromYmdHms(year: number, month: number, day: number, hour: number, minute: number, second: number): Lunar
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
    getEightChar(): EightChar
    toString(): string
  }

  export class EightChar {
    getYear(): string
    getMonth(): string
    getDay(): string
    getTime(): string
  }

  export class JieQi {
    getName(): string
    getSolar(): Solar
  }
}
