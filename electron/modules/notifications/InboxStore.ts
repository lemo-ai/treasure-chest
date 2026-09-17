import { BrowserWindow, Notification } from 'electron'
import {
  IpcChannels,
  type InboxItem,
  type InboxSnapshot,
  type PublishInboxInput,
} from '@shared'
import { getSetting, setSetting } from '../../db/AppSettingsRepo'
import { showMainWindow } from '../../windows/mainWindowRef'
import { fanOutExternalChannels, resolveNotifyFlags } from './ChannelNotify'
import { logger } from '../../utils/logger'

const ITEMS_KEY = 'inbox.items'
const MAX_ITEMS = 200

function nowIso(): string {
  return new Date().toISOString()
}

function uid(): string {
  return `inbox_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function readItems(): InboxItem[] {
  const raw = getSetting<InboxItem[]>(ITEMS_KEY, [])
  return Array.isArray(raw) ? raw.filter((x) => x && typeof x.id === 'string') : []
}

function writeItems(items: InboxItem[]): void {
  setSetting(ITEMS_KEY, items.slice(0, MAX_ITEMS))
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function getInboxSnapshot(): InboxSnapshot {
  const items = readItems()
  return {
    items,
    unreadCount: items.filter((i) => !i.read).length,
  }
}

export function listInboxItems(): InboxItem[] {
  return readItems()
}

export function getInboxItem(id: string): InboxItem | undefined {
  return readItems().find((i) => i.id === id)
}

export function markInboxRead(id: string): InboxItem | null {
  const items = readItems()
  const idx = items.findIndex((i) => i.id === id)
  if (idx < 0) return null
  if (items[idx]!.read) return items[idx]!
  items[idx] = { ...items[idx]!, read: true }
  writeItems(items)
  return items[idx]!
}

export function markAllInboxRead(): number {
  const items = readItems()
  let n = 0
  const next = items.map((i) => {
    if (i.read) return i
    n += 1
    return { ...i, read: true }
  })
  if (n) writeItems(next)
  return n
}

export function removeInboxItem(id: string): boolean {
  const items = readItems()
  const next = items.filter((i) => i.id !== id)
  if (next.length === items.length) return false
  writeItems(next)
  return true
}

export function clearInbox(): number {
  const n = readItems().length
  writeItems([])
  return n
}

export function publishInboxItem(input: PublishInboxInput): InboxItem {
  const flags = resolveNotifyFlags({
    workbench: input.notify?.workbench,
    desktop: input.notify?.desktop ?? input.desktop,
    dingtalk: input.notify?.dingtalk,
    email: input.notify?.email,
  })

  const item: InboxItem = {
    id: uid(),
    kind: input.kind ?? 'schedule',
    status: input.status,
    title: String(input.title || '').trim().slice(0, 80) || 'Notification',
    summary: String(input.summary || '').trim().slice(0, 280),
    detail: String(input.detail || input.summary || '').trim().slice(0, 80_000),
    detailFormat: input.detailFormat === 'html' || input.detailFormat === 'plain' ? input.detailFormat : 'markdown',
    taskId: input.taskId,
    sessionId: input.sessionId,
    coverPreset: input.coverPreset,
    createdAt: nowIso(),
    read: false,
  }

  if (flags.workbench) {
    writeItems([item, ...readItems()].slice(0, MAX_ITEMS))
    broadcast(IpcChannels.inbox.appended, item)
  }
  logger.info(
    `inbox published id=${item.id} status=${item.status} title=${item.title} channels=${JSON.stringify(flags)}`,
  )

  if (flags.desktop && Notification.isSupported()) {
    try {
      const n = new Notification({
        title: item.title,
        body: item.summary || item.detail.slice(0, 120),
      })
      n.on('click', () => {
        try {
          const win = showMainWindow()
          win.webContents.send(IpcChannels.inbox.open, { id: item.id })
        } catch (err) {
          logger.warn('inbox notification click failed', err)
        }
      })
      n.show()
    } catch (err) {
      logger.warn('inbox desktop notification failed', err)
    }
  }

  void fanOutExternalChannels(item, flags).then((errors) => {
    if (!errors.dingtalk && !errors.email) return
    if (!flags.workbench) return
    const extra = [
      errors.dingtalk ? `DingTalk: ${errors.dingtalk}` : '',
      errors.email ? `Email: ${errors.email}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    if (!extra) return
    const items = readItems()
    const idx = items.findIndex((i) => i.id === item.id)
    if (idx < 0) return
    items[idx] = {
      ...items[idx]!,
      detail: `${items[idx]!.detail}\n\n---\nChannel errors:\n${extra}`.slice(0, 12000),
    }
    writeItems(items)
  })

  return item
}
