import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  localLlmInstallRuntime,
  localLlmIsOllamaFamily,
  localLlmFamilyByOllamaName,
  localLlmPullName,
  localLlmTierForVersion,
  type LocalLlmFamily,
  type LocalLlmFamilyState,
  type LocalLlmInstalledModel,
  type LocalLlmModality,
  type LocalLlmPullProgress,
  type LocalLlmRemoteTag,
  type LocalLlmSnapshot,
  type LocalLlmTier,
  type LocalLlmVendor,
} from '@shared'
import { SettingActionButton } from '@renderer/shared/ui/SettingActionButton'
import { IconDownload, IconKey, IconUpload } from '@renderer/shared/ui/icons'
import pageStyles from '../pages/SettingsPage.module.css'
import styles from './LocalModelsPanel.module.css'

interface LocalModelsPanelProps {
  onApplied?: () => void
  onOpenModelsApi?: () => void
}

/** Top-level IA: chat (Ollama) · media tools · manage installed */
type Lane = 'chat' | 'media' | 'manage'

const CHAT_MODALITIES: LocalLlmModality[] = ['text', 'reasoning', 'code', 'vision', 'embedding']
const MEDIA_MODALITIES: LocalLlmModality[] = ['image', 'speech', 'video', 'mesh3d']

type SuitabilityFilter = 'recommended' | 'all' | 'installed'

function formatBytes(n: number): string {
  if (!n || n <= 0) return '—'
  const gb = n / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${(n / (1024 * 1024)).toFixed(0)} MB`
}

function platformLabel(platform: string, t: (k: string) => string): string {
  if (platform === 'darwin') return t('settings.localLlm.platform.mac')
  if (platform === 'win32') return t('settings.localLlm.platform.windows')
  if (platform === 'linux') return t('settings.localLlm.platform.linux')
  return t('settings.localLlm.platform.other')
}

function tierClass(tier: LocalLlmTier): string {
  if (tier === 'recommended') return styles.capOk
  if (tier === 'avoid') return styles.capBad
  return styles.capMuted
}

function errorText(t: (k: string) => string, code?: string): string {
  if (!code) return t('settings.localLlm.error.generic')
  const key = `settings.localLlm.error.${code}`
  const translated = t(key)
  return translated === key ? code : translated
}

function defaultTag(family: LocalLlmFamily, installedTags: string[]): string {
  if (installedTags.length > 0) return installedTags[0]!
  const d = family.versions.find((v) => v.default) ?? family.versions[0]
  return d?.tag ?? 'latest'
}

export function LocalModelsPanel({
  onApplied,
  onOpenModelsApi,
}: LocalModelsPanelProps): React.JSX.Element {
  const { t } = useTranslation()
  const [snap, setSnap] = useState<LocalLlmSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [pulling, setPulling] = useState<string | null>(null)
  const [progress, setProgress] = useState<LocalLlmPullProgress | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [hintOk, setHintOk] = useState(false)
  const [query, setQuery] = useState('')
  const [lane, setLane] = useState<Lane>('chat')
  const [chatModality, setChatModality] = useState<LocalLlmModality>('text')
  const [mediaModality, setMediaModality] = useState<LocalLlmModality>('image')
  const [vendor, setVendor] = useState<'all' | LocalLlmVendor>('all')
  const [suit, setSuit] = useState<SuitabilityFilter>('recommended')
  const [selectedTag, setSelectedTag] = useState<Record<string, string>>({})
  const [customName, setCustomName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmAvoid, setConfirmAvoid] = useState<string | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [detailText, setDetailText] = useState<string | null>(null)
  const [remoteTags, setRemoteTags] = useState<Record<string, LocalLlmRemoteTag[]>>({})
  const [remoteBusy, setRemoteBusy] = useState<string | null>(null)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)

  const activeModality = lane === 'media' ? mediaModality : chatModality

  const refresh = useCallback(async () => {
    const next = await window.treasureChest.getLocalLlmSnapshot()
    setSnap(next)
    if (next.pullingModel) setPulling(next.pullingModel)
  }, [])

  useEffect(() => {
    void refresh().catch((err) => {
      setHintOk(false)
      setHint(err instanceof Error ? err.message : t('settings.localLlm.loadFailed'))
    })
  }, [refresh, t])

  useEffect(() => {
    return window.treasureChest.onLocalLlmPullProgress((payload) => {
      setProgress(payload)
      setPulling(payload.phase === 'done' || payload.phase === 'error' ? null : payload.model)
      if (payload.phase === 'done') {
        void refresh()
        setHintOk(true)
        setHint(t('settings.localLlm.pullDone', { model: payload.model }))
      } else if (payload.phase === 'error') {
        void refresh()
        if (payload.error && payload.error !== 'aborted') {
          setHintOk(false)
          setHint(errorText(t, payload.error))
        }
      }
    })
  }, [refresh, t])

  const modalityCounts = useMemo(() => {
    const counts: Partial<Record<LocalLlmModality, number>> = {}
    if (!snap) return counts
    for (const row of snap.families) {
      const m = row.family.modality
      counts[m] = (counts[m] ?? 0) + 1
    }
    return counts
  }, [snap])

  const vendorsInType = useMemo(() => {
    if (!snap || lane === 'manage') return [] as LocalLlmVendor[]
    return Array.from(
      new Set(
        snap.families
          .filter((f) => f.family.modality === activeModality)
          .map((f) => f.family.vendor),
      ),
    ).sort()
  }, [snap, lane, activeModality])

  const families = useMemo(() => {
    if (!snap || lane === 'manage') return [] as LocalLlmFamilyState[]
    const q = query.trim().toLowerCase()
    return snap.families
      .filter((row) => {
        if (row.family.modality !== activeModality) return false
        if (vendor !== 'all' && row.family.vendor !== vendor) return false
        if (suit === 'installed' && row.installedNames.length === 0) return false
        if (suit === 'recommended' && row.bestTier === 'avoid' && row.installedNames.length === 0) {
          return false
        }
        if (!q) return true
        const hay = [
          row.family.id,
          row.family.ollamaModel,
          t(row.family.nameKey),
          t(row.family.descKey),
          row.family.vendor,
          ...row.family.versions.map((v) => v.tag),
        ]
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => {
        const order: Record<LocalLlmTier, number> = {
          recommended: 0,
          optional: 1,
          tight: 2,
          avoid: 3,
        }
        const pop = Number(Boolean(b.family.popular)) - Number(Boolean(a.family.popular))
        if (pop) return pop
        return (
          order[a.bestTier] - order[b.bestTier] ||
          a.family.ollamaModel.localeCompare(b.family.ollamaModel)
        )
      })
  }, [snap, lane, activeModality, vendor, suit, query, t])

  const installedByType = useMemo(() => {
    if (!snap) {
      return [] as Array<{ modality: LocalLlmModality | 'other'; items: LocalLlmInstalledModel[] }>
    }
    const groups: Record<string, LocalLlmInstalledModel[]> = {
      text: [],
      reasoning: [],
      code: [],
      vision: [],
      image: [],
      speech: [],
      video: [],
      mesh3d: [],
      embedding: [],
      other: [],
    }
    for (const m of snap.installed) {
      const family = m.familyId
        ? snap.families.find((f) => f.family.id === m.familyId)?.family
        : localLlmFamilyByOllamaName(m.name)
      const key = family?.modality ?? 'other'
      groups[key]!.push(m)
    }
    return ([...CHAT_MODALITIES, ...MEDIA_MODALITIES, 'other'] as const)
      .filter((k) => groups[k]!.length > 0)
      .map((k) => ({ modality: k as LocalLlmModality | 'other', items: groups[k]! }))
  }, [snap])

  const withBusy = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setHint(null)
    try {
      await fn()
    } catch (err) {
      setHintOk(false)
      setHint(err instanceof Error ? err.message : t('tools.errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  const ollamaBadge = !snap
    ? { className: pageStyles.dataBadgeMuted, text: t('settings.localLlm.checking') }
    : snap.ollama.running
      ? {
          className: pageStyles.dataBadgeOk,
          text: t('settings.localLlm.ollamaReady', {
            version: snap.ollama.version || 'Ollama',
          }),
        }
      : snap.ollama.installed
        ? { className: pageStyles.dataBadgeMuted, text: t('settings.localLlm.ollamaInstalledStopped') }
        : { className: pageStyles.dataBadgeBad, text: t('settings.localLlm.ollamaMissing') }

  const pullFamilyVersion = (family: LocalLlmFamily, tag: string, force = false) => {
    const name = localLlmPullName(family, tag)
    const version = family.versions.find((v) => v.tag === tag)
    const tier = version
      ? localLlmTierForVersion(version, snap?.host.ramGb ?? 16)
      : ('optional' as LocalLlmTier)
    if (tier === 'avoid' && !force) {
      setConfirmAvoid(name)
      return
    }
    setConfirmAvoid(null)
    void withBusy(async () => {
      setPulling(name)
      setProgress({ model: name, status: 'starting', percent: 0, phase: 'start' })
      const res = await window.treasureChest.pullLocalLlmModel(name)
      if (!res.ok && res.error !== 'aborted') {
        setPulling(null)
        setHintOk(false)
        setHint(errorText(t, res.error))
      }
    })
  }

  const loadRemoteTags = (family: LocalLlmFamily) => {
    void withBusy(async () => {
      setRemoteBusy(family.id)
      try {
        const res = await window.treasureChest.listLocalLlmRemoteTags(family.ollamaModel)
        if (!res.ok) {
          setHintOk(false)
          setHint(errorText(t, res.error))
          return
        }
        setRemoteTags((prev) => ({ ...prev, [family.id]: res.tags }))
        setHintOk(true)
        setHint(t('settings.localLlm.remoteTagsLoaded', { count: res.tags.length }))
      } finally {
        setRemoteBusy(null)
      }
    })
  }

  const doDelete = (name: string) => {
    void withBusy(async () => {
      const res = await window.treasureChest.deleteLocalLlmModel(name)
      setConfirmDelete(null)
      if (!res.ok) {
        setHintOk(false)
        setHint(errorText(t, res.error))
        return
      }
      setHintOk(true)
      setHint(t('settings.localLlm.deleted', { model: name }))
      await refresh()
    })
  }

  const applyModel = (name?: string) => {
    void withBusy(async () => {
      const res = await window.treasureChest.applyLocalLlmToWorkbench(name)
      if (!res.ok) {
        setHintOk(false)
        setHint(errorText(t, res.error))
        return
      }
      setHintOk(true)
      setHint(t('settings.localLlm.applied', { model: res.model }))
      onApplied?.()
      onOpenModelsApi?.()
    })
  }

  const renderFamilyCard = (row: LocalLlmFamilyState) => {
    const family = row.family
    const isOllama = localLlmIsOllamaFamily(family)
    const runtime = localLlmInstallRuntime(family)
    const tag = selectedTag[family.id] ?? defaultTag(family, row.installedTags)
    const version = family.versions.find((v) => v.tag === tag)
    const pullName = localLlmPullName(family, tag)
    const tier = version
      ? localLlmTierForVersion(version, snap?.host.ramGb ?? 16)
      : ('optional' as LocalLlmTier)
    const isInstalled = isOllama
      ? row.installedNames.some((n) => {
          const lower = n.toLowerCase()
          const target = pullName.toLowerCase()
          if (lower === target) return true
          if (tag === 'latest' && lower === family.ollamaModel.toLowerCase()) return true
          if (tag === 'latest' && lower === `${family.ollamaModel.toLowerCase()}:latest`) return true
          return false
        })
      : false
    const isPulling = isOllama && pulling === pullName
    const showProgress = isPulling && progress?.model === pullName
    const remotes = remoteTags[family.id] ?? []
    const remoteOnly = remotes.filter(
      (r) => !family.versions.some((v) => v.tag.toLowerCase() === r.tag.toLowerCase()),
    )
    const tagOptions = [
      ...family.versions.map((v) => ({
        tag: v.tag,
        label: `${v.label}${v.quant ? ` · ${v.quant}` : ''} · ~${v.sizeGb}GB`,
        curated: true,
      })),
      ...(isOllama
        ? remoteOnly.map((r) => ({ tag: r.tag, label: r.tag, curated: false }))
        : []),
    ]
    const platformMismatch =
      family.platforms &&
      snap &&
      !family.platforms.includes(snap.host.platform) &&
      snap.host.platform !== 'other'
    const moreOpen = expandedCard === family.id

    return (
      <div key={family.id} className={styles.card}>
        <div className={styles.cardMain}>
          <div className={styles.cardTitleRow}>
            <div className={styles.name}>{t(family.nameKey)}</div>
            <span className={`${styles.tierDot} ${tierClass(tier)}`}>
              {t(`settings.localLlm.tier.${tier}`)}
            </span>
            {isInstalled ? (
              <span className={`${styles.tierDot} ${styles.capOk}`}>
                {t('settings.localLlm.installed')}
              </span>
            ) : null}
            {platformMismatch ? (
              <span className={`${styles.tierDot} ${styles.capBad}`}>
                {t('settings.localLlm.platformLimited')}
              </span>
            ) : null}
          </div>
          <p className={styles.desc}>{t(family.descKey)}</p>
          {!isOllama ? (
            <p className={styles.desc}>
              {t(`settings.localLlm.runtime.${runtime}`)} ·{' '}
              {t(`settings.localLlm.runtimeHint.${runtime}`)}
            </p>
          ) : null}

          {isOllama ? (
            <div className={styles.versionRow}>
              <select
                className={styles.select}
                value={tag}
                aria-label={t('settings.localLlm.version')}
                onChange={(e) => setSelectedTag((prev) => ({ ...prev, [family.id]: e.target.value }))}
              >
                {tagOptions.map((opt) => {
                  const v = family.versions.find((x) => x.tag === opt.tag)
                  const vt = v
                    ? localLlmTierForVersion(v, snap?.host.ramGb ?? 16)
                    : ('optional' as LocalLlmTier)
                  const installed = row.installedTags.includes(opt.tag)
                  return (
                    <option key={opt.tag} value={opt.tag}>
                      {opt.label}
                      {opt.curated
                        ? ` · ${t(`settings.localLlm.tier.${vt}`)}`
                        : ` · ${t('settings.localLlm.remoteTag')}`}
                      {installed ? ` · ${t('settings.localLlm.installed')}` : ''}
                    </option>
                  )
                })}
              </select>
              <span className={styles.installedMeta}>
                {pullName}
                {version ? ` · ≥${version.minRamGb}GB` : ''}
              </span>
            </div>
          ) : null}

          {showProgress ? (
            <div className={styles.progress}>
              <div className={styles.track}>
                <div
                  className={styles.bar}
                  style={{ width: `${Math.max(4, progress?.percent ?? 0)}%` }}
                />
              </div>
              <div className={styles.progressLabel}>
                {progress?.status} · {progress?.percent ?? 0}%
                {progress?.total
                  ? ` · ${formatBytes(progress.completed ?? 0)} / ${formatBytes(progress.total)}`
                  : ''}
              </div>
            </div>
          ) : null}

          {confirmDelete === pullName ? (
            <div className={styles.confirmBar}>
              <span>{t('settings.localLlm.confirmDelete', { model: pullName })}</span>
              <button type="button" className={styles.btnDanger} onClick={() => doDelete(pullName)}>
                {t('settings.localLlm.confirmYes')}
              </button>
              <button type="button" className={styles.btnGhost} onClick={() => setConfirmDelete(null)}>
                {t('settings.localLlm.confirmNo')}
              </button>
            </div>
          ) : null}
          {confirmAvoid === pullName ? (
            <div className={styles.confirmBar}>
              <span>{t('settings.localLlm.confirmAvoid', { model: pullName })}</span>
              <button
                type="button"
                className={styles.btn}
                onClick={() => pullFamilyVersion(family, tag, true)}
              >
                {t('settings.localLlm.confirmAvoidYes')}
              </button>
              <button type="button" className={styles.btnGhost} onClick={() => setConfirmAvoid(null)}>
                {t('settings.localLlm.confirmNo')}
              </button>
            </div>
          ) : null}

          {moreOpen ? (
            <div className={styles.moreRow}>
              <span className={styles.installedMeta}>
                {t(`settings.localLlm.vendor.${family.vendor}`)}
                {(family.caps ?? []).length
                  ? ` · ${(family.caps ?? []).map((c) => t(`settings.localLlm.cap.${c}`)).join(' · ')}`
                  : ''}
              </span>
              {isOllama ? (
                <button
                  type="button"
                  className={styles.btnGhost}
                  disabled={busy || remoteBusy === family.id}
                  onClick={() => loadRemoteTags(family)}
                >
                  {remoteBusy === family.id
                    ? t('settings.localLlm.loadingTags')
                    : t('settings.localLlm.loadAllTags')}
                </button>
              ) : null}
              <button
                type="button"
                className={styles.btnGhost}
                disabled={busy}
                onClick={() =>
                  void withBusy(async () => {
                    if (isOllama) {
                      await window.treasureChest.openLocalLlmLibrary(family.ollamaModel)
                    } else {
                      await window.treasureChest.openLocalLlmFamilyInstall(family.id)
                    }
                  })
                }
              >
                {t('settings.localLlm.docs')}
              </button>
              {isOllama && isInstalled ? (
                <>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    disabled={busy || Boolean(pulling) || !snap?.ollama.running}
                    onClick={() => pullFamilyVersion(family, tag)}
                  >
                    {t('settings.localLlm.reinstall')}
                  </button>
                  <button
                    type="button"
                    className={styles.btnDanger}
                    disabled={busy || Boolean(pulling) || !snap?.ollama.running}
                    onClick={() => setConfirmDelete(pullName)}
                  >
                    {t('settings.localLlm.uninstall')}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={styles.actions}>
          {isOllama ? (
            isPulling ? (
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => void window.treasureChest.cancelLocalLlmPull()}
              >
                {t('settings.localLlm.cancelPull')}
              </button>
            ) : isInstalled ? (
              <button
                type="button"
                className={styles.btn}
                disabled={busy || !snap?.ollama.running}
                onClick={() => applyModel(pullName)}
              >
                {t('settings.localLlm.useModel')}
              </button>
            ) : (
              <button
                type="button"
                className={styles.btn}
                disabled={busy || Boolean(pulling) || !snap?.ollama.running}
                onClick={() => pullFamilyVersion(family, tag)}
              >
                {t('settings.localLlm.install')}
              </button>
            )
          ) : (
            <button
              type="button"
              className={styles.btn}
              disabled={busy}
              onClick={() =>
                void withBusy(async () => {
                  const res = await window.treasureChest.openLocalLlmFamilyInstall(family.id)
                  if (!res.ok) {
                    setHintOk(false)
                    setHint(errorText(t, res.error))
                    return
                  }
                  setHintOk(true)
                  setHint(t('settings.localLlm.guideOpened'))
                })
              }
            >
              {t('settings.localLlm.openInstallGuide')}
            </button>
          )}
          <button
            type="button"
            className={styles.linkQuiet}
            onClick={() => setExpandedCard(moreOpen ? null : family.id)}
          >
            {moreOpen ? t('settings.localLlm.less') : t('settings.localLlm.more')}
          </button>
        </div>
      </div>
    )
  }

  const switchLane = (next: Lane) => {
    setLane(next)
    setVendor('all')
    setQuery('')
    setExpandedCard(null)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>{t('settings.localLlmTitle')}</h2>
          <p className={styles.hint}>{t('settings.localLlm.hintShort')}</p>
        </div>
      </div>

      {/* Compact runtime strip */}
      <div className={styles.runtime}>
        <div className={styles.runtimeMain}>
          <span className={ollamaBadge.className}>{ollamaBadge.text}</span>
          {snap ? (
            <span className={styles.runtimeMeta}>
              {t('settings.localLlm.hostDetail', {
                platform: platformLabel(snap.host.platform, t),
                chip: snap.host.chipLabel,
                ram: snap.host.ramGb,
                disk:
                  snap.host.freeDiskGb == null
                    ? '—'
                    : t('settings.localLlm.diskFree', { n: snap.host.freeDiskGb }),
                accel: t(`settings.localLlm.accel.${snap.host.accelerator}`),
              })}
            </span>
          ) : null}
        </div>
        <div className={styles.runtimeActions}>
          {!snap?.ollama.installed ? (
            <SettingActionButton
              icon={<IconDownload />}
              label={t('settings.localLlm.installOllama')}
              variant="primary"
              disabled={busy}
              onClick={() =>
                void withBusy(async () => {
                  await window.treasureChest.openLocalLlmRuntimeInstall('ollama')
                  setHintOk(true)
                  setHint(t('settings.localLlm.installOpened'))
                })
              }
            />
          ) : !snap.ollama.running ? (
            <SettingActionButton
              icon={<IconUpload />}
              label={t('settings.localLlm.startOllama')}
              variant="primary"
              disabled={busy}
              onClick={() =>
                void withBusy(async () => {
                  const res = await window.treasureChest.startLocalLlmRuntime()
                  if (!res.ok) {
                    setHintOk(false)
                    setHint(errorText(t, res.error))
                    return
                  }
                  setHintOk(true)
                  setHint(t('settings.localLlm.started'))
                  await refresh()
                })
              }
            />
          ) : null}
          <SettingActionButton
            icon={<IconDownload />}
            label={t('settings.localLlm.refresh')}
            variant="ghost"
            disabled={busy}
            onClick={() => void withBusy(() => refresh())}
          />
          {onOpenModelsApi ? (
            <SettingActionButton
              icon={<IconKey />}
              label={t('settings.localLlm.openModelsApi')}
              variant="ghost"
              onClick={onOpenModelsApi}
            />
          ) : null}
        </div>
        {!snap?.ollama.running ? (
          <p className={styles.runtimeHint}>{t('settings.localLlm.startHint')}</p>
        ) : (
          <p className={styles.runtimeHint}>{t('settings.localLlm.chatPathHint')}</p>
        )}
      </div>

      {/* 3 primary lanes */}
      <nav className={styles.laneNav} aria-label={t('settings.localLlm.typeNav')}>
        {(
          [
            ['chat', 'settings.localLlm.lane.chat', snap?.installed.length],
            ['media', 'settings.localLlm.lane.media', null],
            ['manage', 'settings.localLlm.lane.manage', snap?.installed.length ?? 0],
          ] as const
        ).map(([id, labelKey, count]) => (
          <button
            key={id}
            type="button"
            className={`${styles.laneTab} ${lane === id ? styles.laneTabActive : ''}`}
            onClick={() => switchLane(id)}
          >
            <span>{t(labelKey)}</span>
            {id === 'manage' && count != null ? (
              <span className={styles.typeTabCount}>{count}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {lane === 'chat' || lane === 'media' ? (
        <>
          <div className={styles.subNav}>
            {(lane === 'chat' ? CHAT_MODALITIES : MEDIA_MODALITIES).map((m) => (
              <button
                key={m}
                type="button"
                className={`${styles.subTab} ${activeModality === m ? styles.subTabActive : ''}`}
                onClick={() => {
                  if (lane === 'chat') setChatModality(m)
                  else setMediaModality(m)
                  setVendor('all')
                  setExpandedCard(null)
                }}
              >
                {t(`settings.localLlm.modality.${m}`)}
                {modalityCounts[m] != null ? (
                  <span className={styles.typeTabCount}>{modalityCounts[m]}</span>
                ) : null}
              </button>
            ))}
          </div>

          <p className={styles.laneDesc}>
            {lane === 'media'
              ? t('settings.localLlm.mediaLaneHint')
              : t(`settings.localLlm.typeDesc.${activeModality}`)}
          </p>

          <div className={styles.searchRow}>
            <input
              className={styles.search}
              value={query}
              placeholder={t('settings.localLlm.searchInType')}
              onChange={(e) => setQuery(e.target.value)}
            />
            {lane === 'chat' ? (
              <>
                <select
                  className={styles.select}
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value as 'all' | LocalLlmVendor)}
                >
                  <option value="all">{t('settings.localLlm.filterAllVendors')}</option>
                  {vendorsInType.map((v) => (
                    <option key={v} value={v}>
                      {t(`settings.localLlm.vendor.${v}`)}
                    </option>
                  ))}
                </select>
                <div className={styles.chips}>
                  {(
                    [
                      ['recommended', 'settings.localLlm.filterRecommended'],
                      ['all', 'settings.localLlm.filterAll'],
                      ['installed', 'settings.localLlm.filterInstalled'],
                    ] as const
                  ).map(([id, key]) => (
                    <button
                      key={id}
                      type="button"
                      className={`${styles.chip} ${suit === id ? styles.chipActive : ''}`}
                      onClick={() => setSuit(id)}
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <div className={styles.list}>
            {families.length === 0 ? (
              <div className={styles.empty}>{t('settings.localLlm.emptyCatalog')}</div>
            ) : (
              families.map(renderFamilyCard)
            )}
          </div>
        </>
      ) : null}

      {lane === 'manage' ? (
        <div className={styles.manageWrap}>
          <div className={styles.manageHead}>
            <div>
              <h3 className={styles.sectionTitle}>
                {t('settings.localLlm.installedTitle', { count: snap?.installed.length ?? 0 })}
              </h3>
              <p className={styles.desc}>{t('settings.localLlm.manageHint')}</p>
            </div>
            <SettingActionButton
              icon={<IconUpload />}
              label={t('settings.localLlm.applyWorkbench')}
              variant="primary"
              disabled={busy || !snap?.ollama.running || (snap?.installed.length ?? 0) === 0}
              onClick={() => applyModel()}
            />
          </div>

          {(snap?.installed.length ?? 0) === 0 ? (
            <div className={styles.empty}>{t('settings.localLlm.emptyInstalled')}</div>
          ) : (
            <div className={styles.installedWrap}>
              {installedByType.map((group) => (
                <section key={group.modality} className={styles.installedGroup}>
                  <h4 className={styles.groupLabel}>
                    {group.modality === 'other'
                      ? t('settings.localLlm.tab.other')
                      : t(`settings.localLlm.modality.${group.modality}`)}
                    <span className={styles.typeTabCount}>{group.items.length}</span>
                  </h4>
                  <div className={styles.installedTable}>
                    {group.items.map((m) => {
                      const running = snap!.running.some((r) => r.name === m.name)
                      return (
                        <div key={m.name} className={styles.installedRow}>
                          <div>
                            <div className={styles.installedName}>{m.name}</div>
                            <div className={styles.installedMeta}>
                              {formatBytes(m.sizeBytes)}
                              {m.details?.parameterSize ? ` · ${m.details.parameterSize}` : ''}
                              {m.details?.quantizationLevel
                                ? ` · ${m.details.quantizationLevel}`
                                : ''}
                              {running ? ` · ${t('settings.localLlm.running')}` : ''}
                            </div>
                            {detailName === m.name && detailText ? (
                              <pre
                                className={styles.desc}
                                style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}
                              >
                                {detailText}
                              </pre>
                            ) : null}
                            {confirmDelete === m.name ? (
                              <div className={styles.confirmBar}>
                                <span>
                                  {t('settings.localLlm.confirmDelete', { model: m.name })}
                                </span>
                                <button
                                  type="button"
                                  className={styles.btnDanger}
                                  onClick={() => doDelete(m.name)}
                                >
                                  {t('settings.localLlm.confirmYes')}
                                </button>
                                <button
                                  type="button"
                                  className={styles.btnGhost}
                                  onClick={() => setConfirmDelete(null)}
                                >
                                  {t('settings.localLlm.confirmNo')}
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <div className={styles.installedActions}>
                            <button
                              type="button"
                              className={styles.btn}
                              disabled={busy || !snap?.ollama.running}
                              onClick={() => applyModel(m.name)}
                            >
                              {t('settings.localLlm.useModel')}
                            </button>
                            <button
                              type="button"
                              className={styles.btnGhost}
                              disabled={busy || !snap?.ollama.running}
                              onClick={() =>
                                void withBusy(async () => {
                                  const d = await window.treasureChest.showLocalLlmModel(m.name)
                                  setDetailName(m.name)
                                  setDetailText(
                                    d
                                      ? [
                                          d.details?.family,
                                          d.details?.parameterSize,
                                          d.details?.quantizationLevel,
                                          d.details?.format,
                                        ]
                                          .filter(Boolean)
                                          .join('\n')
                                      : t('settings.localLlm.noDetails'),
                                  )
                                })
                              }
                            >
                              {t('settings.localLlm.details')}
                            </button>
                            {running ? (
                              <button
                                type="button"
                                className={styles.btnGhost}
                                disabled={busy}
                                onClick={() =>
                                  void withBusy(async () => {
                                    const res = await window.treasureChest.unloadLocalLlmModel(
                                      m.name,
                                    )
                                    if (!res.ok) {
                                      setHintOk(false)
                                      setHint(errorText(t, res.error))
                                      return
                                    }
                                    setHintOk(true)
                                    setHint(t('settings.localLlm.unloaded', { model: m.name }))
                                    await refresh()
                                  })
                                }
                              >
                                {t('settings.localLlm.unload')}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={styles.btnDanger}
                              disabled={busy || Boolean(pulling)}
                              onClick={() => setConfirmDelete(m.name)}
                            >
                              {t('settings.localLlm.uninstall')}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          <div className={styles.customBox}>
            <div className={styles.hostMeta}>{t('settings.localLlm.customTitle')}</div>
            <p className={styles.desc}>{t('settings.localLlm.customHint')}</p>
            <div className={styles.customRow}>
              <input
                className={styles.search}
                value={customName}
                placeholder={t('settings.localLlm.customPlaceholder')}
                onChange={(e) => setCustomName(e.target.value)}
                disabled={busy || Boolean(pulling)}
              />
              <button
                type="button"
                className={styles.btn}
                disabled={busy || Boolean(pulling) || !snap?.ollama.running || !customName.trim()}
                onClick={() => {
                  const name = customName.trim()
                  void withBusy(async () => {
                    setPulling(name)
                    setProgress({ model: name, status: 'starting', percent: 0, phase: 'start' })
                    const res = await window.treasureChest.pullLocalLlmModel(name)
                    if (!res.ok && res.error !== 'aborted') {
                      setPulling(null)
                      setHintOk(false)
                      setHint(errorText(t, res.error))
                    }
                  })
                }}
              >
                {t('settings.localLlm.install')}
              </button>
            </div>
            <div className={styles.customLinks}>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() =>
                  void withBusy(() =>
                    window.treasureChest.openLocalLlmLibrary().then(() => undefined),
                  )
                }
              >
                {t('settings.localLlm.openLibrary')}
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() =>
                  void withBusy(() =>
                    window.treasureChest
                      .openLocalLlmRuntimeInstall('lmstudio')
                      .then(() => undefined),
                  )
                }
              >
                {t('settings.localLlm.openLmStudio')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {hint ? <p className={hintOk ? styles.msgOk : styles.msg}>{hint}</p> : null}
    </div>
  )
}
