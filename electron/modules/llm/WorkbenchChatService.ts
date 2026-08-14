import type {
  FortuneSettings,
  LlmChatRequest,
  LlmChatResponse,
  LlmToolStep,
  ToolApprovalRequest,
} from '@shared'
import {
  runHarnessChat,
  runHarnessChatStream,
} from '../harness/HarnessService'
import { cancelTurnRun } from '../harness/TurnRunRegistry'

export function cancelWorkbenchStream(streamId: string): boolean {
  return cancelTurnRun(streamId)
}

type ApprovalHandler = (request: ToolApprovalRequest) => Promise<boolean>

const pendingApprovals = new Map<string, (approved: boolean) => void>()

function approvalKey(streamId: string, toolCallId: string): string {
  return `${streamId}::${toolCallId}`
}

export function resolvePendingToolApproval(
  streamId: string,
  toolCallId: string,
  approved: boolean,
): boolean {
  const key = approvalKey(streamId, toolCallId)
  const resolve = pendingApprovals.get(key)
  if (!resolve) return false
  pendingApprovals.delete(key)
  resolve(approved)
  return true
}

function waitForToolApproval(streamId: string, toolCallId: string, timeoutMs = 180_000): Promise<boolean> {
  return new Promise((resolve) => {
    const key = approvalKey(streamId, toolCallId)
    const timer = setTimeout(() => {
      pendingApprovals.delete(key)
      resolve(false)
    }, timeoutMs)
    pendingApprovals.set(key, (approved) => {
      clearTimeout(timer)
      resolve(approved)
    })
  })
}

export function waitForToolApprovalFromIpc(
  streamId: string,
  toolCallId: string,
): Promise<boolean> {
  return waitForToolApproval(streamId, toolCallId)
}

export async function runWorkbenchChat(
  req: LlmChatRequest,
  settings: FortuneSettings,
): Promise<LlmChatResponse> {
  return runHarnessChat(req, settings)
}

export async function runWorkbenchChatStream(
  req: LlmChatRequest,
  settings: FortuneSettings,
  onDelta: (text: string) => void,
  onStatus?: (text: string) => void,
  onCitations?: (citations: import('@shared').KnowledgeCitation[]) => void,
  onToolStep?: (step: LlmToolStep) => void,
  onApproval?: ApprovalHandler,
  onSessionEvent?: (event: import('@shared').SessionEvent) => void,
): Promise<LlmChatResponse> {
  return runHarnessChatStream(
    req,
    settings,
    onDelta,
    onStatus,
    onCitations,
    onToolStep,
    onApproval,
    onSessionEvent,
  )
}
