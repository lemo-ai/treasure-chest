import { DEFAULT_HARNESS_CONFIG, type HarnessConfig } from '@shared'
import { getCordisStack, loadCordisStack } from './CordisLoader'
import { setSandboxRoot } from '../coding/Sandbox'
import { reloadHarnessPlugins } from '../plugins/PluginLoader'
import { logger } from '../../../utils/logger'

export function resolveHarnessConfig(overrides?: Partial<HarnessConfig>): HarnessConfig {
  const stack = getCordisStack()
  return { ...DEFAULT_HARNESS_CONFIG, ...stack.harness, ...overrides }
}

/** Load Cordis stack, apply sandbox root, reload plugins. Call on app ready. */
export function applyCordisStack(force = false): ReturnType<typeof loadCordisStack> {
  const stack = loadCordisStack(force)
  if (stack.sandboxMode === 'local' && stack.sandboxRoot?.trim()) {
    try {
      setSandboxRoot(stack.sandboxRoot.trim())
    } catch (err) {
      logger.warn('cordis sandbox root apply failed', err)
    }
  }
  void reloadHarnessPlugins()
  return stack
}
