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

export function IconGlobe(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 12h17M12 3.5a14 14 0 0 1 0 17M12 3.5a14 14 0 0 0 0 17" />
    </svg>
  )
}

export function IconPower(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v6" />
      <path d="M7.5 4.8a7 7 0 1 0 9 0" />
    </svg>
  )
}

export function IconTray(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M4 14h16l-1.2 4H5.2L4 14z" />
      <path d="M7 10h10l2 4H5l2-4z" />
      <path d="M9 6h6l1 4H8l1-4z" />
    </svg>
  )
}

export function IconDial(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 12V7" />
      <path d="M12 12l3.5 2" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconBell(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M12 4.5a4 4 0 0 0-4 4v3.5l-1.5 2.5h11L16 12V8.5a4 4 0 0 0-4-4z" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    </svg>
  )
}

export function IconSparkles(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5l.9 3.1L16 7.5l-3.1.9L12 11.5l-.9-3.1L8 7.5l3.1-.9L12 3.5z" />
      <path d="M6 14l.6 2 2 .6-2 .6L6 19.2l-.6-2-2-.6 2-.6L6 14z" />
      <path d="M17 13l.5 1.7 1.7.5-1.7.5L17 17.4l-.5-1.7-1.7-.5 1.7-.5L17 13z" />
    </svg>
  )
}

export function IconYinYang(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 4.25 0 0 1 0 8.5 4.25 4.25 0 0 1 0-8.5z" />
      <circle cx="12" cy="9.75" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14.25" r="1" fill="var(--color-bg-elevated, #fff)" stroke="none" />
    </svg>
  )
}

export function IconFlower(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3M6.4 6.4l2.1 2.1M15.5 15.5l2.1 2.1M17.6 6.4l-2.1 2.1M8.5 15.5l-2.1 2.1" />
    </svg>
  )
}

export function IconLayers(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M12 4.5 4 8.5l8 4 8-4-8-4z" />
      <path d="M4 12.5l8 4 8-4" />
      <path d="M4 16.5l8 4 8-4" />
    </svg>
  )
}

export function IconDownload(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M12 4.5v10" />
      <path d="M8.5 11 12 14.5 15.5 11" />
      <path d="M5 19.5h14" />
    </svg>
  )
}

export function IconUpload(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M12 14.5V4.5" />
      <path d="M8.5 8 12 4.5 15.5 8" />
      <path d="M5 19.5h14" />
    </svg>
  )
}

export function IconImage(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="5.5" width="16" height="13" rx="1.5" />
      <circle cx="9" cy="10.5" r="1.5" />
      <path d="m6 17.5 4.5-4 3 2.5L17 11.5" />
    </svg>
  )
}

export function IconEraser(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="m16 6-8.5 8.5-2 2L6 20l3.5-3.5 2-2L20 8l-4-2z" />
      <path d="M11.5 11.5 16 16" />
    </svg>
  )
}

export function IconCheck(props: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...props}>
      <path d="M5.5 12.5 10 17 18.5 7" />
    </svg>
  )
}

