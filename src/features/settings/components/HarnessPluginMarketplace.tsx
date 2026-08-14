import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { HarnessPluginCatalogEntry, HarnessPluginInfo } from '@shared'
import styles from './HarnessPluginMarketplace.module.css'

interface HarnessPluginMarketplaceProps {
  onHint?: (message: string | null) => void
}

export function HarnessPluginMarketplace({ onHint }: HarnessPluginMarketplaceProps): ReactNode {
  const { t } = useTranslation()
  const [catalog, setCatalog] = useState<HarnessPluginCatalogEntry[]>([])
  const [installed, setInstalled] = useState<HarnessPluginInfo[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = (): void => {
    void Promise.all([
      window.treasureChest.harnessListPluginCatalog(),
      window.treasureChest.harnessListPlugins(),
    ]).then(([cat, plugins]) => {
      setCatalog(cat)
      setInstalled(plugins)
    })
  }

  useEffect(() => {
    refresh()
  }, [])

  const installBundled = (id: string): void => {
    setBusy(id)
    onHint?.(null)
    void window.treasureChest
      .harnessInstallPlugin({ bundledId: id })
      .then(() => {
        refresh()
        onHint?.(t('settings.harnessPluginInstalled', { name: id }))
      })
      .catch((err: unknown) => {
        onHint?.(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setBusy(null))
  }

  const pickInstall = (): void => {
    setBusy('pick')
    onHint?.(null)
    void window.treasureChest
      .harnessPickInstallPlugin()
      .then((plugin) => {
        if (plugin) {
          refresh()
          onHint?.(t('settings.harnessPluginInstalled', { name: plugin.name }))
        }
      })
      .catch((err: unknown) => {
        onHint?.(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setBusy(null))
  }

  const reload = (): void => {
    setBusy('reload')
    onHint?.(null)
    void window.treasureChest
      .harnessReloadPlugins()
      .then((result) => {
        refresh()
        const names = result.plugins.map((p) => p.name).join(', ')
        onHint?.(
          result.plugins.length
            ? t('settings.harnessPluginsReloaded', { names })
            : t('settings.harnessPluginsEmpty'),
        )
      })
      .finally(() => setBusy(null))
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.actions}>
        <button type="button" className={styles.btn} disabled={busy != null} onClick={pickInstall}>
          {t('settings.harnessPluginInstallFolder')}
        </button>
        <button type="button" className={styles.btn} disabled={busy != null} onClick={reload}>
          {t('settings.harnessReloadPlugins')}
        </button>
        <button
          type="button"
          className={styles.btnGhost}
          onClick={() => void window.treasureChest.harnessOpenPluginsDir()}
        >
          {t('settings.harnessOpenPluginsDir')}
        </button>
      </div>

      {catalog.length > 0 ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('settings.harnessPluginCatalog')}</h3>
          <ul className={styles.catalog}>
            {catalog.map((entry) => (
              <li key={entry.id} className={styles.card}>
                <div className={styles.cardHead}>
                  <strong>{entry.name}</strong>
                  <span className={styles.version}>v{entry.version}</span>
                </div>
                <p className={styles.desc}>{entry.description}</p>
                <div className={styles.cardActions}>
                  {entry.installed ? (
                    <span className={styles.installed}>{t('settings.harnessPluginInstalledBadge')}</span>
                  ) : (
                    <button
                      type="button"
                      className={styles.installBtn}
                      disabled={busy != null}
                      onClick={() => installBundled(entry.bundledPath || entry.id)}
                    >
                      {t('settings.harnessPluginInstall')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('settings.harnessPluginInstalledTitle')}</h3>
        {installed.length === 0 ? (
          <p className={styles.empty}>{t('settings.harnessPluginsEmpty')}</p>
        ) : (
          <ul className={styles.installedList}>
            {installed.map((plugin) => (
              <li key={plugin.id} className={styles.installedItem}>
                <div>
                  <strong>{plugin.name}</strong>
                  <span className={styles.meta}>
                    v{plugin.version} · {plugin.toolNames.length} tools
                  </span>
                </div>
                <code className={styles.path}>{plugin.path}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
