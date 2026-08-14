import type { LlmChatMessage, LlmToolCall, LlmToolSpec } from '@shared'

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

export function toAnthropicTools(specs: LlmToolSpec[]): Array<{
  name: string
  description: string
  input_schema: Record<string, unknown>
}> {
  return specs.map((s) => ({
    name: s.function.name,
    description: s.function.description,
    input_schema: s.function.parameters,
  }))
}

export function toAnthropicMessages(messages: LlmChatMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = []
  let pendingToolResults: AnthropicContentBlock[] = []

  const flushToolResults = (): void => {
    if (!pendingToolResults.length) return
    out.push({ role: 'user', content: pendingToolResults })
    pendingToolResults = []
  }

  for (const m of messages) {
    if (m.role === 'system') continue

    if (m.role === 'tool') {
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: m.tool_call_id || '',
        content: m.content ?? '',
        ...(m.content?.includes('"error"') ? { is_error: true } : {}),
      })
      continue
    }

    flushToolResults()

    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content ?? '' })
      continue
    }

    if (m.role === 'assistant') {
      const blocks: AnthropicContentBlock[] = []
      if (m.content?.trim()) blocks.push({ type: 'text', text: m.content })
      for (const tc of m.tool_calls ?? []) {
        let input: Record<string, unknown> = {}
        try {
          input = tc.function.arguments?.trim()
            ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
            : {}
        } catch {
          input = {}
        }
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input,
        })
      }
      if (blocks.length === 0) {
        out.push({ role: 'assistant', content: m.content ?? '' })
      } else {
        out.push({ role: 'assistant', content: blocks })
      }
    }
  }

  flushToolResults()
  return out
}

export function parseAnthropicResponse(content: Array<{ type?: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>): {
  text: string
  toolCalls: LlmToolCall[]
} {
  const toolCalls: LlmToolCall[] = []
  const textParts: string[] = []

  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      textParts.push(block.text)
    } else if (block.type === 'tool_use' && block.id && block.name) {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        },
      })
    }
  }

  return { text: textParts.join('\n').trim(), toolCalls }
}

/** Merge consecutive same-role messages (Anthropic requires strict alternation). */
export function normalizeAnthropicMessages(messages: AnthropicMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = []
  for (const msg of messages) {
    const last = out.at(-1)
    if (last && last.role === msg.role) {
      const mergeBlocks = (a: string | AnthropicContentBlock[], b: string | AnthropicContentBlock[]): string | AnthropicContentBlock[] => {
        const toBlocks = (v: string | AnthropicContentBlock[]): AnthropicContentBlock[] =>
          typeof v === 'string' ? [{ type: 'text', text: v }] : v
        return [...toBlocks(a), ...toBlocks(b)]
      }
      last.content = mergeBlocks(last.content, msg.content)
    } else {
      out.push({ ...msg })
    }
  }
  return out
}
