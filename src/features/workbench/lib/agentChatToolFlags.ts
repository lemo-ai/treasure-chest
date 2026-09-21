import type { LlmChatRequest } from '@shared'
import { BUILTIN_LOTTERY_DATA_SOURCE_ID } from '@shared'
import type { AgentDef } from '@renderer/features/agents/lib/agentRegistry'
import { isConfigPresetAgent, isDirectChatId } from '@renderer/features/agents/lib/agentRegistry'

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
  | 'enableDataSourceTools'
  | 'enabledDataSourceIds'
> {
  let dsIds = (agentDef.dataSourceIds ?? []).map((id) => id.trim()).filter(Boolean)
  // Lottery preset always keeps the built-in SQLite binding (read+write via query_data_source).
  if (isConfigPresetAgent(agentDef) && !dsIds.includes(BUILTIN_LOTTERY_DATA_SOURCE_ID)) {
    dsIds = [...dsIds, BUILTIN_LOTTERY_DATA_SOURCE_ID]
  }
  const dataSourceTools = dsIds.length > 0

  if (directMode || isDirectChatId(String(agentDef.id))) {
    return {
      enableCodingTools: true,
      enableHarnessTools: true,
      enablePluginTools: true,
      enableSpawnSubagent: true,
      enableMcpTools: true,
      // Direct chat: all enabled Settings data sources
      enableDataSourceTools: true,
      enabledDataSourceIds: undefined,
    }
  }
  // Locked builtins (fortune / stocks)
  if (agentDef.builtin && !isConfigPresetAgent(agentDef)) {
    return {
      enableMcpTools: false,
      enableCodingTools: false,
      enableDataSourceTools: false,
    }
  }

  const preset = isConfigPresetAgent(agentDef)
  return {
    enabledMcpServerIds: agentDef.enabledMcpServerIds,
    enableCodingTools: preset
      ? agentDef.enableCodingTools === true
      : agentDef.enableCodingTools !== false,
    enableHarnessTools: true,
    enablePluginTools: preset
      ? agentDef.enablePluginTools === true
      : agentDef.enablePluginTools !== false,
    enableSpawnSubagent: preset
      ? agentDef.enableSpawnSubagent === true
      : agentDef.enableSpawnSubagent !== false,
    enableMcpTools: true,
    enableDataSourceTools: dataSourceTools,
    enabledDataSourceIds: dataSourceTools ? dsIds : [],
  }
}
