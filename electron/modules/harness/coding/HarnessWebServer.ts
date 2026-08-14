import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { URL } from 'node:url'
import { logger } from '../../../utils/logger'
import { getCordisStack } from '../cordis/CordisLoader'
import { describeSandboxBackend } from '../coding/RemoteSandbox'
import { listHarnessPlugins } from '../plugins/PluginLoader'
import * as SessionRepo from '../SessionRepo'
import * as GoalsStore from '../GoalsStore'

const DEFAULT_PORT = 8787
const HOST = '127.0.0.1'

let server: Server | null = null
let runningPort: number | null = null

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(text)
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

function dashboardHtml(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Harness Web</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #0f1419; color: #d6dde6; }
    header { padding: 16px 20px; border-bottom: 1px solid #243041; }
    h1 { margin: 0 0 4px; font-size: 18px; }
    .sub { color: #8b98a8; font-size: 13px; }
    main { display: grid; grid-template-columns: 280px 1fr; gap: 16px; padding: 16px 20px; min-height: calc(100vh - 72px); }
    .panel { background: #151b24; border: 1px solid #243041; border-radius: 10px; padding: 12px; }
    .panel h2 { margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #8b98a8; }
    button, select { background: #1c2430; color: inherit; border: 1px solid #334155; border-radius: 8px; padding: 8px 10px; cursor: pointer; }
    button:hover { border-color: #6ee7a8; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { padding: 8px 10px; border-radius: 8px; cursor: pointer; margin-bottom: 4px; }
    li:hover, li.active { background: #1c2430; }
    .meta { font-size: 12px; color: #8b98a8; }
    pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.45; max-height: 60vh; overflow: auto; }
    .kv { display: grid; grid-template-columns: 120px 1fr; gap: 6px 10px; font-size: 13px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #1c2430; font-size: 11px; }
  </style>
</head>
<body>
  <header>
    <h1>Harness Web</h1>
    <div class="sub">Embedded status dashboard · http://${HOST}:${port}</div>
  </header>
  <main>
    <section class="panel">
      <h2>Sessions</h2>
      <ul id="sessions"></ul>
    </section>
    <section class="panel">
      <h2 id="detailTitle">Overview</h2>
      <div id="detail"></div>
    </section>
  </main>
  <script>
    const sessionsEl = document.getElementById('sessions')
    const detailEl = document.getElementById('detail')
    const detailTitle = document.getElementById('detailTitle')
    let activeId = null

    async function api(path) {
      const res = await fetch(path)
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    }

    function renderOverview(data) {
      detailTitle.textContent = 'Overview'
      detailEl.innerHTML = \`
        <div class="kv">
          <div>Sandbox</div><div><span class="badge">\${data.sandbox.mode}</span> \${data.sandbox.label}</div>
          <div>Cordis profile</div><div>\${data.cordis.profileId}</div>
          <div>Bundles</div><div>\${(data.cordis.bundleIds || []).join(', ') || '—'}</div>
          <div>Plugins</div><div>\${(data.plugins || []).map(p => p.name).join(', ') || '—'}</div>
        </div>\`
    }

    function renderSession(data) {
      detailTitle.textContent = data.session.title
      const goals = (data.goals || []).map(g => \`<li>\${g.title} <span class="meta">(\${g.status})</span></li>\`).join('')
      const events = (data.events || []).slice(-80).map(ev => {
        const p = ev.payload || {}
        const detail = ev.type.startsWith('tool/') ? (p.name || '') : (p.content || p.delta || p.task || JSON.stringify(p)).slice(0, 120)
        return \`<div><span class="badge">\${ev.type}</span> <span class="meta">#\${ev.seq}</span> \${detail}</div>\`
      }).join('')
      detailEl.innerHTML = \`
        <div class="meta">Agent: \${data.session.agentId} · Updated: \${data.session.updatedAt}</div>
        <h2 style="margin-top:14px">Goals</h2>
        <ul>\${goals || '<li class="meta">No goals</li>'}</ul>
        <h2 style="margin-top:14px">Recent events</h2>
        <pre>\${events || 'No events'}</pre>\`
    }

    async function selectSession(id) {
      activeId = id
      for (const li of sessionsEl.querySelectorAll('li')) {
        li.classList.toggle('active', li.dataset.id === id)
      }
      const data = await api('/api/sessions/' + encodeURIComponent(id))
      renderSession(data)
    }

    async function refresh() {
      const status = await api('/api/status')
      if (!activeId) renderOverview(status)
      const list = await api('/api/sessions')
      sessionsEl.innerHTML = list.sessions.map(s =>
        \`<li data-id="\${s.id}"><strong>\${s.title}</strong><div class="meta">\${s.agentId} · \${s.updatedAt.slice(0, 19)}</div></li>\`
      ).join('')
      sessionsEl.querySelectorAll('li').forEach(li => li.onclick = () => selectSession(li.dataset.id))
      if (activeId) await selectSession(activeId)
    }

    refresh().catch(err => { detailEl.textContent = String(err) })
    setInterval(() => refresh().catch(() => {}), 5000)
  </script>
</body>
</html>`
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const base = `http://${HOST}:${runningPort ?? DEFAULT_PORT}`
    const url = new URL(req.url || '/', base)
    const path = url.pathname

    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(dashboardHtml(runningPort ?? DEFAULT_PORT))
      return
    }

    if (req.method === 'GET' && path === '/api/status') {
      const stack = getCordisStack()
      const sandbox = describeSandboxBackend()
      const plugins = await listHarnessPlugins()
      json(res, 200, {
        ok: true,
        embedded: true,
        port: runningPort,
        sandbox,
        cordis: {
          profileId: stack.profileId,
          bundleIds: stack.bundleIds,
          pluginsDir: stack.pluginsDir,
        },
        plugins,
      })
      return
    }

    if (req.method === 'GET' && path === '/api/sessions') {
      json(res, 200, { sessions: SessionRepo.listSessions() })
      return
    }

    const sessionMatch = /^\/api\/sessions\/([^/]+)$/.exec(path)
    if (req.method === 'GET' && sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1])
      const session = SessionRepo.listSessions().find((s) => s.id === sessionId)
      if (!session) {
        json(res, 404, { error: 'session not found' })
        return
      }
      json(res, 200, {
        session,
        events: SessionRepo.listEvents(sessionId),
        goals: GoalsStore.listGoals(sessionId, true),
      })
      return
    }

    if (req.method === 'POST' && path === '/api/reload-cordis') {
      await readBody(req)
      const { reloadCordisStack } = await import('../cordis/CordisLoader')
      const { applyCordisStack } = await import('../cordis/CordisConfig')
      json(res, 200, { stack: applyCordisStack(true), reloaded: reloadCordisStack() })
      return
    }

    json(res, 404, { error: 'not found' })
  } catch (err) {
    logger.warn('harness web request failed', err)
    json(res, 500, { error: err instanceof Error ? err.message : String(err) })
  }
}

function listenOnPort(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const srv = createServer((req, res) => {
      void handleRequest(req, res)
    })
    srv.on('error', reject)
    srv.listen(port, HOST, () => resolve(srv))
  })
}

export async function startEmbeddedHarnessWebServer(preferredPort = DEFAULT_PORT): Promise<string> {
  if (server && runningPort) return `http://${HOST}:${runningPort}`

  let port = preferredPort
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      server = await listenOnPort(port)
      runningPort = port
      logger.info(`embedded harness web listening on http://${HOST}:${port}`)
      return `http://${HOST}:${port}`
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EADDRINUSE') {
        port += 1
        continue
      }
      throw err
    }
  }
  throw new Error('failed to bind harness web server port')
}

export function stopEmbeddedHarnessWebServer(): void {
  if (!server) return
  try {
    server.close()
  } catch (err) {
    logger.warn('harness web server close failed', err)
  }
  server = null
  runningPort = null
}

export function getEmbeddedHarnessWebUrl(): string | null {
  if (!server || !runningPort) return null
  return `http://${HOST}:${runningPort}`
}

export function isEmbeddedHarnessWebRunning(): boolean {
  return server != null && runningPort != null
}
