import type { AgentSession, HarnessMessage, SessionEvent } from '@shared'
import { exportTextAsPdf } from '../tools/DocPdf'
import { saveTextDialog } from '../tools/ToolsIO'
import { getSession, listEvents, deriveMessages } from './SessionRepo'
import { listArtifacts } from '../artifacts/ArtifactsStore'

function escapeMd(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

function formatMessagesMarkdown(session: AgentSession, messages: HarnessMessage[]): string {
  const lines: string[] = [
    `# ${session.title}`,
    '',
    `- Session: \`${session.id}\``,
    `- Agent: \`${session.agentId}\``,
    session.projectId ? `- Project: \`${session.projectId}\`` : '',
    `- Updated: ${session.updatedAt}`,
    '',
    '---',
    '',
  ].filter(Boolean) as string[]
  for (const msg of messages) {
    const role =
      msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : msg.role === 'system' ? 'System' : msg.role
    lines.push(`## ${role}`)
    lines.push('')
    lines.push(escapeMd(msg.content || '').trim() || '_(empty)_')
    lines.push('')
    if (msg.toolSteps?.length) {
      lines.push('### Tools')
      lines.push('')
      for (const step of msg.toolSteps) {
        lines.push(
          `- **${step.label || step.name}** (\`${step.status}\`)${step.error ? ` — ${step.error}` : ''}`,
        )
        if (step.argsPreview) lines.push(`  - args: \`${step.argsPreview.slice(0, 500)}\``)
        if (step.resultPreview) lines.push(`  - result: \`${step.resultPreview.slice(0, 800)}\``)
      }
      lines.push('')
    }
  }
  return lines.join('\n').trim() + '\n'
}

function formatEventsAppendix(events: SessionEvent[]): string {
  if (!events.length) return ''
  const lines = ['', '---', '', '## Event log (appendix)', '']
  for (const ev of events) {
    const preview = JSON.stringify(ev.payload).slice(0, 240)
    lines.push(`- \`#${ev.seq}\` **${ev.type}** — ${preview}`)
  }
  lines.push('')
  return lines.join('\n')
}

function formatArtifactsAppendix(sessionId: string): string {
  const arts = listArtifacts({ sessionId, limit: 80 })
  if (!arts.length) return ''
  const lines = ['', '---', '', '## Artifacts', '']
  for (const a of arts) {
    lines.push(`- **${a.kind}** — ${a.title} (\`${a.id}\`)`)
    if (a.kind === 'link' || a.kind === 'image' || a.kind === 'video' || a.kind === 'audio') {
      lines.push(`  - ${a.content.slice(0, 300)}`)
    } else {
      lines.push('')
      lines.push('```' + (a.language || (a.kind === 'markdown' ? 'markdown' : 'text')))
      lines.push(a.content.slice(0, 4000))
      lines.push('```')
      lines.push('')
    }
  }
  return lines.join('\n')
}

export function buildSessionMarkdown(
  sessionId: string,
  opts?: { includeEvents?: boolean; includeArtifacts?: boolean },
): { ok: true; markdown: string; title: string } | { ok: false; error: string } {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'session_not_found' }
  const messages = deriveMessages(sessionId)
  let md = formatMessagesMarkdown(session, messages)
  if (opts?.includeArtifacts !== false) {
    md += formatArtifactsAppendix(sessionId)
  }
  if (opts?.includeEvents) {
    md += formatEventsAppendix(listEvents(sessionId))
  }
  return { ok: true, markdown: md, title: session.title }
}

export async function exportSessionMarkdown(
  sessionId: string,
  opts?: { includeEvents?: boolean },
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const built = buildSessionMarkdown(sessionId, opts)
  if (!built.ok) return { ok: false, error: built.error }
  const safe = built.title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 48) || 'session'
  return saveTextDialog({
    content: built.markdown,
    defaultName: `${safe}.md`,
    extensions: ['md', 'txt'],
  })
}

export async function exportSessionPdf(
  sessionId: string,
  opts?: { includeEvents?: boolean },
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const built = buildSessionMarkdown(sessionId, opts)
  if (!built.ok) return { ok: false, error: built.error }
  const safe = built.title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 48) || 'session'
  return exportTextAsPdf({ content: built.markdown, defaultName: `${safe}.pdf` })
}
