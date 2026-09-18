import type { ToolSensitivityDecision } from '@shared'

const BUILTIN_AUTO = new Set([
  'get_weather',
  'get_daily_fortune',
  'get_stock_quote',
  'get_latest_stocks_report',
  'search_knowledge',
  'search_web',
  'search_stock',
  'fetch_url',
  'generate_image',
  'generate_video',
  'generate_music',
  'read_file',
  'list_dir',
  'search_files',
  'grep_content',
  'git_status',
  'git_diff',
])

const BLOCK_RE =
  /\b(payment|purchase|checkout|transfer_money|send_money|wire_transfer|buy_crypto)\b/i

const CONFIRM_NAME_RE =
  /\b(delete|remove|unlink|rm\b|destroy|drop_|truncate|write|overwrite|edit_file|patch_file|create_file|mkdir|shell|exec|execute|run_terminal|run_command|spawn|bash|powershell|cmd\.exe|git_push|npm_publish|pip_install|sudo)\b/i

const CONFIRM_ARGS_RE =
  /\b(rm\s+-rf|drop\s+table|delete\s+from|force\s*push|format\s+disk)\b/i

function bareToolName(name: string): string {
  if (name.startsWith('mcp__')) {
    const rest = name.slice('mcp__'.length)
    const idx = rest.indexOf('__')
    return idx >= 0 ? rest.slice(idx + 2) : rest
  }
  return name
}

/** Classify whether a tool call should run, ask the user, or be blocked. */
export function classifyToolSensitivity(
  name: string,
  argsJson: string,
): ToolSensitivityDecision {
  const raw = (name || '').trim()
  const bare = bareToolName(raw)
  const hay = `${raw} ${bare} ${argsJson || ''}`

  if (BUILTIN_AUTO.has(raw)) {
    return { tier: 'auto', reason: 'builtin_safe' }
  }

  if (BLOCK_RE.test(hay)) {
    return { tier: 'block', reason: 'payment_or_transfer' }
  }

  if (CONFIRM_NAME_RE.test(bare) || CONFIRM_NAME_RE.test(raw) || CONFIRM_ARGS_RE.test(argsJson || '')) {
    return { tier: 'confirm', reason: 'destructive_or_write' }
  }

  // Coding / harness write paths
  if (/\b(write_file|str_replace_file|apply_patch|run_shell|run_shell_background|kill_job|spawn_subagent|git_commit)\b/i.test(name)) {
    return { tier: 'confirm', reason: 'coding_side_effect' }
  }

  // Unknown MCP tools that look write-ish via description keywords in the name
  if (raw.startsWith('mcp__') && /\b(file|fs|fs_|filesystem|terminal|browser_click)\b/i.test(bare)) {
    return { tier: 'confirm', reason: 'mcp_side_effect' }
  }

  return { tier: 'auto', reason: 'default_allow' }
}
