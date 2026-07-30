import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
}

export function IconChevronLeft(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export function IconChevronRight(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

export function IconToday(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
      <path d="M8 2.5v4M16 2.5v4M3.5 9.5h17" />
      <circle cx="12" cy="15" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconOpenWindow(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5.5" width="14" height="13" rx="1.5" />
      <path d="M10.5 3.5h10v10" />
      <path d="M20.5 3.5L12 12" />
    </svg>
  )
}

export function IconExpand(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M9 3.5H3.5V9M15 3.5h5.5V9M9 20.5H3.5V15M15 20.5h5.5V15" />
    </svg>
  )
}

export function IconCompress(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 9H9V3.5M15 3.5V9h5.5M3.5 15H9v5.5M15 20.5V15h5.5" />
    </svg>
  )
}

export function IconSun(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
    </svg>
  )
}

export function IconMoon(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M20 13.5A7.5 7.5 0 0 1 10.5 4 7.5 7.5 0 1 0 20 13.5z" />
    </svg>
  )
}

export function IconMonitor(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="4.5" width="17" height="12" rx="1.5" />
      <path d="M8 20.5h8M12 16.5v4" />
    </svg>
  )
}

export function IconClose(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function IconPin(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M12 17v4M9 3l6 0 1 7-4 3-4-3 1-7z" />
      <path d="M8 10h8" />
    </svg>
  )
}

export function IconHome(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
    </svg>
  )
}

export function IconCalendar(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </svg>
  )
}

export function IconFortune(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M12 3l1.8 5.4H20l-4.4 3.2 1.7 5.4L12 13.8 6.7 17l1.7-5.4L4 8.4h6.2L12 3z" />
    </svg>
  )
}

export function IconStocks(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M4 19h16" />
      <path d="M6 16V11M11 16V7M16 16v-4M20 16V5" />
    </svg>
  )
}

export function IconSettings(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.9 6.5l1.6 1.6M17.5 15.9l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.9 17.5l1.6-1.6M17.5 8.1l1.6-1.6" />
    </svg>
  )
}

export function IconChest(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="9" width="17" height="11" rx="1.5" />
      <path d="M3.5 13h17M12 13v7M8 9V7.5A4 4 0 0 1 12 3.5 4 4 0 0 1 16 7.5V9" />
    </svg>
  )
}

export function IconArrowRight(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

