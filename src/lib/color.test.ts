import { describe, expect, it } from 'vitest'
import { contrast, hexToOklch, inkOn, oklchToHex, phasePalette, TAG_PALETTE } from './color'

describe('colour helpers', () => {
  it('picks white ink on dark colours and black on light ones', () => {
    expect(inkOn('#1f3a93')).toBe('#fff')
    expect(inkOn('#333')).toBe('#fff')
    expect(inkOn('#ffd23f')).toBe('#111')
    expect(inkOn('#ffffff')).toBe('#111')
  })

  it('falls back to black ink for unparseable colours', () => {
    expect(inkOn('not-a-colour')).toBe('#111')
  })

  it('keeps every palette colour readable', () => {
    for (const c of TAG_PALETTE) expect(contrast(c, inkOn(c)), c).toBeGreaterThanOrEqual(4.5)
  })

  it('round-trips through OKLCH', () => {
    for (const c of [...TAG_PALETTE, '#000000', '#ffffff']) expect(oklchToHex(hexToOklch(c))).toBe(c)
  })

  describe('phasePalette', () => {
    const dist = (a: string, b: string) => {
      const x = hexToOklch(a)
      const y = hexToOklch(b)
      const ab = (o: typeof x) => [o.l, o.c * Math.cos((o.h * Math.PI) / 180), o.c * Math.sin((o.h * Math.PI) / 180)]
      const [p, q] = [ab(x), ab(y)]
      return Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!)
    }

    it('uses the tag colour for focus and keeps every tone readable', () => {
      for (const seed of TAG_PALETTE) {
        const p = phasePalette(seed)
        expect(p.focus).toBe(seed)
        expect(contrast(p.focus, p.onFocus), seed).toBeGreaterThanOrEqual(4.5)
        expect(contrast(p.shortBreak, p.onShortBreak), seed).toBeGreaterThanOrEqual(4.5)
        expect(contrast(p.longBreak, p.onLongBreak), seed).toBeGreaterThanOrEqual(4.5)
      }
    })

    it('makes breaks clearly calmer than focus, but never plain white', () => {
      for (const seed of TAG_PALETTE) {
        const p = phasePalette(seed)
        expect(dist(p.focus, p.shortBreak), seed).toBeGreaterThan(0.06)
        expect(dist(p.shortBreak, p.longBreak), seed).toBeGreaterThan(0.02)
        expect(p.longBreak).not.toBe('#ffffff')
        expect(hexToOklch(p.longBreak).l).toBeLessThanOrEqual(0.96)
      }
    })

    it('keeps the hue of colourful tags', () => {
      for (const seed of ['#4d96ff', '#ff8a3d', '#3ddc97', '#6b2d5c']) {
        const h = hexToOklch(seed).h
        expect(Math.abs(hexToOklch(phasePalette(seed).shortBreak).h - h), seed).toBeLessThan(8)
      }
    })
  })
})
