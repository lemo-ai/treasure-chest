import { isDirectChatAgentId } from '@shared'

/** Resolved tool surface for one agent + optional request overrides. */
export interface AgentToolPolicy {
  enableCodingTools: boolean
  enableHarnessTools: boolean
  enablePluginTools: boolean
  enableSpawnSubagent: boolean
  enableMcpTools: boolean
}

export interface AgentToolPolicyOverrides {
  enableCodingTools?: boolean
  enableHarnessTools?: boolean
  enablePluginTools?: boolean
  enableSpawnSubagent?: boolean
  enableMcpTools?: boolean
}

export function resolveAgentToolPolicy(
  agentId: string,
  overrides: AgentToolPolicyOverrides = {},
): AgentToolPolicy {
  const id = (agentId || 'direct').trim()
  if (isDirectChatAgentId(id)) {
    return {
      enableCodingTools: false,
      enableHarnessTools: false,
      enablePluginTools: false,
      enableSpawnSubagent: false,
      enableMcpTools: false,
    }
  }

  const isDomainBuiltin = id === 'fortune' || id === 'stocks'
  const isCustom = id.startsWith('custom_')

  const policy: AgentToolPolicy = {
    enableCodingTools: isCustom,
    enableHarnessTools: isCustom,
    enablePluginTools: isCustom,
    enableSpawnSubagent: isCustom,
    enableMcpTools: isCustom,
  }

  if (isDomainBuiltin) {
    policy.enableCodingTools = false
    policy.enableHarnessTools = false
    policy.enablePluginTools = false
    policy.enableSpawnSubagent = false
    policy.enableMcpTools = false
  }

  if (overrides.enableCodingTools !== undefined) policy.enableCodingTools = overrides.enableCodingTools
  if (overrides.enableHarnessTools !== undefined) policy.enableHarnessTools = overrides.enableHarnessTools
  if (overrides.enablePluginTools !== undefined) policy.enablePluginTools = overrides.enablePluginTools
  if (overrides.enableSpawnSubagent !== undefined) policy.enableSpawnSubagent = overrides.enableSpawnSubagent
  if (overrides.enableMcpTools !== undefined) policy.enableMcpTools = overrides.enableMcpTools

  return policy
}
