import type { WorkbenchCapabilityId } from './capabilities'

/** Prompt overlays for workbench capability modes (injected into system prompt). */
export const CAPABILITY_SYSTEM_PROMPTS: Partial<
  Record<WorkbenchCapabilityId, { zh: string; en: string }>
> = {
  write: {
    zh: '当前模式：帮我写作。根据用户意图起草、改写或润色文案；结构清晰，可直接使用。先确认体裁与语气，再给成品。',
    en: 'Mode: writing assistant. Draft, rewrite, or polish text. Be clear and usable. Confirm genre/tone briefly, then deliver.',
  },
  translate: {
    zh: '当前模式：翻译。在中英（及其他用户指定语言）之间准确翻译；保留专有名词；必要时给简短注释。默认输出译文，不啰嗦解释。',
    en: 'Mode: translation. Translate accurately between languages the user specifies. Keep proper nouns; brief notes only when needed.',
  },
  research: {
    zh: '当前模式：深入研究。分步骤分析问题：澄清目标 → 列要点 → 论证 → 结论与待核实项。有知识库工具时优先检索再总结，并标明来源标题。',
    en: 'Mode: deep research. Structure: clarify → outline → argue → conclude + open questions. Prefer knowledge tools when available and cite titles.',
  },
  skills: {
    zh: '当前模式：技能助手。按用户选择的技能模板完成任务，严格遵循模板要求的输出格式。',
    en: 'Mode: skills. Follow the selected skill template and its output format strictly.',
  },
  create_agent: {
    zh: `当前模式：帮用户创建智能体（面向小白）。
流程：
1) 用一两句澄清：这个助手要帮用户做什么、对谁说话、有什么禁忌。
2) 信息够用后，给出拟创建方案的白话说明（名称、简介、会怎么回答）。
3) 然后必须输出一个且仅一个 Markdown 代码块，语言标记为 agent-spec，内容是 JSON：
\`\`\`agent-spec
{"name":"不超过40字","description":"一句话简介","systemPrompt":"完整人设与回答规范","tone":"brand","quickPrompts":["快捷问题1","快捷问题2","快捷问题3"]}
\`\`\`
tone 只能是 brand / accent / highlight 之一。
quickPrompts 可选，1～6 条短句，用于空会话欢迎区点击提问。
不要省略 agent-spec 代码块；用户点界面上的「创建」按钮后才会真正写入工作台。`,
    en: `Mode: help the user create an agent (beginner-friendly).
Flow:
1) Briefly clarify what the agent should do, audience, and constraints.
2) When enough info, summarize the proposed agent in plain language.
3) Then output exactly one Markdown fenced block with language tag agent-spec and JSON:
\`\`\`agent-spec
{"name":"max 40 chars","description":"one-line intro","systemPrompt":"full persona","tone":"brand","quickPrompts":["chip 1","chip 2","chip 3"]}
\`\`\`
tone must be brand, accent, or highlight.
quickPrompts is optional (1–6 short starter questions for the empty chat).
Do not omit the agent-spec block; the UI Create button persists it.`,
  },
}

export interface WorkbenchSkill {
  id: string
  labelKey: string
  promptZh: string
  promptEn: string
}

export const WORKBENCH_SKILLS: WorkbenchSkill[] = [
  {
    id: 'meeting_notes',
    labelKey: 'workbench.skill.meetingNotes',
    promptZh: '将用户提供的会议材料整理为：议题、决议、待办（负责人/截止）、风险。用条目列表。',
    promptEn: 'Turn meeting material into: topics, decisions, action items (owner/due), risks. Use bullet lists.',
  },
  {
    id: 'email_polish',
    labelKey: 'workbench.skill.emailPolish',
    promptZh: '把用户草稿润色成专业邮件：主题建议 + 正文。语气礼貌简洁。',
    promptEn: 'Polish the draft into a professional email: subject + body. Polite and concise.',
  },
  {
    id: 'swot',
    labelKey: 'workbench.skill.swot',
    promptZh: '对用户主题做 SWOT 分析（优势/劣势/机会/威胁），每项 3–5 条，最后给一句行动建议。',
    promptEn: 'Run a SWOT analysis (3–5 bullets each) and end with one action recommendation.',
  },
  {
    id: 'code_explain',
    labelKey: 'workbench.skill.codeExplain',
    promptZh: '解释用户给出的代码：作用、关键逻辑、风险与改进建议。不要无关扩写。',
    promptEn: 'Explain the given code: purpose, key logic, risks, and improvements. No fluff.',
  },
]

export function capabilitySystemPrompt(
  id: WorkbenchCapabilityId | null | undefined,
  locale: string,
  skillExtra?: string,
): string | null {
  if (!id) return null
  const pack = CAPABILITY_SYSTEM_PROMPTS[id]
  if (!pack) return null
  const isEn = locale.toLowerCase().startsWith('en')
  const base = isEn ? pack.en : pack.zh
  return skillExtra ? `${base}\n${skillExtra}` : base
}
