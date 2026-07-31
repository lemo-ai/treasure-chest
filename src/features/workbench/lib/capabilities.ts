export type WorkbenchCapabilityId =
  | 'upload'
  | 'knowledge'
  | 'mcp'
  | 'skills'
  | 'image'
  | 'write'
  | 'translate'
  | 'video'
  | 'music'
  | 'transcribe'
  | 'research'

export interface WorkbenchCapability {
  id: WorkbenchCapabilityId
  labelKey: string
  /** Coming soon: click shows placeholder toast-like system message */
  status: 'ready' | 'soon'
}

/** All capabilities; primary row shows a subset, the rest live under「更多」. */
export const WORKBENCH_CAPABILITIES: WorkbenchCapability[] = [
  { id: 'upload', labelKey: 'workbench.cap.upload', status: 'ready' },
  { id: 'knowledge', labelKey: 'workbench.cap.knowledge', status: 'soon' },
  { id: 'mcp', labelKey: 'workbench.cap.mcp', status: 'soon' },
  { id: 'skills', labelKey: 'workbench.cap.skills', status: 'soon' },
  { id: 'image', labelKey: 'workbench.cap.image', status: 'soon' },
  { id: 'write', labelKey: 'workbench.cap.write', status: 'soon' },
  { id: 'translate', labelKey: 'workbench.cap.translate', status: 'soon' },
  { id: 'video', labelKey: 'workbench.cap.video', status: 'soon' },
  { id: 'music', labelKey: 'workbench.cap.music', status: 'soon' },
  { id: 'transcribe', labelKey: 'workbench.cap.transcribe', status: 'soon' },
  { id: 'research', labelKey: 'workbench.cap.research', status: 'soon' },
]

/** Shown inline on the same row as the model picker (keep short so it never wraps). */
export const WORKBENCH_PRIMARY_CAP_IDS: WorkbenchCapabilityId[] = [
  'upload',
  'knowledge',
  'mcp',
  'skills',
  'image',
]

export function splitWorkbenchCapabilities(): {
  primary: WorkbenchCapability[]
  overflow: WorkbenchCapability[]
} {
  const primaryIds = new Set(WORKBENCH_PRIMARY_CAP_IDS)
  const primary = WORKBENCH_CAPABILITIES.filter((c) => primaryIds.has(c.id))
  const overflow = WORKBENCH_CAPABILITIES.filter((c) => !primaryIds.has(c.id))
  return { primary, overflow }
}
