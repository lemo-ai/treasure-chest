import changelogJson from '@config/changelog.json'

export type ChangelogLocale = 'zh-CN' | 'en-US'

export interface ChangelogRelease {
  version: string
  date: string
  title: Record<ChangelogLocale, string>
  items: Record<ChangelogLocale, string[]>
}

/**
 * 版本变更数据源：发版时编辑 `config/changelog.json`（在 releases 数组顶部追加），
 * 并同步 bump `package.json` / `package-lock.json` 的 version。
 */
export const CHANGELOG: ChangelogRelease[] = changelogJson.releases as ChangelogRelease[]
