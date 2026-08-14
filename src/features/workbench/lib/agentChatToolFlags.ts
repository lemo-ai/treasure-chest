import type { LlmChatRequest } from '@shared'
import type { AgentDef } from '@renderer/features/agents/lib/agentRegistry'
import { isDirectChatId } from '@renderer/features/agents/lib/agentRegistry'

/** Map agent definition → harness tool policy overrides for chat requests. */
export function agentChatToolFlags(
  agentDef: AgentDef,
  directMode: boolean,
): Pick<
  LlmChatRequest,
  'enableCodingTools' | 'enablePluginTools' | 'enableSpawnSubagent' | 'enableMcpTools' | 'enabledMcpServerIds'
> {
  if (directMode || isDirectChatId(String(agentDef.id))) {
    return {}
  }
  if (agentDef.builtin) {
    return { enableMcpTools: false }
  }
  return {
    enabledMcpServerIds: agentDef.enabledMcpServerIds,
    enableCodingTools: agentDef.enableCodingTools !== false,
    enablePluginTools: agentDef.enablePluginTools !== false,
    enableSpawnSubagent: agentDef.enableSpawnSubagent !== false,
  }
}
