/** In-app notification inbox (schedule results and related alerts). */

export type InboxItemKind = 'schedule'

export type InboxItemStatus = 'ok' | 'error' | 'skipped' | 'info'

export interface InboxItem {
  id: string
  kind: InboxItemKind
  status: InboxItemStatus
  title: string
  /** Short line for list + desktop notification body */
  summary: string
  /** Full detail for the detail pane (markdown / html / plain) */
  detail: string
  /** How to render `detail`. Defaults to markdown when omitted. */
  detailFormat?: 'markdown' | 'html' | 'plain'
  taskId?: string
  sessionId?: string
  coverPreset?: 'fortune' | 'stocks' | 'lottery' | 'agent' | 'custom'
  createdAt: string
  read: boolean
}

export interface InboxSnapshot {
  items: InboxItem[]
  unreadCount: number
}

export interface PublishInboxInput {
  kind?: InboxItemKind
  status: InboxItemStatus
  title: string
  summary: string
  detail: string
  detailFormat?: InboxItem['detailFormat']
  taskId?: string
  sessionId?: string
  coverPreset?: InboxItem['coverPreset']
  /** @deprecated prefer notify.desktop */
  desktop?: boolean
  /** Per-delivery channel overrides; omitted keys follow global NotificationSettings.channels */
  notify?: {
    workbench?: boolean
    desktop?: boolean
    dingtalk?: boolean
    email?: boolean
  }
}
