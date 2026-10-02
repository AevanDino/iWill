import { describe, expect, it } from 'vitest'
import type { Category, TimeBlock } from '../types'
import { findBreakOverflow, isBreakBlock } from './breaks'

const h = (hours: number, minutes = 0) => hours * 60 + minutes
const DAY = { start: h(6), end: h(24) }
const TAGS: Category[] = [
  { id: 'focus', name: 'Deep Work', color: '#b69cff' },
  { id: 'break', name: 'Break', color: '#3ddc97' },
  { id: 'chill', name: 'Rest', color: '#7fd8ff' },
]
function block(id: string, start: number, end: number, extra: Partial<TimeBlock> = {}): TimeBlock {
  return { id, date: '2026-10-02', title: id, categoryId: 'focus', start, end, completed: false, locked: false, ...extra }
}
const run = (blocks: TimeBlock[], breakStart: number, breakEnd: number) =>
  findBreakOverflow({ blocks, categories: TAGS, block: blocks[0]!, breakStart, breakEnd, bounds: DAY, breakBlockId: 'brk' })

describe('isBreakBlock', () => {
  it('knows breaks by tag or title', () => {
    expect(isBreakBlock(block('x', 0, 5, { categoryId: 'break' }), TAGS[1])).toBe(true)
    expect(isBreakBlock(block('x', 0, 5, { categoryId: 'chill' }), TAGS[2])).toBe(true)
    expect(isBreakBlock(block('Coffee break', 0, 5), TAGS[0])).toBe(true)
    expect(isBreakBlock(block('Breakfast meeting', 0, 5), TAGS[0])).toBe(false)
  })
})

describe('findBreakOverflow', () => {
  const day = () => [block('work', h(9), h(10)), block('next', h(10), h(11)), block('later', h(11), h(12))]

  it('ignores a break that fits inside its block', () => {
    expect(run(day(), h(9, 40), h(9, 45))).toBeNull()
  })

  it('measures how far a break runs into the next block', () => {
    const o = run(day(), h(10), h(10, 15))!
    expect(o).toMatchObject({ minutes: 15, from: h(10), to: h(10, 15), canShorten: true })
    expect(o.next.id).toBe('next')
    // pushing makes room: next and later move down 15 minutes
    expect(o.push.ok && o.push.moves.find((m) => m.id === 'next')).toMatchObject({ start: h(10, 15) })
    expect(o.push.ok && o.push.moves.find((m) => m.id === 'later')).toMatchObject({ start: h(11, 15) })
  })

  it('only counts the part after its own block', () => {
    expect(run(day(), h(9, 55), h(10, 10))).toMatchObject({ minutes: 10, from: h(10) })
  })

  it('lets a free gap absorb the break', () => {
    const blocks = [block('work', h(9), h(10)), block('next', h(10, 20), h(11))]
    expect(run(blocks, h(10), h(10, 15))).toBeNull()
    expect(run(blocks, h(10), h(10, 25))).toMatchObject({ minutes: 5 })
  })

  it('uses up a planned break block instead of counting it as lost', () => {
    const blocks = [block('work', h(9), h(10)), block('stretch', h(10), h(10, 5), { categoryId: 'break' }), block('next', h(10, 5), h(11))]
    expect(run(blocks, h(10), h(10, 5))).toBeNull()
    expect(run(blocks, h(10), h(10, 15))).toMatchObject({ minutes: 10, from: h(10, 5), to: h(10, 15) })
  })

  it("won't push or shorten a locked block", () => {
    const blocks = [block('work', h(9), h(10)), block('meeting', h(10), h(11), { locked: true })]
    const o = run(blocks, h(10), h(10, 15))!
    expect(o.push).toMatchObject({ ok: false, reason: 'blocked' })
    expect(o.canShorten).toBe(false)
    expect(o.shortenReason).toMatch(/locked/)
  })

  it("won't shorten a block below the minimum length", () => {
    const blocks = [block('work', h(9), h(10)), block('quick', h(10), h(10, 18))]
    expect(run(blocks, h(10), h(10, 15))).toMatchObject({ canShorten: false })
  })
})
