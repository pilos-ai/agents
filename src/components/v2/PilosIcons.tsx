/**
 * Pilos icon set — direct port of the prototype's `Ico` map
 * (pilos-handoff/app/appkit.jsx) as React/TS components.
 *
 * Use these instead of lucide-react in the new shell (rail, titlebar) so the
 * pixel look matches the spec exactly.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string }

function makeStroked(paths: string[] | string) {
  const pathArr = Array.isArray(paths) ? paths : [paths]
  // eslint-disable-next-line react/display-name
  return ({ size = 16, ...rest }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      {...rest}
    >
      {pathArr.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}

function makeStrokedChildren(children: React.ReactNode) {
  // eslint-disable-next-line react/display-name
  return ({ size = 16, ...rest }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconChat = makeStroked([
  'M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6a8.5 8.5 0 0 1-.9-3.9A8.38 8.38 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z',
])

export const IconWorkflow = makeStrokedChildren(
  <>
    <rect x={3} y={3} width={6.5} height={6.5} rx={1.4} />
    <rect x={14.5} y={14.5} width={6.5} height={6.5} rx={1.4} />
    <path d="M9.5 6.2H14a3.7 3.7 0 0 1 3.7 3.7v4.6" />
  </>
)

export const IconTerminal = makeStrokedChildren(
  <>
    <rect x={2.5} y={4} width={19} height={16} rx={2} />
    <path d="M6.5 9l3 3-3 3M12.5 15h5" />
  </>
)

export const IconAnalytics = makeStroked(['M4 20V10M10 20V4M16 20v-7M22 20H2'])

export const IconAgents = makeStrokedChildren(
  <>
    <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
    <circle cx={9} cy={7} r={3} />
    <path d="M22 19v-1a4 4 0 0 0-3-3.87M16.5 4.2A3 3 0 0 1 16.5 12" />
  </>
)

export const IconMcp = makeStrokedChildren(
  <path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0V8ZM12 16v6" />
)

export const IconRuns = makeStrokedChildren(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" />
    <path d="M12 8v4l3 2" />
  </>
)

export const IconSettings = makeStrokedChildren(
  <>
    <circle cx={12} cy={12} r={3} />
    <path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.5.3a2 2 0 0 1-2 0l-.1-.1a2 2 0 0 0-2.8.8l-.2.3a2 2 0 0 0 .8 2.8l.1.1a2 2 0 0 1 1 1.7v.6a2 2 0 0 1-1 1.7l-.1.1a2 2 0 0 0-.8 2.8l.2.3a2 2 0 0 0 2.8.8l.1-.1a2 2 0 0 1 2 0l.5.3a2 2 0 0 1 1 1.7V20a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.5-.3a2 2 0 0 1 2 0l.1.1a2 2 0 0 0 2.8-.8l.2-.3a2 2 0 0 0-.8-2.8l-.1-.1a2 2 0 0 1-1-1.7v-.6a2 2 0 0 1 1-1.7l.1-.1a2 2 0 0 0 .8-2.8l-.2-.3a2 2 0 0 0-2.8-.8l-.1.1a2 2 0 0 1-2 0l-.5-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2Z" />
  </>
)

export const IconSpark = makeStroked([
  'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z',
])

export const IconBell = makeStroked([
  'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
])

export const IconCheck = makeStroked(['M4 12.5l5 5 11-11'])

export const IconCheckSm = makeStroked(['M5 12l4 4 10-10'])

export const IconShield = makeStroked([
  'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  'M9 12l2 2 4-4',
])

export const IconPaperclip = makeStroked([
  'M21 11.5l-8.5 8.5a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.6 1.6 0 0 1-2.3-2.3l7.8-7.8',
])

export const IconAt = makeStrokedChildren(
  <>
    <circle cx={12} cy={12} r={4} />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
  </>
)

export const IconSend = makeStroked(['M4 12l16-8-6 16-3-6-7-2Z'])

export const IconDots = makeStrokedChildren(
  <>
    <circle cx={5} cy={12} r={1.6} fill="currentColor" stroke="none" />
    <circle cx={12} cy={12} r={1.6} fill="currentColor" stroke="none" />
    <circle cx={19} cy={12} r={1.6} fill="currentColor" stroke="none" />
  </>
)

export const IconPen = makeStroked([
  'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z',
])

export const IconCopy = makeStrokedChildren(
  <>
    <rect x={9} y={9} width={12} height={12} rx={2} />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>
)

export const IconExternal = makeStroked([
  'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3',
])

export const IconTrash = makeStroked([
  'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
])

export const IconPlus = makeStroked(['M12 5v14M5 12h14'])

export const IconSearch = makeStrokedChildren(
  <>
    <circle cx={11} cy={11} r={7} />
    <path d="M21 21l-4.3-4.3" />
  </>
)

export const IconCpu = makeStrokedChildren(
  <>
    <rect x={6} y={6} width={12} height={12} rx={2} />
    <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
  </>
)

export const IconChevD = makeStroked(['M6 9l6 6 6-6'])

export const IconBolt = ({ size = 16, ...rest }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} {...rest}>
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8Z" />
  </svg>
)

export const IconFolder = makeStroked([
  'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
])

export const IconGithub = ({ size = 16, ...rest }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} {...rest}>
    <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.36-3.37-1.36-.45-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.4 9.4 0 0 1 12 6.85c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
  </svg>
)

export const IconStop = ({ size = 16, ...rest }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} {...rest}>
    <rect x={6} y={6} width={12} height={12} rx={2} />
  </svg>
)

export const IconRepeat = makeStroked([
  'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
])

export const IconClock = makeStrokedChildren(
  <>
    <circle cx={12} cy={12} r={9} />
    <path d="M12 7v5l3 2" />
  </>
)

export const IconCalendar = makeStrokedChildren(
  <>
    <rect x={3} y={5} width={18} height={16} rx={2} />
    <path d="M3 9h18M8 3v4M16 3v4" />
  </>
)

export const IconRefresh = makeStroked(['M21 12a9 9 0 1 1-2.6-6.4M21 3v5h-5'])

export const IconDollar = makeStroked([
  'M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5 9.2 9.5 12 9.5s5 1.1 5 3-2.2 3-5 3-5-1.1-5-3',
])

export const IconGauge = makeStroked(['M12 14l4-4M3.5 19a9 9 0 1 1 17 0'])

export const IconLayers = makeStroked([
  'M12 2l9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5',
])

export const IconBranch = makeStrokedChildren(
  <>
    <circle cx={6} cy={6} r={2.5} />
    <circle cx={6} cy={18} r={2.5} />
    <circle cx={18} cy={8} r={2.5} />
    <path d="M6 8.5v7M6 15.5A8 8 0 0 0 15.5 8.7" />
  </>
)

export const IconFilter = makeStroked(['M3 5h18l-7 8v6l-4-2v-4L3 5Z'])

export const IconChevR = makeStroked(['M9 6l6 6-6 6'])

export const IconGrip = makeStrokedChildren(
  <>
    <circle cx={9} cy={7} r={1.3} fill="currentColor" stroke="none" />
    <circle cx={15} cy={7} r={1.3} fill="currentColor" stroke="none" />
    <circle cx={9} cy={12} r={1.3} fill="currentColor" stroke="none" />
    <circle cx={15} cy={12} r={1.3} fill="currentColor" stroke="none" />
    <circle cx={9} cy={17} r={1.3} fill="currentColor" stroke="none" />
    <circle cx={15} cy={17} r={1.3} fill="currentColor" stroke="none" />
  </>
)

export const IconZoomIn = makeStrokedChildren(
  <>
    <circle cx={11} cy={11} r={7} />
    <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
  </>
)

export const IconZoomOut = makeStrokedChildren(
  <>
    <circle cx={11} cy={11} r={7} />
    <path d="M21 21l-4.3-4.3M8 11h6" />
  </>
)

export const IconFit = makeStroked([
  'M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4',
])

export const IconPlay = ({ size = 16, ...rest }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} {...rest}>
    <path d="M7 5v14l11-7-11-7Z" />
  </svg>
)

export const IconSun = makeStrokedChildren(
  <>
    <circle cx={12} cy={12} r={4} />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </>
)

export const IconUser = makeStrokedChildren(
  <>
    <circle cx={12} cy={8} r={4} />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </>
)

export const IconLock = makeStrokedChildren(
  <>
    <rect x={4} y={11} width={16} height={10} rx={2} />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </>
)

export const IconArrow = makeStroked(['M5 12h14M13 6l6 6-6 6'])
export const IconReport = makeStroked([
  'M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
  'M14 3v4h4',
  'M9 12.5h6',
  'M9 15.5h6',
  'M9 18.5h4',
])
