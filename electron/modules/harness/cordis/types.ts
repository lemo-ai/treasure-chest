import type { HarnessConfig } from '@shared'

export interface CordisPatchFile {
  version?: number
  profile?: string
  bundles?: string[]
  plugins?: { dir?: string }
  overrides?: {
    sandboxRoot?: string | null
    enablePluginTools?: boolean
    dshWebUrl?: string
    harness?: Partial<HarnessConfig>
  }
}

export interface CordisProfileFile {
  id?: string
  harness?: Partial<HarnessConfig>
  sandbox?: {
    mode?: 'local' | 'ssh' | 'container'
    root?: string
    ssh?: {
      host?: string
      user?: string
      remotePath?: string
      port?: number
    }
    container?: {
      containerName?: string
      workspacePath?: string
    }
  }
}

export interface CordisBundleFile {
  id?: string
  version?: string
  description?: string
  plugins?: Array<{ id: string; path: string }>
  profiles?: string[]
}

export interface CordisStackSnapshot {
  cordisRoot: string
  patchPath: string
  profileId: string
  profilePath: string
  bundleIds: string[]
  bundlePaths: string[]
  pluginsDir: string
  harness: Partial<HarnessConfig>
  sandboxMode: 'local' | 'ssh' | 'container'
  sandboxRoot?: string | null
  ssh?: {
    host: string
    user: string
    remotePath: string
    port?: number
  }
  container?: {
    containerName: string
    workspacePath: string
  }
  dshWebUrl?: string
  enablePluginTools?: boolean
}
