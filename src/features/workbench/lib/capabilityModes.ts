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
