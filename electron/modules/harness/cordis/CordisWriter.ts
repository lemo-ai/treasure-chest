import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs'
import { join, dirname } from 'node:path'
import yaml from 'js-yaml'
import type { CordisPatchFile, CordisProfileFile, CordisBundleFile } from './types'
import { getCordisRootPath, loadCordisStack, reloadCordisStack } from './CordisLoader'
import { applyCordisStack } from './CordisConfig'
import { logger } from '../../../utils/logger'

export interface SaveCordisSettingsInput {
  profileId?: string
  bundleIds?: string[]
  enablePluginTools?: boolean
  dshWebUrl?: string
  sandboxRoot?: string | null
  sandboxMode?: 'local' | 'ssh' | 'container'
  sshHost?: string
  sshUser?: string
  sshRemotePath?: string
  sshPort?: number
  containerName?: string
  containerWorkspacePath?: string
}

export interface CreateCordisProfileInput {
  profileId: string
  copyFrom?: string
}

export interface CreateCordisBundleInput {
  bundleId: string
  description?: string
  copyFrom?: string
}

function readYamlFile<T>(path: string): T {
  if (!existsSync(path)) return {} as T
  return yaml.load(readFileSync(path, 'utf8')) as T
}

function writeYamlFile(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, yaml.dump(data, { lineWidth: 120, noRefs: true }), 'utf8')
}

export function saveCordisSettings(input: SaveCordisSettingsInput): ReturnType<typeof loadCordisStack> {
  const root = getCordisRootPath()
  const patchPath = join(root, 'patch.yml')
  const patch = readYamlFile<CordisPatchFile>(patchPath)

  if (input.profileId?.trim()) patch.profile = input.profileId.trim()
  if (input.bundleIds) patch.bundles = input.bundleIds.map((b) => b.trim()).filter(Boolean)

  patch.overrides = patch.overrides ?? {}
  if (input.enablePluginTools !== undefined) patch.overrides.enablePluginTools = input.enablePluginTools
  if (input.dshWebUrl?.trim()) patch.overrides.dshWebUrl = input.dshWebUrl.trim()
  if (input.sandboxRoot !== undefined) patch.overrides.sandboxRoot = input.sandboxRoot

  writeYamlFile(patchPath, patch)

  const profileId = input.profileId?.trim() || patch.profile?.trim() || 'default'
  const profilePath = join(root, 'profiles', profileId, 'profile.yml')
  const profile = readYamlFile<CordisProfileFile>(profilePath)
  profile.id = profileId

  if (input.sandboxMode || input.sshHost || input.sshUser || input.sshRemotePath || input.sshPort || input.containerName) {
    profile.sandbox = profile.sandbox ?? {}
    if (input.sandboxMode) profile.sandbox.mode = input.sandboxMode
    if (input.sandboxRoot !== undefined) profile.sandbox.root = input.sandboxRoot ?? undefined
    if (input.sandboxMode === 'ssh' || input.sshHost || input.sshUser) {
      profile.sandbox.ssh = profile.sandbox.ssh ?? {}
      if (input.sshHost?.trim()) profile.sandbox.ssh.host = input.sshHost.trim()
      if (input.sshUser?.trim()) profile.sandbox.ssh.user = input.sshUser.trim()
      if (input.sshRemotePath?.trim()) profile.sandbox.ssh.remotePath = input.sshRemotePath.trim()
      if (input.sshPort) profile.sandbox.ssh.port = input.sshPort
    }
    if (input.sandboxMode === 'container' || input.containerName) {
      profile.sandbox.container = profile.sandbox.container ?? {}
      if (input.containerName?.trim()) profile.sandbox.container.containerName = input.containerName.trim()
      if (input.containerWorkspacePath?.trim()) {
        profile.sandbox.container.workspacePath = input.containerWorkspacePath.trim()
      }
    }
  }

  writeYamlFile(profilePath, profile)

  try {
    reloadCordisStack()
    return applyCordisStack(true)
  } catch (err) {
    logger.warn('save cordis settings reload failed', err)
    return loadCordisStack(true)
  }
}

export function createCordisProfile(input: CreateCordisProfileInput): string {
  const profileId = input.profileId.trim()
  if (!profileId) throw new Error('profileId required')
  const root = getCordisRootPath()
  const destDir = join(root, 'profiles', profileId)
  if (existsSync(destDir)) throw new Error(`profile already exists: ${profileId}`)

  const copyFrom = input.copyFrom?.trim() || 'default'
  const srcDir = join(root, 'profiles', copyFrom)
  if (existsSync(srcDir)) {
    cpSync(srcDir, destDir, { recursive: true })
    const profilePath = join(destDir, 'profile.yml')
    const profile = readYamlFile<CordisProfileFile>(profilePath)
    profile.id = profileId
    writeYamlFile(profilePath, profile)
  } else {
    mkdirSync(destDir, { recursive: true })
    writeYamlFile(join(destDir, 'profile.yml'), {
      id: profileId,
      harness: { maxContextMessages: 48, enableCodingTools: true },
      sandbox: { mode: 'local' },
    })
  }
  return profileId
}

export function createCordisBundle(input: CreateCordisBundleInput): string {
  const bundleId = input.bundleId.trim()
  if (!bundleId) throw new Error('bundleId required')
  const root = getCordisRootPath()
  const destDir = join(root, 'bundles', bundleId)
  if (existsSync(destDir)) throw new Error(`bundle already exists: ${bundleId}`)

  const copyFrom = input.copyFrom?.trim()
  const srcDir = copyFrom ? join(root, 'bundles', copyFrom) : ''
  if (copyFrom && existsSync(srcDir)) {
    cpSync(srcDir, destDir, { recursive: true })
    const bundlePath = join(destDir, 'bundle.yml')
    const bundle = readYamlFile<CordisBundleFile>(bundlePath)
    bundle.id = bundleId
    if (input.description?.trim()) bundle.description = input.description.trim()
    writeYamlFile(bundlePath, bundle)
  } else {
    mkdirSync(join(destDir, 'plugins'), { recursive: true })
    writeYamlFile(join(destDir, 'bundle.yml'), {
      id: bundleId,
      version: '0.1.0',
      description: input.description?.trim() || `${bundleId} bundle`,
      plugins: [],
      profiles: ['default'],
    })
  }
  return bundleId
}
