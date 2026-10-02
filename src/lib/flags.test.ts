import { describe, expect, it } from 'vitest'
import { layoutFlags } from './flags'

describe('layoutFlags', () => {
  it('centres flags on their slivers when they have room', () => {
    const tops = layoutFlags([{ id: 'a', center: 100 }, { id: 'b', center: 300 }], 20, 4, 0, 1000)
    expect(tops.get('a')).toBe(90)
    expect(tops.get('b')).toBe(290)
  })

  it('spreads a stack of flags apart, keeping their order', () => {
    // three 5-minute slivers back to back, ~7px apart
    const tops = layoutFlags(
      [{ id: 'c', center: 114 }, { id: 'a', center: 100 }, { id: 'b', center: 107 }],
      20,
      4,
      0,
      1000,
    )
    expect([tops.get('a'), tops.get('b'), tops.get('c')]).toEqual([90, 114, 138])
  })

  it('keeps a stack at the bottom inside the day', () => {
    const tops = layoutFlags([{ id: 'a', center: 995 }, { id: 'b', center: 998 }], 20, 4, 0, 1000)
    expect(tops.get('b')).toBe(980)
    expect(tops.get('a')).toBe(956)
  })
})
