import { homedir } from 'node:os'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, normalize, resolve, sep } from 'node:path'
import type { Connect, Plugin } from 'vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/** Match Electron userData/models/vision for app name 袖里乾坤. */
function visionModelsRoot(): string {
  const name = '袖里乾坤'
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', name, 'models', 'vision')
  }
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), name, 'models', 'vision')
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), name, 'models', 'vision')
}

function contentTypeFor(rel: string): string {
  const lower = rel.toLowerCase()
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.wasm')) return 'application/wasm'
  if (lower.endsWith('.mjs') || lower.endsWith('.js')) return 'text/javascript'
  return 'application/octet-stream'
}

/** Same-origin /__vision__/* → userData models (avoids localhost↔127.0.0.1 PNA blocks). */
function visionAssetsPlugin(): Plugin {
  const root = visionModelsRoot()
  return {
    name: 'treasure-vision-assets',
    configureServer(server) {
      const handler: Connect.NextHandleFunction = (req, res, next) => {
        try {
          const raw = decodeURIComponent((req.url || '').split('?')[0] || '')
          if (!raw.startsWith('/__vision__/')) {
            next()
            return
          }
          const relUrl = raw.slice('/__vision__/'.length)
          const parts = relUrl.split('/').filter(Boolean)
          const id = parts[0]
          const rel = parts.slice(1).join('/')
          if (!id || !rel || rel.includes('..')) {
            res.statusCode = 400
            res.end('bad request')
            return
          }
          const modelRoot = normalize(join(root, id))
          const filePath = normalize(join(modelRoot, rel))
          const allowedPrefix = modelRoot.endsWith(sep) ? modelRoot : modelRoot + sep
          if (filePath !== modelRoot && !filePath.startsWith(allowedPrefix)) {
            res.statusCode = 403
            res.end('forbidden')
            return
          }
          if (!existsSync(filePath) || !statSync(filePath).isFile()) {
            res.statusCode = 404
            res.end('not found')
            return
          }
          const st = statSync(filePath)
          res.setHeader('Content-Type', contentTypeFor(rel))
          res.setHeader('Content-Length', String(st.size))
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          createReadStream(filePath).pipe(res)
        } catch {
          res.statusCode = 500
          res.end('error')
        }
      }
      server.middlewares.use(handler)
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/main/index.ts'),
      },
    },
    resolve: {
      alias: {
        '@main': resolve('electron'),
        '@shared': resolve('packages/shared/src'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/preload/index.ts'),
      },
    },
    resolve: {
      alias: {
        '@shared': resolve('packages/shared/src'),
      },
    },
  },
  renderer: {
    root: resolve('src'),
    build: {
      rollupOptions: {
        input: resolve('src/index.html'),
      },
      assetsInlineLimit: 0,
    },
    resolve: {
      alias: {
        '@renderer': resolve('src'),
        '@shared': resolve('packages/shared/src'),
        '@config': resolve('config'),
      },
    },
    server: {
      fs: {
        allow: [resolve('.'), resolve('config')],
      },
    },
    optimizeDeps: {
      exclude: ['onnxruntime-web'],
    },
    assetsInclude: ['**/*.wasm'],
    plugins: [react(), visionAssetsPlugin()],
  },
})
