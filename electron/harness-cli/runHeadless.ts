import { app } from 'electron'
import { initDatabase, closeDatabase } from '../db/Database'
import { initSettingsStore, settingsStore } from '../modules/settings/SettingsStore'
import { initFortuneStore } from '../modules/fortune/FortuneStore'
import { applyCordisStack } from '../modules/harness/cordis/CordisConfig'
import {
  appendHarnessUserMessage,
  createHarnessSession,
  listHarnessMessages,
  runHarnessChat,
  runHarnessChatStream,
} from '../modules/harness/HarnessService'
import { shutdownLsp } from '../modules/harness/coding/LspService'
import { logger } from '../utils/logger'

interface HarnessCliArgs {
  message: string
  agentId: string
  sessionId?: string
  title?: string
  stream: boolean
  autoApprove: boolean
  locale: string
  json: boolean
}

function parseArgs(): HarnessCliArgs {
  const argv = process.argv.slice(1)
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined
  }

  const message = get('--message') ?? get('-m')
  if (!message?.trim()) {
    console.error(
      [
        'Usage: electron . -- --harness-headless --message "..."',
        '  [--agent direct] [--session-id <id>] [--title "…"]',
        '  [--stream] [--auto-approve] [--locale zh-CN] [--json]',
      ].join('\n'),
    )
    process.exit(2)
  }

  return {
    message: message.trim(),
    agentId: get('--agent') ?? get('-a') ?? 'direct',
    sessionId: get('--session-id'),
    title: get('--title'),
    stream: argv.includes('--stream'),
    autoApprove: argv.includes('--auto-approve') || process.env.HARNESS_AUTO_APPROVE === '1',
    locale: get('--locale') ?? 'zh-CN',
    json: argv.includes('--json') || !argv.includes('--no-json'),
  }
}

export async function runHeadless(): Promise<void> {
  await app.whenReady()
  initDatabase()
  initSettingsStore()
  initFortuneStore()
  applyCordisStack()

  const args = parseArgs()
  let sessionId = args.sessionId
  if (!sessionId) {
    const session = createHarnessSession(args.agentId, args.title ?? 'Headless')
    sessionId = session.id
  }
  appendHarnessUserMessage(sessionId, args.message)

  const settings = settingsStore.getFortuneSettings()
  const req = {
    agentId: args.agentId,
    sessionId,
    messages: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
    locale: args.locale,
  }

  try {
    if (args.stream) {
      let streamedText = ''
      const events: unknown[] = []
      const result = await runHarnessChatStream(
        req,
        settings,
        (delta) => {
          streamedText += delta
          if (!args.json) process.stdout.write(delta)
        },
        (status) => {
          if (!args.json) process.stderr.write(`[status] ${status}\n`)
        },
        undefined,
        undefined,
        args.autoApprove ? async () => true : undefined,
        (ev) => {
          events.push(ev)
        },
      )
      if (!args.json) process.stdout.write('\n')
      if (args.json) {
        console.log(JSON.stringify({ sessionId, streamedText, result, events }, null, 2))
      }
    } else {
      const result = await runHarnessChat(req, settings)
      if (args.json) {
        console.log(JSON.stringify({ sessionId, result, messages: listHarnessMessages(sessionId) }, null, 2))
      } else {
        const messages = listHarnessMessages(sessionId)
        const last = messages.filter((m) => m.role === 'assistant').at(-1)
        console.log(last?.content ?? JSON.stringify(result, null, 2))
      }
    }
  } catch (err) {
    logger.error('harness headless failed', err)
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  } finally {
    shutdownLsp()
    closeDatabase()
    app.quit()
  }
}
