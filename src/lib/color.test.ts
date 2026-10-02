import { describe, expect, it } from 'vitest'
import { contrast, inkOn, TAG_PALETTE } from './color'

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
})
