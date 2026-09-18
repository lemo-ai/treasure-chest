import { describe, expect, it } from 'vitest'
import { csvEscape, tableToCsv, tablesToWorkbook } from './crawlExport'

describe('crawlExport', () => {
  it('escapes csv fields', () => {
    expect(csvEscape('a')).toBe('a')
    expect(csvEscape('a,b')).toBe('"a,b"')
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""')
  })

  it('builds csv from table', () => {
    const csv = tableToCsv({
      headers: ['name', 'score'],
      rows: [
        ['Ada', '1'],
        ['Lin, Q', '2'],
      ],
    })
    expect(csv).toBe('name,score\nAda,1\n"Lin, Q",2')
  })

  it('builds multi-sheet workbook', () => {
    const wb = tablesToWorkbook([
      { headers: ['a'], rows: [['1']], caption: 'Alpha' },
      { headers: ['b'], rows: [['2']], caption: 'Beta' },
    ])
    expect(wb.SheetNames).toEqual(['Alpha', 'Beta'])
  })
})
