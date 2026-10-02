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
