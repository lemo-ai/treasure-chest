import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/shared/**/*.test.ts',
      'electron/**/*.test.ts',
      'src/features/**/*.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'packages/shared/src/index.ts'),
    },
  },
})
