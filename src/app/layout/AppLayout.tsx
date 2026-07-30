import type { ReactNode } from 'react'
import { Outlet, NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  IconCalendar,
  IconChest,
  IconFortune,
  IconHome,
  IconSettings,
  IconStocks,
} from '@renderer/shared/ui/icons'
import styles from './AppLayout.module.css'

const navItems: { to: string; end?: boolean; labelKey: string; icon: ReactNode }[] = [
  { to: '/', end: true, labelKey: 'nav.home', icon: <IconHome /> },
  { to: '/calendar', labelKey: 'nav.calendar', icon: <IconCalendar /> },
  { to: '/fortune', labelKey: 'nav.fortune', icon: <IconFortune /> },
  { to: '/stocks', labelKey: 'nav.stocks', icon: <IconStocks /> },
]

export function AppLayout(): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div className={styles.shell}>
      <aside className={styles.nav}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <IconChest />
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
        </div>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? `${styles.link} ${styles.linkActive}` : styles.link
}
