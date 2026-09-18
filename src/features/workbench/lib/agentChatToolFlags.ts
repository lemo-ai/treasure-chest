import type { LlmChatRequest } from '@shared'
import type { AgentDef } from '@renderer/features/agents/lib/agentRegistry'
import { isDirectChatId } from '@renderer/features/agents/lib/agentRegistry'

/** Map agent definition → harness tool policy overrides for chat requests. */
export function agentChatToolFlags(
  agentDef: AgentDef,
  directMode: boolean,
): Pick<
  LlmChatRequest,
  | 'enableCodingTools'
  | 'enableHarnessTools'
  | 'enablePluginTools'
  | 'enableSpawnSubagent'
  | 'enableMcpTools'
  | 'enabledMcpServerIds'
> {
  if (directMode || isDirectChatId(String(agentDef.id))) {
    return {
      enableCodingTools: true,
      enableHarnessTools: true,
      enablePluginTools: true,
      enableSpawnSubagent: true,
      enableMcpTools: true,
    }
  }
  if (agentDef.builtin) {
    return { enableMcpTools: false, enableCodingTools: false }
  }
  return {
    enabledMcpServerIds: agentDef.enabledMcpServerIds,
    enableCodingTools: agentDef.enableCodingTools !== false,
    enableHarnessTools: true,
    enablePluginTools: agentDef.enablePluginTools !== false,
    enableSpawnSubagent: agentDef.enableSpawnSubagent !== false,
    enableMcpTools: true,
  }
}
