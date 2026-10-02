import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 12.5l5 5L20 6.5" />
  </Icon>
)
export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="10" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
)
export const UnlockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="10" />
    <path d="M8 11V7a4 4 0 0 1 7.5-2" />
  </Icon>
)
export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
  </Icon>
)
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v16M4 12h16" />
  </Icon>
)
export const MinusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 12h16" />
  </Icon>
)
export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 4l-8 8 8 8" />
  </Icon>
)
export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 4l8 8-8 8" />
  </Icon>
)
export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" />
    <path d="M10 21h4" />
  </Icon>
)
export const BellOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 16V11a6 6 0 0 1 9-5.2M18 11v5l2 2H4" />
    <path d="M10 21h4M3 3l18 18" />
  </Icon>
)
export const StackIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="5" />
    <rect x="4" y="11" width="16" height="4" />
    <rect x="4" y="17" width="16" height="3" />
  </Icon>
)
export const GearIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2.5}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
  </Icon>
)
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 5l14 14M19 5L5 19" />
  </Icon>
)
export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Icon>
)
export const GripIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={0}>
    {[6, 12, 18].flatMap((y) => [9, 15].map((x) => <rect key={`${x}-${y}`} x={x - 1.5} y={y - 1.5} width="3" height="3" fill="currentColor" />))}
  </Icon>
)
export const CapIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h16M12 16V4M7 9l5-5 5 5" />
  </Icon>
)
export const ExpandIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Icon>
)
export const CollapseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
  </Icon>
)
export const SelectIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" />
    <path d="M8 12.5l3 3 5-6.5" />
  </Icon>
)
export const ArrowUpIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 20V5M5 11l7-7 7 7" />
  </Icon>
)
export const ArrowDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v15M5 13l7 7 7-7" />
  </Icon>
)
