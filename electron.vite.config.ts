import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

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
    },
    resolve: {
      alias: {
        '@renderer': resolve('src'),
        '@shared': resolve('packages/shared/src'),
      },
    },
    plugins: [react()],
  },
})
