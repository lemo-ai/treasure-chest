import { useEffect, useState, type ReactNode } from 'react'
import { Outlet, NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  IconCalendar,
  IconFortune,
  IconHome,
  IconSettings,
  IconStocks,
} from '@renderer/shared/ui/icons'
import appLogo from '@renderer/assets/app-logo.png'
import { ChangelogModal } from './ChangelogModal'
import styles from './AppLayout.module.css'

const navItems: { to: string; end?: boolean; labelKey: string; icon: ReactNode }[] = [
  { to: '/', end: true, labelKey: 'nav.home', icon: <IconHome /> },
  { to: '/calendar', labelKey: 'nav.calendar', icon: <IconCalendar /> },
  { to: '/fortune', labelKey: 'nav.fortune', icon: <IconFortune /> },
  { to: '/stocks', labelKey: 'nav.stocks', icon: <IconStocks /> },
]

export function AppLayout(): React.JSX.Element {
  const { t } = useTranslation()
  const [version, setVersion] = useState('')
  const [changelogOpen, setChangelogOpen] = useState(false)

  useEffect(() => {
    void window.treasureChest.getVersion().then(setVersion)
  }, [])

  return (
    <div className={styles.shell}>
      <aside className={styles.nav}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <img src={appLogo} alt="" width={38} height={38} draggable={false} />
          </span>
          <div className={styles.brandText}>
            <span className={styles.brandName}>{t('appName')}</span>
            <span className={styles.brandTag}>{t('nav.brandTag')}</span>
          </div>
        </div>

        <nav className={styles.links}>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
              <span className={styles.linkIcon}>{item.icon}</span>
              <span className={styles.linkLabel}>{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.navFooter}>
          <NavLink to="/settings" className={navClass}>
            <span className={styles.linkIcon}>
              <IconSettings />
            </span>
            <span className={styles.linkLabel}>{t('nav.settings')}</span>
          </NavLink>

          {version ? (
            <button
              type="button"
              className={styles.versionBtn}
              onClick={() => setChangelogOpen(true)}
              title={t('changelog.openHint')}
            >
              <span className={styles.versionLabel}>{t('nav.version')}</span>
              <span className={styles.versionValue}>v{version}</span>
            </button>
          ) : null}
        </div>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>

      {changelogOpen ? (
        <ChangelogModal version={version} onClose={() => setChangelogOpen(false)} />
      ) : null}
    </div>
  )
}

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? `${styles.link} ${styles.linkActive}` : styles.link
}
