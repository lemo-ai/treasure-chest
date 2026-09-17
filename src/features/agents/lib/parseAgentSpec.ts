import type { AgentTone, CreateAgentInput } from '../lib/agentRegistry'

export interface ParsedAgentSpec {
  name: string
  description: string
  systemPrompt: string
  tone: AgentTone
  quickPrompts?: string[]
}

const TONES = new Set<AgentTone>(['brand', 'accent', 'highlight'])

const BLOCK_RE = /```agent-spec\s*([\s\S]*?)```/i

/** Extract the last ```agent-spec JSON block from assistant text. */
export function parseAgentSpec(content: string): ParsedAgentSpec | null {
  const matches = [...content.matchAll(new RegExp(BLOCK_RE.source, 'gi'))]
  const raw = matches.at(-1)?.[1]?.trim()
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as Record<string, unknown>
    const name = String(data.name ?? '').trim()
    const description = String(data.description ?? '').trim()
    const systemPrompt = String(data.systemPrompt ?? data.system_prompt ?? '').trim()
    if (!name || !systemPrompt) return null
    const toneRaw = String(data.tone ?? 'brand').trim() as AgentTone
    const tone = TONES.has(toneRaw) ? toneRaw : 'brand'
    const quickRaw = data.quickPrompts ?? data.quick_prompts
    const quickPrompts = Array.isArray(quickRaw)
      ? quickRaw
          .map((p) => String(p ?? '').trim())
          .filter(Boolean)
          .map((p) => p.slice(0, 40))
          .slice(0, 6)
      : undefined
    return {
      name: name.slice(0, 40),
      description: description.slice(0, 80),
      systemPrompt,
      tone,
      quickPrompts: quickPrompts?.length ? quickPrompts : undefined,
    }
  } catch {
    return null
  }
}

export function toCreateAgentInput(spec: ParsedAgentSpec): CreateAgentInput {
  return {
    name: spec.name,
    description: spec.description,
    systemPrompt: spec.systemPrompt,
    tone: spec.tone,
    quickPrompts: spec.quickPrompts,
  }
}
