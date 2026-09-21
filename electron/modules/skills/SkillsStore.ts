import { app } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '../../utils/logger'

export interface InstalledSkill {
  id: string
  name: string
  description: string
  source: 'builtin' | 'github' | 'file'
  sourceRef?: string
  prompt: string
  installedAt: string
  updatedAt: string
}

const BUILTIN: InstalledSkill[] = [
  {
    id: 'meeting_notes',
    name: 'meeting-notes',
    description: '整理会议纪要：议题、决议、待办、风险',
    source: 'builtin',
    prompt:
      '将用户提供的会议材料整理为：议题、决议、待办（负责人/截止）、风险。用条目列表。',
    installedAt: 'builtin',
    updatedAt: 'builtin',
  },
  {
    id: 'email_polish',
    name: 'email-polish',
    description: '润色专业邮件：主题 + 正文',
    source: 'builtin',
    prompt: '把用户草稿润色成专业邮件：主题建议 + 正文。语气礼貌简洁。',
    installedAt: 'builtin',
    updatedAt: 'builtin',
  },
  {
    id: 'swot',
    name: 'swot',
    description: 'SWOT 分析',
    source: 'builtin',
    prompt: '对用户主题做 SWOT 分析（优势/劣势/机会/威胁），每项 3–5 条，最后给一句行动建议。',
    installedAt: 'builtin',
    updatedAt: 'builtin',
  },
  {
    id: 'code_explain',
    name: 'code-explain',
    description: '解释代码逻辑与风险',
    source: 'builtin',
    prompt: '解释用户给出的代码：作用、关键逻辑、风险与改进建议。不要无关扩写。',
    installedAt: 'builtin',
    updatedAt: 'builtin',
  },
  {
    id: 'data_pipeline',
    name: 'data-pipeline',
    description: '用数据源落库/查询：crawl → SQL → 分析',
    source: 'builtin',
    prompt: [
      '你是数据工作流助手。优先用工具，不要空口编造库内容。',
      '1) list_data_sources 查看本智能体已绑定数据源；',
      '2) 需要网页原文时用 crawl_url / fetch_url；',
      '3) 持久化或分析时用 query_data_source：SQL 类传 sql（可 CREATE/INSERT/SELECT，覆盖配置默认语句）；',
      '4) 先确保表结构，再批量写入，再 SELECT 做汇总；',
      '5) 说明用了哪个数据源 id 与关键 SQL。仅供研究，不构成投资/购彩建议。',
    ].join('\n'),
    installedAt: 'builtin',
    updatedAt: 'builtin',
  },
  {
    id: 'sports_lottery_ds',
    name: 'sports-lottery-datasource',
    description: '体彩：澳客爬取 + 预置 SQLite（builtin:lottery-sqlite）落库分析',
    source: 'builtin',
    prompt: [
      '目标：用 crawl_url + 预置数据源 builtin:lottery-sqlite（体彩本地库）做竞彩/北单研究。',
      '该库对本助手可读写：query_data_source 传 sql 即可 SELECT 或 INSERT/INSERT OR REPLACE，不要编造「只读/无法修改权限」。',
      '表 matches 列名（禁止旧名 match_date/home_team）：date, product, home, away, score, odds_json, source_url, synced_at。',
      '流程：',
      '1) list_data_sources 看 allowed/access/schemaHint；',
      '2) crawl_url 抓页后马上 query_data_source INSERT；',
      '3) SELECT 核对，例：SELECT product, COUNT(*) n FROM matches GROUP BY product；',
      '4) 澳客：crawl_url https://www.okooo.com/livecenter/?date=YYYY-MM-DD。',
      '声明：仅供研究，不构成购彩建议。',
    ].join('\n'),
    installedAt: 'builtin',
    updatedAt: 'builtin',
  },
]

/** Curated open catalogs (Agent Skills / SKILL.md). */
export const SKILL_CATALOGS = [
  {
    id: 'anthropics',
    name: 'Anthropic Skills',
    url: 'https://github.com/anthropics/skills',
    hint: '官方示例与文档技能（Agent Skills 标准）',
  },
  {
    id: 'crystian',
    name: 'crystian/skills',
    url: 'https://github.com/crystian/skills',
    hint: '开源可复用 SKILL.md 集合；npx skills add crystian/skills',
  },
  {
    id: 'skills-sh',
    name: 'skills.sh registry',
    url: 'https://skills.sh',
    hint: '跨 Cursor / Claude / Codex 的技能注册表',
  },
] as const

function skillsRoot(): string {
  const dir = join(app.getPath('userData'), 'skills')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function skillDir(id: string): string {
  return join(skillsRoot(), id)
}

function parseFrontmatter(md: string): { meta: Record<string, string>; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!m) return { meta: {}, body: md.trim() }
  const meta: Record<string, string> = {}
  for (const line of m[1]!.split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    meta[key] = val
  }
  return { meta, body: m[2]!.trim() }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `skill_${createHash('sha1').update(name).digest('hex').slice(0, 8)}`
}

function readInstalledFromDisk(): InstalledSkill[] {
  const root = skillsRoot()
  const out: InstalledSkill[] = []
  for (const name of readdirSync(root, { withFileTypes: true })) {
    if (!name.isDirectory()) continue
    const skillMd = join(root, name.name, 'SKILL.md')
    const metaPath = join(root, name.name, 'install.json')
    if (!existsSync(skillMd)) continue
    try {
      const { meta, body } = parseFrontmatter(readFileSync(skillMd, 'utf8'))
      const install = existsSync(metaPath)
        ? (JSON.parse(readFileSync(metaPath, 'utf8')) as Partial<InstalledSkill>)
        : {}
      const id = install.id || name.name
      out.push({
        id,
        name: meta.name || install.name || name.name,
        description: meta.description || install.description || '',
        source: (install.source as InstalledSkill['source']) || 'file',
        sourceRef: install.sourceRef,
        prompt: body,
        installedAt: install.installedAt || new Date().toISOString(),
        updatedAt: install.updatedAt || new Date().toISOString(),
      })
    } catch (err) {
      logger.warn(`skip broken skill ${name.name}`, err)
    }
  }
  return out
}

export function listSkills(): InstalledSkill[] {
  const disk = readInstalledFromDisk()
  const ids = new Set(disk.map((s) => s.id))
  return [...BUILTIN.filter((b) => !ids.has(b.id)), ...disk]
}

export function getSkill(id: string): InstalledSkill | null {
  return listSkills().find((s) => s.id === id) ?? null
}

function writeSkill(skill: InstalledSkill, markdown: string): void {
  const dir = skillDir(skill.id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), markdown, 'utf8')
  writeFileSync(
    join(dir, 'install.json'),
    JSON.stringify(
      {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        source: skill.source,
        sourceRef: skill.sourceRef,
        installedAt: skill.installedAt,
        updatedAt: skill.updatedAt,
      },
      null,
      2,
    ),
    'utf8',
  )
}

/** Install from raw SKILL.md text (Agent Skills format). */
export function installSkillFromMarkdown(
  markdown: string,
  opts?: { source?: InstalledSkill['source']; sourceRef?: string; id?: string },
): InstalledSkill {
  const { meta, body } = parseFrontmatter(markdown)
  if (!body) throw new Error('SKILL.md body is empty')
  const name = meta.name || opts?.id || 'untitled-skill'
  const id = opts?.id || slugify(name)
  if (BUILTIN.some((b) => b.id === id)) {
    throw new Error(`cannot overwrite builtin skill: ${id}`)
  }
  const now = new Date().toISOString()
  const existing = existsSync(join(skillDir(id), 'install.json'))
  const skill: InstalledSkill = {
    id,
    name,
    description: meta.description || '',
    source: opts?.source || 'file',
    sourceRef: opts?.sourceRef,
    prompt: body,
    installedAt: existing
      ? (JSON.parse(readFileSync(join(skillDir(id), 'install.json'), 'utf8')) as InstalledSkill)
          .installedAt
      : now,
    updatedAt: now,
  }
  const md = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${body}\n`
  writeSkill(skill, md)
  return skill
}

/**
 * Install from GitHub: owner/repo[/path/to/skill] or full URL to SKILL.md / folder.
 * Examples:
 * - anthropics/skills/skills/xlsx
 * - https://raw.githubusercontent.com/anthropics/skills/main/skills/xlsx/SKILL.md
 */
export async function installSkillFromGithub(ref: string): Promise<InstalledSkill> {
  const trimmed = ref.trim().replace(/\/$/, '')
  if (!trimmed) throw new Error('empty github ref')

  let rawUrl: string
  if (/^https?:\/\//i.test(trimmed)) {
    if (trimmed.includes('github.com') && !trimmed.includes('raw.githubusercontent.com')) {
      // https://github.com/owner/repo/blob/main/path/SKILL.md
      rawUrl = trimmed
        .replace('github.com', 'raw.githubusercontent.com')
        .replace('/blob/', '/')
      if (!rawUrl.endsWith('SKILL.md')) {
        rawUrl = `${rawUrl}/SKILL.md`
      }
    } else {
      rawUrl = trimmed.endsWith('SKILL.md') ? trimmed : `${trimmed}/SKILL.md`
    }
  } else {
    // owner/repo[/path]
    const parts = trimmed.split('/').filter(Boolean)
    if (parts.length < 2) throw new Error('use owner/repo or owner/repo/path')
    const owner = parts[0]!
    const repo = parts[1]!
    const rest = parts.slice(2)
    const path = rest.length ? rest.join('/') : ''
    const skillPath = path
      ? path.endsWith('SKILL.md')
        ? path
        : `${path}/SKILL.md`
      : 'SKILL.md'
    rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${skillPath}`
  }

  const res = await fetch(rawUrl, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) {
    throw new Error(`fetch failed HTTP ${res.status} for ${rawUrl}`)
  }
  const markdown = await res.text()
  if (!markdown.trim() || markdown.trim().startsWith('<!')) {
    throw new Error('not a SKILL.md (got HTML or empty)')
  }
  return installSkillFromMarkdown(markdown, {
    source: 'github',
    sourceRef: trimmed,
  })
}

export function uninstallSkill(id: string): boolean {
  if (BUILTIN.some((b) => b.id === id)) return false
  const dir = skillDir(id)
  if (!existsSync(dir)) return false
  rmSync(dir, { recursive: true, force: true })
  return true
}
