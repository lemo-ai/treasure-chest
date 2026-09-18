/** Production local model catalog: Ollama chat + media generation families. */

export type LocalLlmPlatform = 'darwin' | 'win32' | 'linux' | 'other'
export type LocalLlmRuntimeId = 'ollama' | 'lmstudio'

/** How a catalog family is installed / run. */
export type LocalModelInstallRuntime =
  | 'ollama'
  | 'draw-things'
  | 'comfyui'
  | 'whisper'
  | 'external'

export type LocalLlmModality =
  | 'text'
  | 'vision'
  | 'embedding'
  | 'code'
  | 'reasoning'
  | 'image'
  | 'speech'
  | 'video'
  | 'mesh3d'

export const LOCAL_LLM_MODALITIES: LocalLlmModality[] = [
  'text',
  'reasoning',
  'code',
  'vision',
  'image',
  'speech',
  'video',
  'mesh3d',
  'embedding',
]

export type LocalLlmTier = 'recommended' | 'optional' | 'tight' | 'avoid'
export type LocalLlmVendor =
  | 'alibaba'
  | 'meta'
  | 'google'
  | 'mistral'
  | 'deepseek'
  | 'microsoft'
  | 'ibm'
  | '01ai'
  | 'nomic'
  | 'snowflake'
  | 'openai-oss'
  | 'stability'
  | 'blackforest'
  | 'tencent'
  | 'community'
  | 'other'

export interface LocalLlmVersion {
  /** Ollama tag / variant id after `model:` — e.g. `7b`, or pack name for external */
  tag: string
  /** Short UI label */
  label: string
  sizeGb: number
  minRamGb: number
  /** Highlight as default pick for this family */
  default?: boolean
  quant?: string
}

export interface LocalLlmFamily {
  id: string
  /**
   * Ollama library model id without tag, e.g. `qwen2.5`.
   * For non-Ollama families use a stable slug (e.g. `flux-schnell`).
   */
  ollamaModel: string
  vendor: LocalLlmVendor
  modality: LocalLlmModality
  nameKey: string
  descKey: string
  versions: LocalLlmVersion[]
  /** Feature chips */
  caps?: Array<'tools' | 'thinking' | 'vision' | 'coding' | 'embed' | 't2i' | 'tts' | 'stt' | 't2v' | 'mesh'>
  popular?: boolean
  /** Default ollama when omitted */
  installRuntime?: LocalModelInstallRuntime
  /** Official / download / App Store page for non-Ollama install */
  installUrl?: string
  /** Platforms where this path works best */
  platforms?: LocalLlmPlatform[]
}

export function localLlmInstallRuntime(family: LocalLlmFamily): LocalModelInstallRuntime {
  return family.installRuntime ?? 'ollama'
}

export function localLlmIsOllamaFamily(family: LocalLlmFamily): boolean {
  return localLlmInstallRuntime(family) === 'ollama'
}

function v(
  tag: string,
  label: string,
  sizeGb: number,
  minRamGb: number,
  opts?: { default?: boolean; quant?: string },
): LocalLlmVersion {
  return { tag, label, sizeGb, minRamGb, default: opts?.default, quant: opts?.quant }
}

/** Curated open-source families covering major Ollama library models. */
export const LOCAL_LLM_FAMILIES: LocalLlmFamily[] = [
  // —— Chat / general ——
  {
    id: 'qwen3',
    ollamaModel: 'qwen3',
    vendor: 'alibaba',
    modality: 'text',
    nameKey: 'settings.localLlm.family.qwen3',
    descKey: 'settings.localLlm.family.qwen3Desc',
    popular: true,
    caps: ['tools', 'thinking'],
    versions: [
      v('0.6b', '0.6B', 0.5, 4),
      v('1.7b', '1.7B', 1.4, 6),
      v('4b', '4B', 2.5, 8, { default: true }),
      v('8b', '8B', 5.2, 12),
      v('14b', '14B', 9.3, 16),
      v('32b', '32B', 20, 48),
    ],
  },
  {
    id: 'qwen25',
    ollamaModel: 'qwen2.5',
    vendor: 'alibaba',
    modality: 'text',
    nameKey: 'settings.localLlm.family.qwen25',
    descKey: 'settings.localLlm.family.qwen25Desc',
    popular: true,
    caps: ['tools'],
    versions: [
      v('0.5b', '0.5B', 0.4, 4),
      v('1.5b', '1.5B', 1.0, 6),
      v('3b', '3B', 1.9, 8),
      v('7b', '7B', 4.7, 8, { default: true }),
      v('14b', '14B', 9.0, 16),
      v('32b', '32B', 20, 48),
      v('72b', '72B', 40, 80),
    ],
  },
  {
    id: 'llama33',
    ollamaModel: 'llama3.3',
    vendor: 'meta',
    modality: 'text',
    nameKey: 'settings.localLlm.family.llama33',
    descKey: 'settings.localLlm.family.llama33Desc',
    popular: true,
    caps: ['tools'],
    versions: [v('70b', '70B', 40, 64, { default: true })],
  },
  {
    id: 'llama32',
    ollamaModel: 'llama3.2',
    vendor: 'meta',
    modality: 'text',
    nameKey: 'settings.localLlm.family.llama32',
    descKey: 'settings.localLlm.family.llama32Desc',
    popular: true,
    caps: ['tools'],
    versions: [
      v('1b', '1B', 1.3, 4),
      v('3b', '3B', 2.0, 8, { default: true }),
    ],
  },
  {
    id: 'llama31',
    ollamaModel: 'llama3.1',
    vendor: 'meta',
    modality: 'text',
    nameKey: 'settings.localLlm.family.llama31',
    descKey: 'settings.localLlm.family.llama31Desc',
    popular: true,
    caps: ['tools'],
    versions: [
      v('8b', '8B', 4.9, 12, { default: true }),
      v('70b', '70B', 40, 64),
      v('405b', '405B', 230, 256),
    ],
  },
  {
    id: 'llama4',
    ollamaModel: 'llama4',
    vendor: 'meta',
    modality: 'text',
    nameKey: 'settings.localLlm.family.llama4',
    descKey: 'settings.localLlm.family.llama4Desc',
    caps: ['tools'],
    versions: [
      v('scout', 'Scout', 67, 80, { default: true }),
      v('maverick', 'Maverick', 125, 128),
    ],
  },
  {
    id: 'gemma3',
    ollamaModel: 'gemma3',
    vendor: 'google',
    modality: 'text',
    nameKey: 'settings.localLlm.family.gemma3',
    descKey: 'settings.localLlm.family.gemma3Desc',
    popular: true,
    caps: ['tools'],
    versions: [
      v('1b', '1B', 0.8, 4),
      v('4b', '4B', 3.3, 8, { default: true }),
      v('12b', '12B', 8.1, 16),
      v('27b', '27B', 17, 40),
    ],
  },
  {
    id: 'gemma2',
    ollamaModel: 'gemma2',
    vendor: 'google',
    modality: 'text',
    nameKey: 'settings.localLlm.family.gemma2',
    descKey: 'settings.localLlm.family.gemma2Desc',
    versions: [
      v('2b', '2B', 1.6, 6),
      v('9b', '9B', 5.4, 12, { default: true }),
      v('27b', '27B', 16, 40),
    ],
  },
  {
    id: 'mistral',
    ollamaModel: 'mistral',
    vendor: 'mistral',
    modality: 'text',
    nameKey: 'settings.localLlm.family.mistral',
    descKey: 'settings.localLlm.family.mistralDesc',
    popular: true,
    caps: ['tools'],
    versions: [v('7b', '7B', 4.1, 8, { default: true }), v('latest', 'latest', 4.1, 8)],
  },
  {
    id: 'mistral-nemo',
    ollamaModel: 'mistral-nemo',
    vendor: 'mistral',
    modality: 'text',
    nameKey: 'settings.localLlm.family.mistralNemo',
    descKey: 'settings.localLlm.family.mistralNemoDesc',
    caps: ['tools'],
    versions: [v('12b', '12B', 7.1, 16, { default: true })],
  },
  {
    id: 'mistral-small',
    ollamaModel: 'mistral-small',
    vendor: 'mistral',
    modality: 'text',
    nameKey: 'settings.localLlm.family.mistralSmall',
    descKey: 'settings.localLlm.family.mistralSmallDesc',
    caps: ['tools'],
    versions: [v('24b', '24B', 14, 32, { default: true })],
  },
  {
    id: 'mixtral',
    ollamaModel: 'mixtral',
    vendor: 'mistral',
    modality: 'text',
    nameKey: 'settings.localLlm.family.mixtral',
    descKey: 'settings.localLlm.family.mixtralDesc',
    caps: ['tools'],
    versions: [
      v('8x7b', '8×7B', 26, 48, { default: true }),
      v('8x22b', '8×22B', 80, 96),
    ],
  },
  {
    id: 'phi4',
    ollamaModel: 'phi4',
    vendor: 'microsoft',
    modality: 'text',
    nameKey: 'settings.localLlm.family.phi4',
    descKey: 'settings.localLlm.family.phi4Desc',
    popular: true,
    versions: [v('14b', '14B', 9.1, 16, { default: true })],
  },
  {
    id: 'phi4-mini',
    ollamaModel: 'phi4-mini',
    vendor: 'microsoft',
    modality: 'text',
    nameKey: 'settings.localLlm.family.phi4Mini',
    descKey: 'settings.localLlm.family.phi4MiniDesc',
    versions: [v('3.8b', '3.8B', 2.5, 8, { default: true })],
  },
  {
    id: 'phi3',
    ollamaModel: 'phi3',
    vendor: 'microsoft',
    modality: 'text',
    nameKey: 'settings.localLlm.family.phi3',
    descKey: 'settings.localLlm.family.phi3Desc',
    versions: [
      v('mini', 'Mini 3.8B', 2.3, 8, { default: true }),
      v('medium', 'Medium 14B', 7.9, 16),
    ],
  },
  {
    id: 'glm4',
    ollamaModel: 'glm4',
    vendor: 'other',
    modality: 'text',
    nameKey: 'settings.localLlm.family.glm4',
    descKey: 'settings.localLlm.family.glm4Desc',
    versions: [v('9b', '9B', 5.5, 12, { default: true })],
  },
  {
    id: 'yi',
    ollamaModel: 'yi',
    vendor: '01ai',
    modality: 'text',
    nameKey: 'settings.localLlm.family.yi',
    descKey: 'settings.localLlm.family.yiDesc',
    versions: [
      v('6b', '6B', 3.5, 8, { default: true }),
      v('9b', '9B', 5.0, 12),
      v('34b', '34B', 19, 48),
    ],
  },
  {
    id: 'command-r',
    ollamaModel: 'command-r',
    vendor: 'community',
    modality: 'text',
    nameKey: 'settings.localLlm.family.commandR',
    descKey: 'settings.localLlm.family.commandRDesc',
    caps: ['tools'],
    versions: [v('35b', '35B', 20, 48, { default: true })],
  },
  {
    id: 'granite4',
    ollamaModel: 'granite4',
    vendor: 'ibm',
    modality: 'text',
    nameKey: 'settings.localLlm.family.granite4',
    descKey: 'settings.localLlm.family.granite4Desc',
    versions: [v('latest', 'latest', 5, 12, { default: true })],
  },
  {
    id: 'gpt-oss',
    ollamaModel: 'gpt-oss',
    vendor: 'openai-oss',
    modality: 'text',
    nameKey: 'settings.localLlm.family.gptOss',
    descKey: 'settings.localLlm.family.gptOssDesc',
    popular: true,
    versions: [
      v('20b', '20B', 12, 24, { default: true }),
      v('120b', '120B', 65, 96),
    ],
  },
  {
    id: 'smollm2',
    ollamaModel: 'smollm2',
    vendor: 'community',
    modality: 'text',
    nameKey: 'settings.localLlm.family.smollm2',
    descKey: 'settings.localLlm.family.smollm2Desc',
    versions: [
      v('135m', '135M', 0.3, 4),
      v('360m', '360M', 0.7, 4),
      v('1.7b', '1.7B', 1.8, 6, { default: true }),
    ],
  },
  {
    id: 'tinyllama',
    ollamaModel: 'tinyllama',
    vendor: 'community',
    modality: 'text',
    nameKey: 'settings.localLlm.family.tinyllama',
    descKey: 'settings.localLlm.family.tinyllamaDesc',
    versions: [v('1.1b', '1.1B', 0.6, 4, { default: true })],
  },

  // —— Reasoning ——
  {
    id: 'deepseek-r1',
    ollamaModel: 'deepseek-r1',
    vendor: 'deepseek',
    modality: 'reasoning',
    nameKey: 'settings.localLlm.family.deepseekR1',
    descKey: 'settings.localLlm.family.deepseekR1Desc',
    popular: true,
    caps: ['thinking', 'tools'],
    versions: [
      v('1.5b', '1.5B', 1.1, 6),
      v('7b', '7B', 4.7, 10),
      v('8b', '8B', 5.2, 12, { default: true }),
      v('14b', '14B', 9.0, 16),
      v('32b', '32B', 20, 48),
      v('70b', '70B', 40, 80),
    ],
  },
  {
    id: 'qwq',
    ollamaModel: 'qwq',
    vendor: 'alibaba',
    modality: 'reasoning',
    nameKey: 'settings.localLlm.family.qwq',
    descKey: 'settings.localLlm.family.qwqDesc',
    caps: ['thinking'],
    versions: [v('32b', '32B', 20, 48, { default: true })],
  },
  {
    id: 'phi4-reasoning',
    ollamaModel: 'phi4-reasoning',
    vendor: 'microsoft',
    modality: 'reasoning',
    nameKey: 'settings.localLlm.family.phi4Reasoning',
    descKey: 'settings.localLlm.family.phi4ReasoningDesc',
    caps: ['thinking'],
    versions: [v('14b', '14B', 9.1, 16, { default: true })],
  },
  {
    id: 'magistral',
    ollamaModel: 'magistral',
    vendor: 'mistral',
    modality: 'reasoning',
    nameKey: 'settings.localLlm.family.magistral',
    descKey: 'settings.localLlm.family.magistralDesc',
    caps: ['thinking'],
    versions: [v('latest', 'latest', 14, 32, { default: true })],
  },

  // —— Code ——
  {
    id: 'qwen25-coder',
    ollamaModel: 'qwen2.5-coder',
    vendor: 'alibaba',
    modality: 'code',
    nameKey: 'settings.localLlm.family.qwen25Coder',
    descKey: 'settings.localLlm.family.qwen25CoderDesc',
    popular: true,
    caps: ['coding', 'tools'],
    versions: [
      v('0.5b', '0.5B', 0.4, 4),
      v('1.5b', '1.5B', 1.0, 6),
      v('3b', '3B', 1.9, 8),
      v('7b', '7B', 4.7, 8, { default: true }),
      v('14b', '14B', 9.0, 16),
      v('32b', '32B', 20, 48),
    ],
  },
  {
    id: 'qwen3-coder',
    ollamaModel: 'qwen3-coder',
    vendor: 'alibaba',
    modality: 'code',
    nameKey: 'settings.localLlm.family.qwen3Coder',
    descKey: 'settings.localLlm.family.qwen3CoderDesc',
    caps: ['coding', 'tools'],
    versions: [
      v('30b', '30B', 18, 40, { default: true }),
      v('480b', '480B', 250, 256),
    ],
  },
  {
    id: 'deepseek-coder-v2',
    ollamaModel: 'deepseek-coder-v2',
    vendor: 'deepseek',
    modality: 'code',
    nameKey: 'settings.localLlm.family.deepseekCoderV2',
    descKey: 'settings.localLlm.family.deepseekCoderV2Desc',
    caps: ['coding'],
    versions: [
      v('16b', '16B', 8.9, 20, { default: true }),
      v('236b', '236B', 130, 160),
    ],
  },
  {
    id: 'codestral',
    ollamaModel: 'codestral',
    vendor: 'mistral',
    modality: 'code',
    nameKey: 'settings.localLlm.family.codestral',
    descKey: 'settings.localLlm.family.codestralDesc',
    caps: ['coding'],
    versions: [v('22b', '22B', 12, 28, { default: true })],
  },
  {
    id: 'codellama',
    ollamaModel: 'codellama',
    vendor: 'meta',
    modality: 'code',
    nameKey: 'settings.localLlm.family.codellama',
    descKey: 'settings.localLlm.family.codellamaDesc',
    caps: ['coding'],
    versions: [
      v('7b', '7B', 3.8, 8, { default: true }),
      v('13b', '13B', 7.4, 16),
      v('34b', '34B', 19, 48),
    ],
  },
  {
    id: 'starcoder2',
    ollamaModel: 'starcoder2',
    vendor: 'community',
    modality: 'code',
    nameKey: 'settings.localLlm.family.starcoder2',
    descKey: 'settings.localLlm.family.starcoder2Desc',
    caps: ['coding'],
    versions: [
      v('3b', '3B', 1.7, 8, { default: true }),
      v('7b', '7B', 4.0, 12),
      v('15b', '15B', 9.0, 24),
    ],
  },
  {
    id: 'codegemma',
    ollamaModel: 'codegemma',
    vendor: 'google',
    modality: 'code',
    nameKey: 'settings.localLlm.family.codegemma',
    descKey: 'settings.localLlm.family.codegemmaDesc',
    caps: ['coding'],
    versions: [
      v('2b', '2B', 1.6, 6),
      v('7b', '7B', 5.0, 12, { default: true }),
    ],
  },
  {
    id: 'sqlcoder',
    ollamaModel: 'sqlcoder',
    vendor: 'community',
    modality: 'code',
    nameKey: 'settings.localLlm.family.sqlcoder',
    descKey: 'settings.localLlm.family.sqlcoderDesc',
    caps: ['coding'],
    versions: [v('7b', '7B', 4.1, 10, { default: true })],
  },

  // —— Vision ——
  {
    id: 'qwen25vl',
    ollamaModel: 'qwen2.5vl',
    vendor: 'alibaba',
    modality: 'vision',
    nameKey: 'settings.localLlm.family.qwen25vl',
    descKey: 'settings.localLlm.family.qwen25vlDesc',
    popular: true,
    caps: ['vision', 'tools'],
    versions: [
      v('3b', '3B', 3.2, 10),
      v('7b', '7B', 6.0, 14, { default: true }),
      v('32b', '32B', 21, 48),
      v('72b', '72B', 48, 96),
    ],
  },
  {
    id: 'qwen3-vl',
    ollamaModel: 'qwen3-vl',
    vendor: 'alibaba',
    modality: 'vision',
    nameKey: 'settings.localLlm.family.qwen3Vl',
    descKey: 'settings.localLlm.family.qwen3VlDesc',
    caps: ['vision', 'tools'],
    versions: [
      v('2b', '2B', 1.8, 8),
      v('8b', '8B', 6.1, 14, { default: true }),
      v('32b', '32B', 21, 48),
    ],
  },
  {
    id: 'llama32-vision',
    ollamaModel: 'llama3.2-vision',
    vendor: 'meta',
    modality: 'vision',
    nameKey: 'settings.localLlm.family.llama32Vision',
    descKey: 'settings.localLlm.family.llama32VisionDesc',
    popular: true,
    caps: ['vision'],
    versions: [
      v('11b', '11B', 7.9, 16, { default: true }),
      v('90b', '90B', 55, 96),
    ],
  },
  {
    id: 'llava',
    ollamaModel: 'llava',
    vendor: 'community',
    modality: 'vision',
    nameKey: 'settings.localLlm.family.llava',
    descKey: 'settings.localLlm.family.llavaDesc',
    caps: ['vision'],
    versions: [
      v('7b', '7B', 4.7, 12, { default: true }),
      v('13b', '13B', 8.0, 20),
      v('34b', '34B', 20, 48),
    ],
  },
  {
    id: 'llava-llama3',
    ollamaModel: 'llava-llama3',
    vendor: 'community',
    modality: 'vision',
    nameKey: 'settings.localLlm.family.llavaLlama3',
    descKey: 'settings.localLlm.family.llavaLlama3Desc',
    caps: ['vision'],
    versions: [v('8b', '8B', 5.5, 14, { default: true })],
  },
  {
    id: 'minicpm-v',
    ollamaModel: 'minicpm-v',
    vendor: 'community',
    modality: 'vision',
    nameKey: 'settings.localLlm.family.minicpmV',
    descKey: 'settings.localLlm.family.minicpmVDesc',
    caps: ['vision'],
    versions: [v('8b', '8B', 5.5, 14, { default: true })],
  },
  {
    id: 'moondream',
    ollamaModel: 'moondream',
    vendor: 'community',
    modality: 'vision',
    nameKey: 'settings.localLlm.family.moondream',
    descKey: 'settings.localLlm.family.moondreamDesc',
    caps: ['vision'],
    versions: [v('1.8b', '1.8B', 1.7, 6, { default: true })],
  },

  // —— Embedding ——
  {
    id: 'nomic-embed-text',
    ollamaModel: 'nomic-embed-text',
    vendor: 'nomic',
    modality: 'embedding',
    nameKey: 'settings.localLlm.family.nomicEmbed',
    descKey: 'settings.localLlm.family.nomicEmbedDesc',
    popular: true,
    caps: ['embed'],
    versions: [v('latest', 'latest', 0.27, 4, { default: true })],
  },
  {
    id: 'mxbai-embed-large',
    ollamaModel: 'mxbai-embed-large',
    vendor: 'community',
    modality: 'embedding',
    nameKey: 'settings.localLlm.family.mxbaiEmbed',
    descKey: 'settings.localLlm.family.mxbaiEmbedDesc',
    caps: ['embed'],
    versions: [v('latest', 'latest', 0.67, 4, { default: true })],
  },
  {
    id: 'bge-m3',
    ollamaModel: 'bge-m3',
    vendor: 'community',
    modality: 'embedding',
    nameKey: 'settings.localLlm.family.bgeM3',
    descKey: 'settings.localLlm.family.bgeM3Desc',
    caps: ['embed'],
    versions: [v('latest', 'latest', 1.2, 6, { default: true })],
  },
  {
    id: 'snowflake-arctic-embed',
    ollamaModel: 'snowflake-arctic-embed',
    vendor: 'snowflake',
    modality: 'embedding',
    nameKey: 'settings.localLlm.family.snowflakeEmbed',
    descKey: 'settings.localLlm.family.snowflakeEmbedDesc',
    caps: ['embed'],
    versions: [
      v('335m', '335M', 0.67, 4, { default: true }),
      v('l', 'Large', 1.1, 6),
    ],
  },
  {
    id: 'all-minilm',
    ollamaModel: 'all-minilm',
    vendor: 'community',
    modality: 'embedding',
    nameKey: 'settings.localLlm.family.allMinilm',
    descKey: 'settings.localLlm.family.allMinilmDesc',
    caps: ['embed'],
    versions: [v('latest', 'latest', 0.05, 4, { default: true })],
  },
  {
    id: 'qwen3-embedding',
    ollamaModel: 'qwen3-embedding',
    vendor: 'alibaba',
    modality: 'embedding',
    nameKey: 'settings.localLlm.family.qwen3Embed',
    descKey: 'settings.localLlm.family.qwen3EmbedDesc',
    caps: ['embed'],
    versions: [
      v('0.6b', '0.6B', 0.6, 4, { default: true }),
      v('4b', '4B', 2.5, 8),
      v('8b', '8B', 5.0, 12),
    ],
  },

  // —— Text-to-image（本地绘图运行时，非 Ollama）——
  {
    id: 'flux-schnell',
    ollamaModel: 'flux-schnell',
    vendor: 'blackforest',
    modality: 'image',
    nameKey: 'settings.localLlm.family.fluxSchnell',
    descKey: 'settings.localLlm.family.fluxSchnellDesc',
    popular: true,
    caps: ['t2i'],
    installRuntime: 'draw-things',
    installUrl: 'https://drawthings.ai/',
    platforms: ['darwin'],
    versions: [v('schnell', 'Schnell · 量化', 12, 16, { default: true })],
  },
  {
    id: 'sdxl',
    ollamaModel: 'sdxl',
    vendor: 'stability',
    modality: 'image',
    nameKey: 'settings.localLlm.family.sdxl',
    descKey: 'settings.localLlm.family.sdxlDesc',
    popular: true,
    caps: ['t2i'],
    installRuntime: 'draw-things',
    installUrl: 'https://drawthings.ai/',
    platforms: ['darwin'],
    versions: [v('base', 'SDXL 1.0 Base', 7, 12, { default: true })],
  },
  {
    id: 'sd15',
    ollamaModel: 'stable-diffusion-1.5',
    vendor: 'stability',
    modality: 'image',
    nameKey: 'settings.localLlm.family.sd15',
    descKey: 'settings.localLlm.family.sd15Desc',
    caps: ['t2i'],
    installRuntime: 'draw-things',
    installUrl: 'https://drawthings.ai/',
    platforms: ['darwin', 'win32', 'linux'],
    versions: [v('base', 'SD 1.5', 4, 8, { default: true })],
  },
  {
    id: 'flux-comfy',
    ollamaModel: 'flux-comfyui',
    vendor: 'blackforest',
    modality: 'image',
    nameKey: 'settings.localLlm.family.fluxComfy',
    descKey: 'settings.localLlm.family.fluxComfyDesc',
    caps: ['t2i'],
    installRuntime: 'comfyui',
    installUrl: 'https://www.comfy.org/',
    platforms: ['darwin', 'win32', 'linux'],
    versions: [
      v('schnell', 'FLUX Schnell', 12, 16, { default: true }),
      v('dev', 'FLUX Dev', 24, 32),
    ],
  },
  {
    id: 'sd3-medium',
    ollamaModel: 'sd3-medium',
    vendor: 'stability',
    modality: 'image',
    nameKey: 'settings.localLlm.family.sd3',
    descKey: 'settings.localLlm.family.sd3Desc',
    caps: ['t2i'],
    installRuntime: 'comfyui',
    installUrl: 'https://www.comfy.org/',
    versions: [v('medium', 'SD3 Medium', 10, 16, { default: true })],
  },

  // —— Speech（语音：识别 / 合成）——
  {
    id: 'whisper-large',
    ollamaModel: 'whisper',
    vendor: 'openai-oss',
    modality: 'speech',
    nameKey: 'settings.localLlm.family.whisper',
    descKey: 'settings.localLlm.family.whisperDesc',
    popular: true,
    caps: ['stt'],
    installRuntime: 'whisper',
    installUrl: 'https://github.com/ggerganov/whisper.cpp',
    versions: [
      v('tiny', 'Tiny', 0.1, 4),
      v('base', 'Base', 0.15, 4),
      v('small', 'Small', 0.5, 6, { default: true }),
      v('medium', 'Medium', 1.5, 8),
      v('large-v3', 'Large v3', 3.1, 12),
    ],
  },
  {
    id: 'faster-whisper',
    ollamaModel: 'faster-whisper',
    vendor: 'community',
    modality: 'speech',
    nameKey: 'settings.localLlm.family.fasterWhisper',
    descKey: 'settings.localLlm.family.fasterWhisperDesc',
    caps: ['stt'],
    installRuntime: 'external',
    installUrl: 'https://github.com/SYSTRAN/faster-whisper',
    versions: [v('distil-large-v3', 'Distil Large v3', 1.5, 8, { default: true })],
  },
  {
    id: 'piper-tts',
    ollamaModel: 'piper-tts',
    vendor: 'community',
    modality: 'speech',
    nameKey: 'settings.localLlm.family.piperTts',
    descKey: 'settings.localLlm.family.piperTtsDesc',
    popular: true,
    caps: ['tts'],
    installRuntime: 'external',
    installUrl: 'https://github.com/rhasspy/piper',
    versions: [v('zh_CN', '中文音色包', 0.1, 4, { default: true }), v('en_US', 'English', 0.1, 4)],
  },
  {
    id: 'chattts',
    ollamaModel: 'chattts',
    vendor: 'community',
    modality: 'speech',
    nameKey: 'settings.localLlm.family.chatTts',
    descKey: 'settings.localLlm.family.chatTtsDesc',
    caps: ['tts'],
    installRuntime: 'external',
    installUrl: 'https://github.com/2noise/ChatTTS',
    versions: [v('default', 'Default', 1.2, 8, { default: true })],
  },
  {
    id: 'cosyvoice',
    ollamaModel: 'cosyvoice',
    vendor: 'alibaba',
    modality: 'speech',
    nameKey: 'settings.localLlm.family.cosyVoice',
    descKey: 'settings.localLlm.family.cosyVoiceDesc',
    caps: ['tts'],
    installRuntime: 'external',
    installUrl: 'https://github.com/FunAudioLLM/CosyVoice',
    versions: [v('300m', '300M', 1.5, 8, { default: true })],
  },

  // —— Video（文生视频 / 图生视频，偏 ComfyUI）——
  {
    id: 'wan21-t2v',
    ollamaModel: 'wan2.1-t2v',
    vendor: 'alibaba',
    modality: 'video',
    nameKey: 'settings.localLlm.family.wan21',
    descKey: 'settings.localLlm.family.wan21Desc',
    popular: true,
    caps: ['t2v'],
    installRuntime: 'comfyui',
    installUrl: 'https://www.comfy.org/',
    versions: [
      v('1.3b', '1.3B 短片', 10, 16, { default: true }),
      v('14b', '14B', 40, 48),
    ],
  },
  {
    id: 'cogvideox',
    ollamaModel: 'cogvideox',
    vendor: 'community',
    modality: 'video',
    nameKey: 'settings.localLlm.family.cogvideox',
    descKey: 'settings.localLlm.family.cogvideoxDesc',
    caps: ['t2v'],
    installRuntime: 'comfyui',
    installUrl: 'https://www.comfy.org/',
    versions: [v('2b', '2B', 12, 20, { default: true }), v('5b', '5B', 22, 32)],
  },
  {
    id: 'ltx-video',
    ollamaModel: 'ltx-video',
    vendor: 'community',
    modality: 'video',
    nameKey: 'settings.localLlm.family.ltxVideo',
    descKey: 'settings.localLlm.family.ltxVideoDesc',
    caps: ['t2v'],
    installRuntime: 'comfyui',
    installUrl: 'https://www.comfy.org/',
    versions: [v('2b', '2B', 8, 16, { default: true })],
  },
  {
    id: 'hunyuan-video',
    ollamaModel: 'hunyuan-video',
    vendor: 'tencent',
    modality: 'video',
    nameKey: 'settings.localLlm.family.hunyuanVideo',
    descKey: 'settings.localLlm.family.hunyuanVideoDesc',
    caps: ['t2v'],
    installRuntime: 'comfyui',
    installUrl: 'https://www.comfy.org/',
    versions: [v('full', 'Full', 50, 64, { default: true })],
  },

  // —— 3D ——
  {
    id: 'triposr',
    ollamaModel: 'triposr',
    vendor: 'community',
    modality: 'mesh3d',
    nameKey: 'settings.localLlm.family.triposr',
    descKey: 'settings.localLlm.family.triposrDesc',
    popular: true,
    caps: ['mesh'],
    installRuntime: 'external',
    installUrl: 'https://github.com/VAST-AI-Research/TripoSR',
    versions: [v('default', 'Default', 2.5, 12, { default: true })],
  },
  {
    id: 'instantmesh',
    ollamaModel: 'instantmesh',
    vendor: 'community',
    modality: 'mesh3d',
    nameKey: 'settings.localLlm.family.instantmesh',
    descKey: 'settings.localLlm.family.instantmeshDesc',
    caps: ['mesh'],
    installRuntime: 'external',
    installUrl: 'https://github.com/TencentARC/InstantMesh',
    versions: [v('default', 'Default', 4, 16, { default: true })],
  },
  {
    id: 'stable-fast-3d',
    ollamaModel: 'stable-fast-3d',
    vendor: 'stability',
    modality: 'mesh3d',
    nameKey: 'settings.localLlm.family.stableFast3d',
    descKey: 'settings.localLlm.family.stableFast3dDesc',
    caps: ['mesh'],
    installRuntime: 'external',
    installUrl: 'https://huggingface.co/stabilityai/stable-fast-3d',
    versions: [v('default', 'Default', 3, 12, { default: true })],
  },
  {
    id: 'trellis',
    ollamaModel: 'trellis',
    vendor: 'microsoft',
    modality: 'mesh3d',
    nameKey: 'settings.localLlm.family.trellis',
    descKey: 'settings.localLlm.family.trellisDesc',
    caps: ['mesh'],
    installRuntime: 'external',
    installUrl: 'https://github.com/microsoft/TRELLIS',
    versions: [v('default', 'Default', 8, 24, { default: true })],
  },
]

/** @deprecated flat entries — kept for type migration helpers */
export type LocalLlmCatalogEntry = LocalLlmFamily & {
  ollamaName: string
  sizeGb: number
  minRamGb: number
  tags?: string[]
}

export function localLlmPullName(family: LocalLlmFamily, tag: string): string {
  const t = tag.trim()
  if (!t || t === 'latest') {
    // Bare name resolves to library default / latest — matches how Ollama lists many models.
    return family.ollamaModel
  }
  return `${family.ollamaModel}:${t}`
}

export function localLlmDefaultVersion(family: LocalLlmFamily): LocalLlmVersion {
  return family.versions.find((x) => x.default) ?? family.versions[0]!
}

export function localLlmFamilyById(id: string): LocalLlmFamily | undefined {
  return LOCAL_LLM_FAMILIES.find((f) => f.id === id)
}

export function localLlmFamilyByOllamaName(name: string): LocalLlmFamily | undefined {
  const raw = name.trim().toLowerCase()
  const base = raw.includes(':') ? raw.slice(0, raw.indexOf(':')) : raw
  return LOCAL_LLM_FAMILIES.find(
    (f) => localLlmIsOllamaFamily(f) && f.ollamaModel.toLowerCase() === base,
  )
}

/** Resolve installed tag for a family from full model name. */
export function localLlmParseInstalled(
  name: string,
): { family: LocalLlmFamily; tag: string } | null {
  const family = localLlmFamilyByOllamaName(name)
  if (!family) return null
  const raw = name.trim()
  const idx = raw.indexOf(':')
  const tag = idx >= 0 ? raw.slice(idx + 1) : 'latest'
  return { family, tag }
}

export function localLlmTierForRam(sizeGb: number, minRamGb: number, ramGb: number): LocalLlmTier {
  if (ramGb < minRamGb * 0.75 || ramGb < sizeGb * 1.1) return 'avoid'
  if (ramGb < minRamGb) return 'tight'
  if (ramGb >= minRamGb + 8 || sizeGb <= 5) return 'recommended'
  return 'optional'
}

export function localLlmTierForVersion(version: LocalLlmVersion, ramGb: number): LocalLlmTier {
  return localLlmTierForRam(version.sizeGb, version.minRamGb, ramGb)
}

/** Validate custom Ollama model ref (library name, tag, or hf.co/…). */
export function localLlmValidateModelRef(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim()
  if (!name) return { ok: false, error: 'empty_model' }
  if (name.length > 200) return { ok: false, error: 'name_too_long' }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-/:]*$/.test(name)) return { ok: false, error: 'invalid_name' }
  return { ok: true, name }
}

export interface LocalLlmHostInfo {
  platform: LocalLlmPlatform
  arch: string
  ramGb: number
  freeDiskGb: number | null
  chipLabel: string
  accelerator: 'apple' | 'nvidia' | 'cpu'
}

export interface LocalLlmRuntimeStatus {
  runtime: LocalLlmRuntimeId
  installed: boolean
  running: boolean
  version: string | null
  binaryPath: string | null
  baseUrl: string
  installUrl: string
  libraryUrl: string
  hint?: string
}

export interface LocalLlmInstalledModel {
  name: string
  sizeBytes: number
  modifiedAt?: string
  digest?: string
  familyId?: string
  tag?: string
  details?: {
    format?: string
    family?: string
    parameterSize?: string
    quantizationLevel?: string
  }
}

export interface LocalLlmRunningModel {
  name: string
  sizeBytes: number
  processor?: string
  until?: string
}

export interface LocalLlmModelDetails {
  name: string
  modelfile?: string
  parameters?: string
  template?: string
  details?: LocalLlmInstalledModel['details']
  modelInfo?: Record<string, unknown>
}

export interface LocalLlmPullProgress {
  model: string
  status: string
  digest?: string
  total?: number
  completed?: number
  percent: number
  phase: 'start' | 'progress' | 'done' | 'error'
  error?: string
}

export interface LocalLlmRemoteTag {
  /** Tag only, e.g. `7b-instruct-q5_K_M` */
  tag: string
  /** Full pull name `qwen2.5:7b-instruct-q5_K_M` */
  fullName: string
  /** Whether this tag is in the curated catalog */
  curated: boolean
}

export interface LocalLlmFamilyState {
  family: LocalLlmFamily
  /** Best tier among versions that fit this machine */
  bestTier: LocalLlmTier
  installedTags: string[]
  installedNames: string[]
}

export interface LocalLlmSnapshot {
  host: LocalLlmHostInfo
  ollama: LocalLlmRuntimeStatus
  lmstudio: LocalLlmRuntimeStatus
  installed: LocalLlmInstalledModel[]
  running: LocalLlmRunningModel[]
  families: LocalLlmFamilyState[]
  pullingModel: string | null
}

/** Backward-compat alias used by older imports */
export const LOCAL_LLM_CATALOG: LocalLlmCatalogEntry[] = LOCAL_LLM_FAMILIES.map((f) => {
  const d = localLlmDefaultVersion(f)
  return {
    ...f,
    ollamaName: localLlmPullName(f, d.tag),
    sizeGb: d.sizeGb,
    minRamGb: d.minRamGb,
    tags: f.caps,
  }
})

export function localLlmCatalogById(id: string): LocalLlmCatalogEntry | undefined {
  return LOCAL_LLM_CATALOG.find((m) => m.id === id)
}

export function localLlmCatalogByOllamaName(name: string): LocalLlmCatalogEntry | undefined {
  const family = localLlmFamilyByOllamaName(name)
  if (!family) return undefined
  return LOCAL_LLM_CATALOG.find((m) => m.id === family.id)
}
