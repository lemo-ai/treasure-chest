export type WorkbenchCapabilityId =
  | 'websearch'
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
  | 'create_agent'

export interface WorkbenchCapability {
  id: WorkbenchCapabilityId
  labelKey: string
  /** Coming soon: click shows placeholder toast-like system message */
  status: 'ready' | 'soon'
}

/** All capabilities; primary row shows a subset, the rest live under「更多」. */
export const WORKBENCH_CAPABILITIES: WorkbenchCapability[] = [
  { id: 'websearch', labelKey: 'workbench.cap.websearch', status: 'ready' },
  { id: 'upload', labelKey: 'workbench.cap.upload', status: 'ready' },
  { id: 'knowledge', labelKey: 'workbench.cap.knowledge', status: 'ready' },
  { id: 'mcp', labelKey: 'workbench.cap.mcp', status: 'ready' },
  { id: 'skills', labelKey: 'workbench.cap.skills', status: 'ready' },
  { id: 'create_agent', labelKey: 'workbench.cap.create_agent', status: 'ready' },
  { id: 'image', labelKey: 'workbench.cap.image', status: 'ready' },
  { id: 'write', labelKey: 'workbench.cap.write', status: 'ready' },
  { id: 'translate', labelKey: 'workbench.cap.translate', status: 'ready' },
  { id: 'video', labelKey: 'workbench.cap.video', status: 'ready' },
  { id: 'music', labelKey: 'workbench.cap.music', status: 'ready' },
  { id: 'transcribe', labelKey: 'workbench.cap.transcribe', status: 'ready' },
  { id: 'research', labelKey: 'workbench.cap.research', status: 'ready' },
]

/** Shown inline on the same row as the model picker (keep short so it never wraps). */
export const WORKBENCH_PRIMARY_CAP_IDS: WorkbenchCapabilityId[] = [
  'websearch',
  'upload',
  'knowledge',
  'mcp',
  'skills',
  'create_agent',
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
