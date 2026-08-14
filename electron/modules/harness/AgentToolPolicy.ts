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
  const isDomainBuiltin = id === 'fortune' || id === 'stocks'
  const isOpenAgent = id === 'direct' || id === 'none' || id === '' || id.startsWith('custom_')

  const policy: AgentToolPolicy = {
    enableCodingTools: isOpenAgent,
    enableHarnessTools: true,
    enablePluginTools: isOpenAgent,
    enableSpawnSubagent: isOpenAgent,
    enableMcpTools: isOpenAgent,
  }

  if (isDomainBuiltin) {
    policy.enableCodingTools = false
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
