import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { CopyButton } from '../components/CopyButton'
import { ToolShell } from '../components/ToolShell'
import {
  convertTimezoneLocal,
  DEFAULT_DAYJS_TIME_FORMAT,
  DEFAULT_TIME_FORMAT,
} from '../lib/time'
import { listTimeZones } from '../lib/timezones'
import { localizeToolError } from '../lib/toolError'
import type { TimeUnit, TimezoneConvertResult, TimezoneSourceType } from '../lib/types'
import form from './ToolForm.module.css'

type ZoneMode = 'timezone' | 'offset'

export function TimezonePage(): React.JSX.Element {
  const { t } = useTranslation()
  const zones = useMemo(() => listTimeZones(), [])

  const [sourceType, setSourceType] = useState<TimezoneSourceType>('datetime')
  const [datetime, setDatetime] = useState(dayjs().format(DEFAULT_DAYJS_TIME_FORMAT))
  const [timestamp, setTimestamp] = useState(`${Date.now()}`)
  const [sourceUnit, setSourceUnit] = useState<TimeUnit>('ms')
  const [sourceMode, setSourceMode] = useState<ZoneMode>('timezone')
  const [sourceTimezone, setSourceTimezone] = useState('Asia/Shanghai')
  const [sourceOffset, setSourceOffset] = useState('')
  const [targetMode, setTargetMode] = useState<ZoneMode>('timezone')
  const [targetTimezone, setTargetTimezone] = useState('UTC')
  const [targetOffset, setTargetOffset] = useState('')
  const [format, setFormat] = useState(DEFAULT_TIME_FORMAT)
  const [error, setError] = useState('')
  const [result, setResult] = useState<TimezoneConvertResult | null>(() =>
    convertTimezoneLocal({
      sourceValue: dayjs().format(DEFAULT_DAYJS_TIME_FORMAT),
      sourceType: 'datetime',
      sourceTimezone: 'Asia/Shanghai',
      targetTimezone: 'UTC',
      format: DEFAULT_TIME_FORMAT,
    }),
  )

  const run = (): void => {
    try {
      setError('')
      const value = sourceType === 'datetime' ? datetime : timestamp
      setResult(
        convertTimezoneLocal({
          sourceValue: value,
          sourceType,
          sourceUnit: sourceType === 'timestamp' ? sourceUnit : undefined,
          sourceTimezone: sourceMode === 'timezone' ? sourceTimezone : undefined,
          targetTimezone: targetMode === 'timezone' ? targetTimezone : undefined,
          offset: sourceMode === 'offset' ? sourceOffset : undefined,
          targetOffset: targetMode === 'offset' ? targetOffset : undefined,
          format,
        }),
      )
    } catch (err) {
      setError(localizeToolError(err, t))
    }
  }

  return (
    <ToolShell title={t('tools.timezone.title')} subtitle={t('tools.timezone.desc')}>
      <div className={form.layout}>
        <div className={form.panel}>
          <p className={form.panelTag}>{t('tools.timezone.convert')}</p>

          <div className={form.field}>
            <span className={form.label}>{t('tools.timezone.sourceType')}</span>
            <div className={form.segmented}>
              {(['datetime', 'timestamp'] as TimezoneSourceType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`${form.segBtn} ${sourceType === type ? form.segBtnActive : ''}`}
                  onClick={() => setSourceType(type)}
                >
                  {t(`tools.timezone.sourceType.${type}`)}
                </button>
              ))}
            </div>
          </div>

          {sourceType === 'datetime' ? (
            <label className={form.field}>
              <span className={form.label}>{t('tools.common.datetime')}</span>
              <input
                className={form.input}
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
              />
            </label>
          ) : (
            <div className={form.row}>
              <label className={form.field}>
                <span className={form.label}>{t('tools.timestamp.timestamp')}</span>
                <input
                  className={form.input}
                  value={timestamp}
                  onChange={(e) => setTimestamp(e.target.value)}
                />
              </label>
              <label className={form.field}>
                <span className={form.label}>{t('tools.timestamp.unit')}</span>
                <select
                  className={form.select}
                  value={sourceUnit}
                  onChange={(e) => setSourceUnit(e.target.value as TimeUnit)}
                >
                  <option value="ms">{t('tools.timestamp.unit.ms')}</option>
                  <option value="s">{t('tools.timestamp.unit.s')}</option>
                </select>
              </label>
            </div>
          )}

          <div className={form.field}>
            <span className={form.label}>{t('tools.timezone.sourceMode')}</span>
            <div className={form.segmented}>
              {(['timezone', 'offset'] as ZoneMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`${form.segBtn} ${sourceMode === mode ? form.segBtnActive : ''}`}
                  onClick={() => setSourceMode(mode)}
                >
                  {t(`tools.common.mode.${mode}`)}
                </button>
              ))}
            </div>
          </div>
          {sourceMode === 'timezone' ? (
            <label className={form.field}>
              <span className={form.label}>{t('tools.timezone.sourceTimezone')}</span>
              <select
                className={form.select}
                value={sourceTimezone}
                onChange={(e) => setSourceTimezone(e.target.value)}
              >
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className={form.field}>
              <span className={form.label}>{t('tools.timezone.sourceOffset')}</span>
              <input
                className={form.input}
                value={sourceOffset}
                placeholder={t('tools.common.offsetPlaceholder')}
                onChange={(e) => setSourceOffset(e.target.value)}
              />
            </label>
          )}

          <div className={form.field}>
            <span className={form.label}>{t('tools.timezone.targetMode')}</span>
            <div className={form.segmented}>
              {(['timezone', 'offset'] as ZoneMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`${form.segBtn} ${targetMode === mode ? form.segBtnActive : ''}`}
                  onClick={() => setTargetMode(mode)}
                >
                  {t(`tools.common.mode.${mode}`)}
                </button>
              ))}
            </div>
          </div>
          {targetMode === 'timezone' ? (
            <label className={form.field}>
              <span className={form.label}>{t('tools.timezone.targetTimezone')}</span>
              <select
                className={form.select}
                value={targetTimezone}
                onChange={(e) => setTargetTimezone(e.target.value)}
              >
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className={form.field}>
              <span className={form.label}>{t('tools.timezone.targetOffset')}</span>
              <input
                className={form.input}
                value={targetOffset}
                placeholder={t('tools.common.offsetPlaceholder')}
                onChange={(e) => setTargetOffset(e.target.value)}
              />
            </label>
          )}

          <label className={form.field}>
            <span className={form.label}>{t('tools.common.format')}</span>
            <input className={form.input} value={format} onChange={(e) => setFormat(e.target.value)} />
          </label>

          <div className={form.actions}>
            <button type="button" className={form.primaryBtn} onClick={run}>
              {t('tools.timezone.convert')}
            </button>
          </div>
        </div>

        <div className={form.panel}>
          <p className={form.panelTag}>{t('tools.common.result')}</p>
          {error ? <p className={form.error}>{error}</p> : null}
          {result ? (
            <div className={form.result}>
              <div className={form.resultRow}>
                <div className={form.resultMeta}>
                  <span className={form.resultLabel}>{t('tools.timezone.sourceResult')}</span>
                  <span className={form.resultValue}>
                    {result.sourceDateTime} ({result.sourceTimezone})
                  </span>
                </div>
                <CopyButton value={result.sourceDateTime} />
              </div>
              <div className={form.resultRow}>
                <div className={form.resultMeta}>
                  <span className={form.resultLabel}>{t('tools.timezone.targetResult')}</span>
                  <span className={form.resultValue}>
                    {result.targetDateTime} ({result.targetTimezone})
                  </span>
                </div>
                <CopyButton value={result.targetDateTime} />
              </div>
              <div className={form.resultRow}>
                <div className={form.resultMeta}>
                  <span className={form.resultLabel}>{t('tools.timestamp.milliseconds')}</span>
                  <span className={form.resultValue}>{result.timestampMilliseconds}</span>
                </div>
                <CopyButton value={String(result.timestampMilliseconds)} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </ToolShell>
  )
}
