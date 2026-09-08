import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { CopyButton } from '../components/CopyButton'
import { ToolShell } from '../components/ToolShell'
import {
  convertTimestampLocal,
  DEFAULT_DAYJS_TIME_FORMAT,
  DEFAULT_TIME_FORMAT,
} from '../lib/time'
import { listTimeZones } from '../lib/timezones'
import { localizeToolError } from '../lib/toolError'
import { ToolError, type TimeUnit, type TimestampConvertResult } from '../lib/types'
import form from './ToolForm.module.css'

export function TimestampPage(): React.JSX.Element {
  const { t } = useTranslation()
  const zones = useMemo(() => listTimeZones(), [])

  const [timestamp, setTimestamp] = useState(`${Date.now()}`)
  const [unit, setUnit] = useState<TimeUnit>('ms')
  const [tsTimezone, setTsTimezone] = useState('Asia/Shanghai')
  const [tsOffset, setTsOffset] = useState('')
  const [tsFormat, setTsFormat] = useState(DEFAULT_TIME_FORMAT)

  const [datetime, setDatetime] = useState(dayjs().format(DEFAULT_DAYJS_TIME_FORMAT))
  const [dtTimezone, setDtTimezone] = useState('Asia/Shanghai')
  const [dtOffset, setDtOffset] = useState('')
  const [dtFormat, setDtFormat] = useState(DEFAULT_TIME_FORMAT)

  const [result, setResult] = useState<TimestampConvertResult | null>(() =>
    convertTimestampLocal({
      mode: 'timestamp_to_datetime',
      timestamp: Date.now(),
      unit: 'ms',
      timezone: 'Asia/Shanghai',
      format: DEFAULT_TIME_FORMAT,
    }),
  )
  const [error, setError] = useState('')

  const runTs = (): void => {
    try {
      setError('')
      const value = Number(timestamp)
      if (Number.isNaN(value)) throw new ToolError('invalidTimestamp')
      setResult(
        convertTimestampLocal({
          mode: 'timestamp_to_datetime',
          timestamp: value,
          unit,
          timezone: tsTimezone,
          offset: tsOffset,
          format: tsFormat,
        }),
      )
    } catch (err) {
      setError(localizeToolError(err, t))
    }
  }

  const runDt = (): void => {
    try {
      setError('')
      const data = convertTimestampLocal({
        mode: 'datetime_to_timestamp',
        datetime,
        timezone: dtTimezone,
        offset: dtOffset,
        format: dtFormat,
      })
      setResult(data)
      setTimestamp(`${data.timestampMilliseconds}`)
      setUnit('ms')
    } catch (err) {
      setError(localizeToolError(err, t))
    }
  }

  return (
    <ToolShell title={t('tools.timestamp.title')} subtitle={t('tools.timestamp.desc')}>
      <div className={form.layout}>
        <div className={form.stack}>
          <div className={form.panel}>
            <p className={form.panelTag}>{t('tools.timestamp.tsToDt')}</p>
            <label className={form.field}>
              <span className={form.label}>{t('tools.timestamp.timestamp')}</span>
              <input
                className={form.input}
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
              />
            </label>
            <div className={form.field}>
              <span className={form.label}>{t('tools.timestamp.unit')}</span>
              <div className={form.segmented}>
                {(['ms', 's'] as TimeUnit[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    className={`${form.segBtn} ${unit === u ? form.segBtnActive : ''}`}
                    onClick={() => setUnit(u)}
                  >
                    {t(`tools.timestamp.unit.${u}`)}
                  </button>
                ))}
              </div>
            </div>
            <label className={form.field}>
              <span className={form.label}>{t('tools.common.timezone')}</span>
              <select
                className={form.select}
                value={tsTimezone}
                onChange={(e) => setTsTimezone(e.target.value)}
              >
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </label>
            <label className={form.field}>
              <span className={form.label}>{t('tools.common.offset')}</span>
              <input
                className={form.input}
                value={tsOffset}
                placeholder={t('tools.common.offsetPlaceholder')}
                onChange={(e) => setTsOffset(e.target.value)}
              />
            </label>
            <label className={form.field}>
              <span className={form.label}>{t('tools.common.format')}</span>
              <input
                className={form.input}
                value={tsFormat}
                onChange={(e) => setTsFormat(e.target.value)}
              />
            </label>
            <div className={form.actions}>
              <button type="button" className={form.primaryBtn} onClick={runTs}>
                {t('tools.timestamp.convertToDatetime')}
              </button>
            </div>
          </div>

          <div className={form.panel}>
            <p className={form.panelTag}>{t('tools.timestamp.dtToTs')}</p>
            <label className={form.field}>
              <span className={form.label}>{t('tools.common.datetime')}</span>
              <input
                className={form.input}
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
                placeholder={DEFAULT_DAYJS_TIME_FORMAT}
              />
            </label>
            <label className={form.field}>
              <span className={form.label}>{t('tools.common.timezone')}</span>
              <select
                className={form.select}
                value={dtTimezone}
                onChange={(e) => setDtTimezone(e.target.value)}
              >
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </label>
            <label className={form.field}>
              <span className={form.label}>{t('tools.common.offset')}</span>
              <input
                className={form.input}
                value={dtOffset}
                placeholder={t('tools.common.offsetPlaceholder')}
                onChange={(e) => setDtOffset(e.target.value)}
              />
            </label>
            <label className={form.field}>
              <span className={form.label}>{t('tools.common.format')}</span>
              <input
                className={form.input}
                value={dtFormat}
                onChange={(e) => setDtFormat(e.target.value)}
              />
            </label>
            <div className={form.actions}>
              <button type="button" className={form.primaryBtn} onClick={runDt}>
                {t('tools.timestamp.convertToTimestamp')}
              </button>
            </div>
          </div>
        </div>

        <div className={form.panel}>
          <p className={form.panelTag}>{t('tools.common.result')}</p>
          {error ? <p className={form.error}>{error}</p> : null}
          {result ? (
            <div className={form.result}>
              <div className={form.resultRow}>
                <div className={form.resultMeta}>
                  <span className={form.resultLabel}>{t('tools.common.datetime')}</span>
                  <span className={form.resultValue}>{result.dateTime}</span>
                </div>
                <CopyButton value={result.dateTime} />
              </div>
              <div className={form.resultRow}>
                <div className={form.resultMeta}>
                  <span className={form.resultLabel}>{t('tools.timestamp.seconds')}</span>
                  <span className={form.resultValue}>{result.timestampSeconds}</span>
                </div>
                <CopyButton value={String(result.timestampSeconds)} />
              </div>
              <div className={form.resultRow}>
                <div className={form.resultMeta}>
                  <span className={form.resultLabel}>{t('tools.timestamp.milliseconds')}</span>
                  <span className={form.resultValue}>{result.timestampMilliseconds}</span>
                </div>
                <CopyButton value={String(result.timestampMilliseconds)} />
              </div>
              <div className={form.resultRow}>
                <div className={form.resultMeta}>
                  <span className={form.resultLabel}>{t('tools.common.timezone')}</span>
                  <span className={form.resultValue}>{result.timezone}</span>
                </div>
                <CopyButton value={result.timezone} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </ToolShell>
  )
}
