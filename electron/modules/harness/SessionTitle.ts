import type { FortuneSettings } from '@shared'
import { callLlmChat } from '../llm/LlmClient'
import { logger } from '../../utils/logger'
import { getSession, listEvents, renameSession } from './SessionRepo'
import { settingsToLlmEndpoint } from './SystemPrompt'

const DEFAULT_TITLES = new Set(['新会话', 'New chat'])
const inflight = new Set<string>()

function isDefaultTitle(title: string): boolean {
  return DEFAULT_TITLES.has(title.trim())
}

function firstUserSnippet(sessionId: string): string | null {
  for (const event of listEvents(sessionId)) {
    if (event.type !== 'user/message') continue
    const content = (event.payload as { content: string }).content
    if (content.startsWith('[system] ')) continue
    const text = content.trim()
    if (text) return text.slice(0, 600)
  }
  return null
}

function shouldUpgradeTitle(sessionId: string): boolean {
  const session = getSession(sessionId)
  const snippet = firstUserSnippet(sessionId)
  if (!session || !snippet) return false
  if (isDefaultTitle(session.title)) return true
  return session.title === snippet.slice(0, 24)
}

/** Fire-and-forget LLM session title when still on the default placeholder. */
export function scheduleSessionTitleGeneration(
  sessionId: string,
  settings: FortuneSettings,
  locale: string,
): void {
  const id = sessionId.trim()
  if (!id || inflight.has(id) || !shouldUpgradeTitle(id)) return
  const snippet = firstUserSnippet(id)
  if (!snippet) return

  inflight.add(id)
  const isEn = locale.toLowerCase().startsWith('en')
  void (async () => {
    try {
      const endpoint = settingsToLlmEndpoint(settings)
      const result = await callLlmChat({
        ...endpoint,
        messages: [
          {
            role: 'user',
            content: isEn
              ? `Write a short chat session title (max 18 characters, no quotes) summarizing:\n${snippet}`
              : `为下面这条用户消息写一个简短会话标题（最多 18 字，不要引号）：\n${snippet}`,
          },
        ],
        temperature: 0.2,
        maxTokens: 32,
        timeoutMs: 20_000,
        tag: `session-title-${id}`,
      })
      const title = result.text?.trim().replace(/^["'「『]+|["'」』]+$/g, '')
      if (result.ok && title && shouldUpgradeTitle(id)) {
        renameSession(id, title.slice(0, 32))
        return
      }
      if (shouldUpgradeTitle(id)) {
        renameSession(id, snippet.slice(0, 24))
      }
    } catch (err) {
      logger.warn('session title generation failed', err)
      if (shouldUpgradeTitle(id)) renameSession(id, snippet.slice(0, 24))
    } finally {
      inflight.delete(id)
    }
  })()
}
