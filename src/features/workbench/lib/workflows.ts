export type WorkflowId = 'daily_brief' | 'deep_research'

export interface WorkflowDefinition {
  id: WorkflowId
  /** i18n key for empty-state chip */
  chipKey: string
  /** i18n keys for macro steps (in order) */
  stepKeys: string[]
}

export const WORKFLOW_DEFS: Record<WorkflowId, WorkflowDefinition> = {
  daily_brief: {
    id: 'daily_brief',
    chipKey: 'workbench.chip.workflow.dailyBrief',
    stepKeys: [
      'workbench.workflow.step.stocks',
      'workbench.workflow.step.brief',
    ],
  },
  deep_research: {
    id: 'deep_research',
    chipKey: 'workbench.chip.workflow.deepResearch',
    stepKeys: [
      'workbench.workflow.step.plan',
      'workbench.workflow.step.investigate',
      'workbench.workflow.step.report',
    ],
  },
}

export type WorkflowStepStatus = 'pending' | 'running' | 'done' | 'error'

export interface WorkflowStepState {
  id: string
  label: string
  status: WorkflowStepStatus
}
