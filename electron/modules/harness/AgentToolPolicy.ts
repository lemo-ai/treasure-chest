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

  let policy: AgentToolPolicy
  if (isDirectChatAgentId(id)) {
    // Workbench direct chat = Cursor-style coding agent by default.
    policy = {
      enableCodingTools: true,
      enableHarnessTools: true,
      enablePluginTools: true,
      enableSpawnSubagent: true,
      enableMcpTools: true,
    }
  } else if (id === 'fortune' || id === 'stocks' || id === 'lottery') {
    policy = {
      enableCodingTools: false,
      enableHarnessTools: false,
      enablePluginTools: false,
      enableSpawnSubagent: false,
      enableMcpTools: false,
    }
  } else {
    const isCustom = id.startsWith('custom_')
    policy = {
      enableCodingTools: isCustom,
      enableHarnessTools: isCustom,
      enablePluginTools: isCustom,
      enableSpawnSubagent: isCustom,
      enableMcpTools: isCustom,
    }
  }

  if (overrides.enableCodingTools !== undefined) policy.enableCodingTools = overrides.enableCodingTools
  if (overrides.enableHarnessTools !== undefined) policy.enableHarnessTools = overrides.enableHarnessTools
  if (overrides.enablePluginTools !== undefined) policy.enablePluginTools = overrides.enablePluginTools
  if (overrides.enableSpawnSubagent !== undefined) policy.enableSpawnSubagent = overrides.enableSpawnSubagent
  if (overrides.enableMcpTools !== undefined) policy.enableMcpTools = overrides.enableMcpTools

  return policy
}
