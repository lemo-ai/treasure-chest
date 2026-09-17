import { createHmac } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { createTransport } from 'nodemailer'
import type { InboxItem, ScheduleNotifyOverride } from '@shared'
import { settingsStore } from '../settings/SettingsStore'
import { logger } from '../../utils/logger'
import { htmlToDingTalkText } from './reportFormat'

export type NotifyChannelFlags = {
  workbench: boolean
  desktop: boolean
  dingtalk: boolean
  email: boolean
}

export function resolveNotifyFlags(override?: ScheduleNotifyOverride | null): NotifyChannelFlags {
  const channels = settingsStore.getNotifications().channels
  return {
    workbench: override?.workbench ?? channels.workbenchInbox,
    desktop: override?.desktop ?? channels.desktopOs,
    dingtalk: override?.dingtalk ?? channels.dingtalk.enabled,
    email: override?.email ?? channels.email.enabled,
  }
}

function dingtalkSign(secret: string, timestamp: number): string {
  const stringToSign = `${timestamp}\n${secret}`
  return createHmac('sha256', secret).update(stringToSign).digest('base64')
}

export async function sendDingTalkMarkdown(title: string, text: string): Promise<void> {
  const cfg = settingsStore.getNotifications().channels.dingtalk
  if (!cfg.enabled || !cfg.webhookUrl.trim()) {
    throw new Error('dingtalk_not_configured')
  }
  let url = cfg.webhookUrl.trim()
  if (cfg.secret.trim()) {
    const timestamp = Date.now()
    const sign = encodeURIComponent(dingtalkSign(cfg.secret.trim(), timestamp))
    url += (url.includes('?') ? '&' : '?') + `timestamp=${timestamp}&sign=${sign}`
  }
  const body = {
    msgtype: 'markdown',
    markdown: {
      title: title.slice(0, 64),
      text: `### ${title}\n\n${text.slice(0, 4000)}`,
    },
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    throw new Error(`dingtalk_http_${res.status}`)
  }
  const json = (await res.json().catch(() => ({}))) as { errcode?: number; errmsg?: string }
  if (typeof json.errcode === 'number' && json.errcode !== 0) {
    throw new Error(json.errmsg || `dingtalk_errcode_${json.errcode}`)
  }
}

export async function sendEmailNotification(
  title: string,
  text: string,
  opts?: { html?: string },
): Promise<void> {
  const cfg = settingsStore.getNotifications().channels.email
  if (!cfg.enabled || !cfg.smtpHost.trim() || !cfg.to.trim()) {
    throw new Error('email_not_configured')
  }
  const transporter = createTransport({
    host: cfg.smtpHost.trim(),
    port: cfg.smtpPort || 465,
    secure: Boolean(cfg.secure),
    auth: cfg.user.trim()
      ? {
          user: cfg.user.trim(),
          pass: cfg.pass,
        }
      : undefined,
  })
  await transporter.sendMail({
    from: cfg.from.trim() || cfg.user.trim() || 'qiankun@localhost',
    to: cfg.to.trim(),
    subject: title.slice(0, 120),
    text: text.slice(0, 20_000),
    html: opts?.html ? opts.html.slice(0, 200_000) : undefined,
  })
}

export async function fanOutExternalChannels(
  item: Pick<InboxItem, 'title' | 'summary' | 'detail' | 'detailFormat'>,
  flags: NotifyChannelFlags,
): Promise<{ dingtalk?: string; email?: string }> {
  const errors: { dingtalk?: string; email?: string } = {}
  const isHtml = item.detailFormat === 'html'
  const detailForDing = isHtml ? htmlToDingTalkText(item.detail) : item.detail
  const dingBody = [item.summary, detailForDing].filter(Boolean).join('\n\n')
  if (flags.dingtalk) {
    try {
      await sendDingTalkMarkdown(item.title, dingBody)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.dingtalk = msg
      logger.warn('dingtalk notify failed', err)
    }
  }
  if (flags.email) {
    try {
      const plain = isHtml
        ? [item.summary, htmlToDingTalkText(item.detail)].filter(Boolean).join('\n\n')
        : [item.summary, item.detail].filter(Boolean).join('\n\n')
      await sendEmailNotification(item.title, plain, isHtml ? { html: item.detail } : undefined)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.email = msg
      logger.warn('email notify failed', err)
    }
  }
  return errors
}

/** Used by settings “test” buttons. */
export async function testDingTalk(): Promise<{ ok: boolean; error?: string }> {
  try {
    await sendDingTalkMarkdown('袖里乾坤', '钉钉通知测试成功。')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function testEmail(): Promise<{ ok: boolean; error?: string }> {
  try {
    await sendEmailNotification('袖里乾坤邮件测试', '邮件通知通道配置成功。')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function readLocalFileSafe(path: string, maxBytes = 200_000): string {
  if (!path || !existsSync(path)) throw new Error('file_not_found')
  const buf = readFileSync(path)
  if (buf.byteLength > maxBytes) {
    return buf.subarray(0, maxBytes).toString('utf8') + '\n…(truncated)'
  }
  return buf.toString('utf8')
}
