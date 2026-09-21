import type { Project, ProjectsSnapshot, UpsertProjectInput } from '@shared'

const CHANGED_EVENT = 'qiankun-projects-changed'

let cache: ProjectsSnapshot | null = null
let hydratePromise: Promise<void> | null = null

function emitChanged(): void {
  window.dispatchEvent(new Event(CHANGED_EVENT))
}

export function onProjectsChanged(cb: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, cb)
  return () => window.removeEventListener(CHANGED_EVENT, cb)
}

export async function hydrateProjects(): Promise<ProjectsSnapshot> {
  if (!hydratePromise) {
    hydratePromise = window.treasureChest
      .projectsGetSnapshot()
      .then((snap) => {
        cache = snap
      })
      .finally(() => {
        hydratePromise = null
      })
  }
  await hydratePromise
  return cache ?? { projects: [], activeProjectId: null }
}

export function getProjectsSnapshotSync(): ProjectsSnapshot {
  return cache ?? { projects: [], activeProjectId: null }
}

export function listProjectsSync(includeArchived = false): Project[] {
  const list = getProjectsSnapshotSync().projects
  return includeArchived ? list : list.filter((p) => !p.archived)
}

export function getActiveProjectIdSync(): string | null {
  return getProjectsSnapshotSync().activeProjectId
}

export function getActiveProjectSync(): Project | null {
  const id = getActiveProjectIdSync()
  if (!id) return null
  return getProjectsSnapshotSync().projects.find((p) => p.id === id) ?? null
}

export async function refreshProjects(): Promise<ProjectsSnapshot> {
  cache = await window.treasureChest.projectsGetSnapshot()
  emitChanged()
  return cache
}

export async function upsertProject(input: UpsertProjectInput): Promise<Project> {
  const project = await window.treasureChest.projectsUpsert(input)
  await refreshProjects()
  return project
}

export async function setActiveProject(id: string | null): Promise<string | null> {
  const next = await window.treasureChest.projectsSetActive(id)
  await refreshProjects()
  // Apply workDir to coding sandbox when activating
  const project = next ? (await window.treasureChest.projectsGet(next)) : null
  if (project?.workDir?.trim()) {
    await window.treasureChest.harnessSetSandboxRoot(project.workDir.trim())
  }
  return next
}

export async function archiveProject(id: string, archived = true): Promise<boolean> {
  const ok = await window.treasureChest.projectsArchive(id, archived)
  await refreshProjects()
  return ok
}

export async function removeProject(id: string): Promise<boolean> {
  const ok = await window.treasureChest.projectsRemove(id)
  await refreshProjects()
  return ok
}

export async function pickProjectWorkDir(): Promise<string | null> {
  return window.treasureChest.projectsPickWorkDir()
}
