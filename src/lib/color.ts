/** Tag colours on offer: bright ones that suit black ink, plus a few deep ones for white ink. */
export const TAG_PALETTE = [
  '#b69cff',
  '#4d96ff',
  '#7fd8ff',
  '#00b3a4',
  '#3ddc97',
  '#c6f432',
  '#ffd23f',
  '#ff8a3d',
  '#ff6b6b',
  '#ff5d8f',
  '#e0d5c1',
  '#9aa5b1',
  '#1f3a93',
  '#2d6a4f',
  '#6b2d5c',
  '#333333',
]

export const INK_DARK = '#111'
export const INK_LIGHT = '#fff'

function channels(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const c = channels(hex)
  if (!c) return 1
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Text colour that reads best on `bg`. */
export function inkOn(bg: string): typeof INK_DARK | typeof INK_LIGHT {
  return contrast(bg, INK_DARK) >= contrast(bg, INK_LIGHT) ? INK_DARK : INK_LIGHT
}

// ---- OKLCH: perceptual lightness/chroma/hue, so tones keep their hue -------

export interface Oklch {
  l: number
  c: number
  h: number
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = (channels(hex) ?? [1, 1, 1]).map(toLinear) as [number, number, number]
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)

/** Back to hex, lowering chroma (keeping lightness and hue) until it fits in sRGB. */
export function oklchToHex(color: Oklch): string {
  let { c } = color
  if (!inGamut(oklchToLinear(color))) {
    let lo = 0
    for (let i = 0; i < 24; i++) {
      const mid = (lo + c) / 2
      if (inGamut(oklchToLinear({ ...color, c: mid }))) lo = mid
      else c = mid
    }
    c = lo
  }
  return (
    '#' +
    oklchToLinear({ ...color, c })
      .map((v) => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, v))))) * 255))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  )
}

const clamp01 = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Perceptual distance between two colours (Euclidean in OKLab). */
function oklabDistance(x: Oklch, y: Oklch): number {
  const ab = (o: Oklch) => [o.c * Math.cos((o.h * Math.PI) / 180), o.c * Math.sin((o.h * Math.PI) / 180)] as const
  const [xa, xb] = ab(x)
  const [ya, yb] = ab(y)
  return Math.hypot(x.l - y.l, xa - ya, xb - yb)
}

export interface PhasePalette {
  /** Dark mode: each phase as a deep background with glowing ink. */
  night: Record<'focus' | 'shortBreak' | 'longBreak', NightTone>
  focus: string
  shortBreak: string
  longBreak: string
  onFocus: string
  onShortBreak: string
  onLongBreak: string
}

/**
 * Timer colours seeded by a block's tag colour, Material-You style: focus is
 * the tag colour itself; breaks keep its hue but get lighter and calmer, so
 * they read as rest at a glance. Breaks never go fully white.
 */
export function phasePalette(seed: string): PhasePalette {
  const s = hexToOklch(seed)
  const focus = oklchToHex(s)
  let short: Oklch = { l: clamp01(s.l + 0.1, 0.84, 0.91), c: s.c * 0.45, h: s.h }
  // A pale, greyish tag has no room to get lighter and calmer: step darker instead.
  if (oklabDistance(s, short) < 0.07) short = { ...short, l: s.l - 0.1 }
  const longBreak = oklchToHex({ l: clamp01(s.l + 0.15, 0.9, 0.95), c: s.c * 0.25, h: s.h })
  const shortBreak = oklchToHex(short)
  return {
    night: { focus: nightTone(seed, 0), shortBreak: nightTone(seed, 1), longBreak: nightTone(seed, 2) },
    focus,
    shortBreak,
    longBreak,
    onFocus: inkOn(focus),
    onShortBreak: inkOn(shortBreak),
    onLongBreak: inkOn(longBreak),
  }
}

// ---- Night Shift: tag colours as light on dark ------------------------------

export interface NightTone {
  /** A deep version of the hue, to fill a surface with. */
  bg: string
  /** The colour lifted so it reads on dark (digits, edges, accents). */
  glow: string
  /** Between the two: hard shadows behind glowing things. */
  shade: string
}

/**
 * A colour as it should appear in dark mode. `calm` (0 = focus, 1 = short
 * break, 2 = long break) lowers the chroma for restful phases.
 */
export function nightTone(seed: string, calm: 0 | 1 | 2 = 0): NightTone {
  const s = hexToOklch(seed)
  const soften = [1, 0.65, 0.45][calm]!
  return {
    bg: oklchToHex({ l: [0.24, 0.22, 0.21][calm]!, c: Math.min(s.c * 0.45, 0.07) * soften, h: s.h }),
    glow: oklchToHex({ l: Math.max(s.l, 0.78 + calm * 0.03), c: s.c * soften, h: s.h }),
    shade: oklchToHex({ l: 0.36, c: Math.min(s.c * 0.7, 0.12) * soften, h: s.h }),
  }
}
