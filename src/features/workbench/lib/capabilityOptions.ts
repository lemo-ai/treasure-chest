import type { WorkbenchCapabilityId } from './capabilities'

export type CapOptionGroupId =
  | 'imageAspect'
  | 'imageQuality'
  | 'imageStyle'
  | 'videoAspect'
  | 'videoDuration'
  | 'videoResolution'
  | 'musicDuration'
  | 'musicStyle'
  | 'musicInstrumental'
  | 'translateFrom'
  | 'translateTo'
  | 'translateTone'
  | 'writeTone'
  | 'writeLength'
  | 'writeFormat'
  | 'researchDepth'
  | 'researchCite'

export interface CapOptionChoice {
  value: string
  labelKey: string
}

export interface CapOptionGroup {
  id: CapOptionGroupId
  labelKey: string
  choices: CapOptionChoice[]
}

/** Doubao-style per-mode parameter groups shown above the composer. */
export const CAPABILITY_OPTION_GROUPS: Partial<
  Record<WorkbenchCapabilityId, CapOptionGroup[]>
> = {
  image: [
    {
      id: 'imageAspect',
      labelKey: 'workbench.opt.aspect',
      choices: [
        { value: '1:1', labelKey: 'workbench.opt.aspect.1_1' },
        { value: '16:9', labelKey: 'workbench.opt.aspect.16_9' },
        { value: '9:16', labelKey: 'workbench.opt.aspect.9_16' },
        { value: '4:3', labelKey: 'workbench.opt.aspect.4_3' },
      ],
    },
    {
      id: 'imageQuality',
      labelKey: 'workbench.opt.quality',
      choices: [
        { value: 'standard', labelKey: 'workbench.opt.quality.standard' },
        { value: 'hd', labelKey: 'workbench.opt.quality.hd' },
      ],
    },
    {
      id: 'imageStyle',
      labelKey: 'workbench.opt.style',
      choices: [
        { value: 'natural', labelKey: 'workbench.opt.style.natural' },
        { value: 'vivid', labelKey: 'workbench.opt.style.vivid' },
      ],
    },
  ],
  video: [
    {
      id: 'videoAspect',
      labelKey: 'workbench.opt.aspect',
      choices: [
        { value: '16:9', labelKey: 'workbench.opt.aspect.16_9' },
        { value: '9:16', labelKey: 'workbench.opt.aspect.9_16' },
        { value: '1:1', labelKey: 'workbench.opt.aspect.1_1' },
      ],
    },
    {
      id: 'videoDuration',
      labelKey: 'workbench.opt.duration',
      choices: [
        { value: '5', labelKey: 'workbench.opt.duration.5s' },
        { value: '10', labelKey: 'workbench.opt.duration.10s' },
        { value: '15', labelKey: 'workbench.opt.duration.15s' },
      ],
    },
    {
      id: 'videoResolution',
      labelKey: 'workbench.opt.resolution',
      choices: [
        { value: '720p', labelKey: 'workbench.opt.resolution.720p' },
        { value: '1080p', labelKey: 'workbench.opt.resolution.1080p' },
      ],
    },
  ],
  music: [
    {
      id: 'musicDuration',
      labelKey: 'workbench.opt.duration',
      choices: [
        { value: '30', labelKey: 'workbench.opt.duration.30s' },
        { value: '60', labelKey: 'workbench.opt.duration.60s' },
        { value: '120', labelKey: 'workbench.opt.duration.120s' },
      ],
    },
    {
      id: 'musicStyle',
      labelKey: 'workbench.opt.musicStyle',
      choices: [
        { value: 'pop', labelKey: 'workbench.opt.musicStyle.pop' },
        { value: 'ambient', labelKey: 'workbench.opt.musicStyle.ambient' },
        { value: 'cinematic', labelKey: 'workbench.opt.musicStyle.cinematic' },
        { value: 'lofi', labelKey: 'workbench.opt.musicStyle.lofi' },
      ],
    },
    {
      id: 'musicInstrumental',
      labelKey: 'workbench.opt.instrumental',
      choices: [
        { value: 'yes', labelKey: 'workbench.opt.instrumental.yes' },
        { value: 'no', labelKey: 'workbench.opt.instrumental.no' },
      ],
    },
  ],
  translate: [
    {
      id: 'translateFrom',
      labelKey: 'workbench.opt.from',
      choices: [
        { value: 'auto', labelKey: 'workbench.opt.lang.auto' },
        { value: 'zh', labelKey: 'workbench.opt.lang.zh' },
        { value: 'en', labelKey: 'workbench.opt.lang.en' },
        { value: 'ja', labelKey: 'workbench.opt.lang.ja' },
      ],
    },
    {
      id: 'translateTo',
      labelKey: 'workbench.opt.to',
      choices: [
        { value: 'zh', labelKey: 'workbench.opt.lang.zh' },
        { value: 'en', labelKey: 'workbench.opt.lang.en' },
        { value: 'ja', labelKey: 'workbench.opt.lang.ja' },
        { value: 'ko', labelKey: 'workbench.opt.lang.ko' },
      ],
    },
    {
      id: 'translateTone',
      labelKey: 'workbench.opt.tone',
      choices: [
        { value: 'neutral', labelKey: 'workbench.opt.tone.neutral' },
        { value: 'formal', labelKey: 'workbench.opt.tone.formal' },
        { value: 'casual', labelKey: 'workbench.opt.tone.casual' },
      ],
    },
  ],
  write: [
    {
      id: 'writeTone',
      labelKey: 'workbench.opt.tone',
      choices: [
        { value: 'professional', labelKey: 'workbench.opt.tone.professional' },
        { value: 'casual', labelKey: 'workbench.opt.tone.casual' },
        { value: 'literary', labelKey: 'workbench.opt.tone.literary' },
      ],
    },
    {
      id: 'writeLength',
      labelKey: 'workbench.opt.length',
      choices: [
        { value: 'short', labelKey: 'workbench.opt.length.short' },
        { value: 'medium', labelKey: 'workbench.opt.length.medium' },
        { value: 'long', labelKey: 'workbench.opt.length.long' },
      ],
    },
    {
      id: 'writeFormat',
      labelKey: 'workbench.opt.format',
      choices: [
        { value: 'paragraph', labelKey: 'workbench.opt.format.paragraph' },
        { value: 'bullets', labelKey: 'workbench.opt.format.bullets' },
        { value: 'markdown', labelKey: 'workbench.opt.format.markdown' },
      ],
    },
  ],
  research: [
    {
      id: 'researchDepth',
      labelKey: 'workbench.opt.depth',
      choices: [
        { value: 'quick', labelKey: 'workbench.opt.depth.quick' },
        { value: 'standard', labelKey: 'workbench.opt.depth.standard' },
        { value: 'deep', labelKey: 'workbench.opt.depth.deep' },
      ],
    },
    {
      id: 'researchCite',
      labelKey: 'workbench.opt.cite',
      choices: [
        { value: 'yes', labelKey: 'workbench.opt.cite.yes' },
        { value: 'no', labelKey: 'workbench.opt.cite.no' },
      ],
    },
  ],
}

export type CapOptionValues = Partial<Record<CapOptionGroupId, string>>

export const DEFAULT_CAP_OPTIONS: CapOptionValues = {
  imageAspect: '1:1',
  imageQuality: 'hd',
  imageStyle: 'natural',
  videoAspect: '16:9',
  videoDuration: '5',
  videoResolution: '1080p',
  musicDuration: '60',
  musicStyle: 'ambient',
  musicInstrumental: 'yes',
  translateFrom: 'auto',
  translateTo: 'zh',
  translateTone: 'neutral',
  writeTone: 'professional',
  writeLength: 'medium',
  writeFormat: 'markdown',
  researchDepth: 'standard',
  researchCite: 'yes',
}

/** Map aspect ratio + quality → OpenAI image size. */
export function imageSizeFromOptions(opts: CapOptionValues): string {
  const aspect = opts.imageAspect || '1:1'
  const hd = (opts.imageQuality || 'hd') === 'hd'
  if (aspect === '16:9') return hd ? '1792x1024' : '1024x576'
  if (aspect === '9:16') return hd ? '1024x1792' : '576x1024'
  if (aspect === '4:3') return hd ? '1440x1080' : '1024x768'
  return '1024x1024'
}

export function buildCapabilityOptionsPrompt(
  id: WorkbenchCapabilityId,
  opts: CapOptionValues,
  locale: string,
): string | null {
  const isEn = locale.toLowerCase().startsWith('en')
  if (id === 'translate') {
    const from = opts.translateFrom || 'auto'
    const to = opts.translateTo || 'zh'
    const tone = opts.translateTone || 'neutral'
    return isEn
      ? `Translation settings: source=${from}, target=${to}, tone=${tone}. Output only the translation unless asked.`
      : `翻译设置：源语言=${from}，目标语言=${to}，语气=${tone}。默认只输出译文。`
  }
  if (id === 'write') {
    const tone = opts.writeTone || 'professional'
    const length = opts.writeLength || 'medium'
    const format = opts.writeFormat || 'markdown'
    return isEn
      ? `Writing settings: tone=${tone}, length=${length}, format=${format}.`
      : `写作设置：语气=${tone}，篇幅=${length}，格式=${format}。`
  }
  if (id === 'research') {
    const depth = opts.researchDepth || 'standard'
    const cite = opts.researchCite || 'yes'
    return isEn
      ? `Research settings: depth=${depth}, cite_sources=${cite}.`
      : `研究设置：深度=${depth}，标注来源=${cite}。`
  }
  if (id === 'image') {
    return isEn
      ? `Image settings: aspect=${opts.imageAspect}, quality=${opts.imageQuality}, style=${opts.imageStyle}.`
      : `图像设置：比例=${opts.imageAspect}，画质=${opts.imageQuality}，风格=${opts.imageStyle}。`
  }
  if (id === 'video') {
    return isEn
      ? `Video settings: aspect=${opts.videoAspect}, duration=${opts.videoDuration}s, resolution=${opts.videoResolution}.`
      : `视频设置：比例=${opts.videoAspect}，时长=${opts.videoDuration}秒，分辨率=${opts.videoResolution}。`
  }
  if (id === 'music') {
    return isEn
      ? `Music settings: duration=${opts.musicDuration}s, style=${opts.musicStyle}, instrumental=${opts.musicInstrumental}.`
      : `音乐设置：时长=${opts.musicDuration}秒，风格=${opts.musicStyle}，纯音乐=${opts.musicInstrumental}。`
  }
  return null
}

export function modesWithOptions(): WorkbenchCapabilityId[] {
  return Object.keys(CAPABILITY_OPTION_GROUPS) as WorkbenchCapabilityId[]
}
