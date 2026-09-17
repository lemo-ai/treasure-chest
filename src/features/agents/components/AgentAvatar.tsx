import fortuneLogo from '@renderer/assets/agent-logo-fortune.png'
import stocksLogo from '@renderer/assets/agent-logo-stocks.png'
import type { ReactNode } from 'react'
import {
  IconChatBubble,
  IconFortune,
  IconSkill,
  IconSparkles,
  IconStocks,
} from '@renderer/shared/ui/icons'
import {
  isDirectChatId,
  type AgentDef,
} from '../lib/agentRegistry'
import { isUsableLogoUrl } from '../lib/agentLogo'
import styles from './AgentAvatar.module.css'

type AvatarSize = 'sm' | 'md' | 'lg'

interface AgentAvatarProps {
  agent: AgentDef
  size?: AvatarSize
  /** Sidebar uses skill icon; empty-state uses sparkles for custom agents. */
  fallback?: 'skill' | 'sparkles'
  className?: string
  alt?: string
}

const BUILTIN_DEFAULT_LOGOS: Record<string, string> = {
  fortune: fortuneLogo,
  stocks: stocksLogo,
}

function defaultIcon(agent: AgentDef, fallback: 'skill' | 'sparkles'): ReactNode {
  if (isDirectChatId(String(agent.id))) return <IconChatBubble />
  if (agent.id === 'fortune') return <IconFortune />
  if (agent.id === 'stocks') return <IconStocks />
  return fallback === 'sparkles' ? <IconSparkles /> : <IconSkill />
}

function resolveLogoSrc(agent: AgentDef): string | null {
  if (isUsableLogoUrl(agent.logoUrl)) return agent.logoUrl.trim()
  const builtin = BUILTIN_DEFAULT_LOGOS[String(agent.id)]
  return builtin ?? null
}

export function AgentAvatar({
  agent,
  size = 'sm',
  fallback = 'skill',
  className,
  alt,
}: AgentAvatarProps): React.JSX.Element {
  const logo = resolveLogoSrc(agent)
  const rootClass = [
    styles.root,
    styles[`size_${size}`],
    logo ? styles.hasLogo : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  if (logo) {
    return (
      <span className={rootClass}>
        <img className={styles.img} src={logo} alt={alt ?? ''} draggable={false} />
      </span>
    )
  }

  return <span className={rootClass}>{defaultIcon(agent, fallback)}</span>
}
