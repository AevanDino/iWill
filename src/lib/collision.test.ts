import { describe, expect, it } from 'vitest'
import type { BlockMove, TimeBlock } from '../types'
import { applyMoves, computeCap, connectedChain, findFreeSlot, resolveCollisions, resolvePush } from './collision'

const DAY = { start: 6 * 60, end: 24 * 60 }
const h = (hours: number, minutes = 0) => hours * 60 + minutes

function block(id: string, start: number, end: number, extra: Partial<TimeBlock> = {}): TimeBlock {
  return { id, date: '2026-09-30', title: id, categoryId: 'c', start, end, completed: false, locked: false, ...extra }
}

const pin = (id: string, start: number, end: number): BlockMove => ({ id, start, end })

function positions(blocks: TimeBlock[], moves: BlockMove[]) {
  return Object.fromEntries(applyMoves(blocks, moves).map((b) => [b.id, [b.start, b.end]]))
}

function resolveOk(blocks: TimeBlock[], pinned: BlockMove[], upFloor?: number) {
  const r = resolveCollisions(blocks, pinned, { bounds: DAY, upFloor })
  if (!r.ok) throw new Error(`expected ok, got ${r.reason} (${r.blockerId})`)
  return r.moves
}

describe('resolveCollisions', () => {
  it('returns only the pinned move when nothing collides', () => {
    const blocks = [block('a', h(9), h(10)), block('b', h(12), h(13))]
    expect(resolveOk(blocks, [pin('a', h(10), h(11))])).toEqual([pin('a', h(10), h(11))])
  })

  it('pushes an overlapped block down', () => {
    const blocks = [block('a', h(8), h(9)), block('b', h(10), h(11))]
    const moves = resolveOk(blocks, [pin('a', h(9, 30), h(10, 30))])
    expect(positions(blocks, moves).b).toEqual([h(10, 30), h(11, 30)])
  })

  it('cascades recursively through touching blocks', () => {
    const blocks = [block('a', h(7), h(8)), block('b', h(9), h(10)), block('c', h(10), h(11)), block('d', h(11), h(12))]
    const moves = resolveOk(blocks, [pin('a', h(8, 30), h(9, 30))])
    const p = positions(blocks, moves)
    expect(p.b).toEqual([h(9, 30), h(10, 30)])
    expect(p.c).toEqual([h(10, 30), h(11, 30)])
    expect(p.d).toEqual([h(11, 30), h(12, 30)])
  })

  it('stops cascading once a gap absorbs the push', () => {
    const blocks = [block('a', h(6), h(7, 30)), block('b', h(9), h(10)), block('c', h(11), h(12))]
    // small push: the 10:00–11:00 gap absorbs it, c stays put
    const small = resolveOk(blocks, [pin('a', h(8), h(9, 30))])
    expect(small.map((m) => m.id).sort()).toEqual(['a', 'b'])
    expect(positions(blocks, small).b).toEqual([h(9, 30), h(10, 30)])

    // bigger push: b overflows the gap and knocks c down
    const big = resolveOk(blocks, [pin('a', h(9), h(10, 30))])
    expect(positions(blocks, big).b).toEqual([h(10, 30), h(11, 30)])
    expect(positions(blocks, big).c).toEqual([h(11, 30), h(12, 30)])
  })

  it('pushes blocks that start above the pinned block upward', () => {
    const blocks = [block('a', h(8), h(9)), block('b', h(10), h(11))]
    // drag a down so it covers the bottom half of b
    const moves = resolveOk(blocks, [pin('a', h(10, 30), h(11, 30))])
    expect(positions(blocks, moves).b).toEqual([h(9, 30), h(10, 30)])
  })

  it('cascades upward too', () => {
    const blocks = [block('x', h(8), h(9)), block('y', h(9), h(10)), block('a', h(14), h(15))]
    const moves = resolveOk(blocks, [pin('a', h(9, 30), h(10, 30))])
    const p = positions(blocks, moves)
    expect(p.y).toEqual([h(8, 30), h(9, 30)])
    expect(p.x).toEqual([h(7, 30), h(8, 30)])
  })

  it('falls back to pushing down when there is no room above the floor', () => {
    const blocks = [block('b', h(10), h(11)), block('a', h(14), h(15))]
    const moves = resolveOk(blocks, [pin('a', h(10, 30), h(11, 30))], h(10))
    expect(positions(blocks, moves).b).toEqual([h(11, 30), h(12, 30)])
  })

  it('pushes everything down in "down" mode, keeping order', () => {
    const blocks = [block('b', h(9), h(10)), block('c', h(10), h(11))]
    const r = resolveCollisions(blocks, [pin('r', h(9, 30), h(10, 30))], { bounds: DAY, direction: 'down' })
    if (!r.ok) throw new Error(r.reason)
    const p = positions([...blocks, block('r', 0, 1)], r.moves)
    expect(p.b).toEqual([h(10, 30), h(11, 30)])
    expect(p.c).toEqual([h(11, 30), h(12, 30)])
  })

  it('never moves locked or completed blocks and hops displaced blocks over them', () => {
    const blocks = [
      block('a', h(7), h(8)),
      block('b', h(9), h(10)),
      block('lock', h(10), h(11), { locked: true }),
      block('done', h(11), h(11, 30), { completed: true }),
      block('c', h(11, 30), h(12)),
    ]
    const moves = resolveOk(blocks, [pin('a', h(9), h(10))])
    const p = positions(blocks, moves)
    expect(p.lock).toEqual([h(10), h(11)])
    expect(p.done).toEqual([h(11), h(11, 30)])
    expect(p.b).toEqual([h(11, 30), h(12, 30)])
    expect(p.c).toEqual([h(12, 30), h(13)])
  })

  it('rejects a pinned block that overlaps a locked block', () => {
    const blocks = [block('a', h(7), h(8)), block('lock', h(9), h(10), { locked: true })]
    expect(resolveCollisions(blocks, [pin('a', h(9, 30), h(10, 30))], { bounds: DAY })).toEqual({
      ok: false,
      reason: 'blocked',
      blockerId: 'lock',
    })
  })

  it('treats touching (end === start) as not colliding', () => {
    const blocks = [block('a', h(7), h(8)), block('b', h(10), h(11))]
    expect(resolveOk(blocks, [pin('a', h(9), h(10))])).toHaveLength(1)
  })

  it('fails atomically when the cascade would pass the end of the day', () => {
    const blocks = [block('a', h(7), h(8)), block('b', h(22), h(23)), block('c', h(23), h(24))]
    const r = resolveCollisions(blocks, [pin('a', h(22), h(23))], { bounds: DAY })
    expect(r).toMatchObject({ ok: false, reason: 'out-of-bounds', blockerId: 'c' })
  })

  it('rejects pinned blocks outside the bounds', () => {
    const r = resolveCollisions([block('a', h(7), h(8))], [pin('a', h(23, 30), h(24, 30))], { bounds: DAY })
    expect(r).toMatchObject({ ok: false, reason: 'out-of-bounds', blockerId: 'a' })
  })

  it('places a multi-block routine and pushes conflicts below it', () => {
    const blocks = [block('b', h(9), h(10)), block('c', h(10), h(10, 30))]
    const routine = [pin('r1', h(9), h(9, 15)), pin('r2', h(9, 15), h(9, 45)), pin('r3', h(9, 45), h(10))]
    const moves = resolveOk(blocks, routine)
    const p = positions(blocks, moves)
    expect(p.b).toEqual([h(10), h(11)])
    expect(p.c).toEqual([h(11), h(11, 30)])
    expect(moves.slice(0, 3)).toEqual(routine)
  })

  it('preserves the relative order of displaced blocks', () => {
    const blocks = [block('b', h(9), h(9, 15)), block('c', h(9, 15), h(9, 30)), block('d', h(9, 30), h(9, 45)), block('a', h(15), h(16))]
    const moves = resolveOk(blocks, [pin('a', h(9), h(10))])
    const after = applyMoves(blocks, moves)
      .filter((b) => b.id !== 'a')
      .sort((x, y) => x.start - y.start)
    expect(after.map((b) => b.id)).toEqual(['b', 'c', 'd'])
  })

  it('leaves no overlaps between any blocks after resolution', () => {
    // pseudo-random but deterministic stress test
    let seed = 42
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let run = 0; run < 200; run++) {
      const blocks: TimeBlock[] = []
      let t = h(6)
      for (let i = 0; i < 12; i++) {
        t += Math.floor(rand() * 4) * 15
        const dur = (1 + Math.floor(rand() * 4)) * 15
        blocks.push(block(`b${i}`, t, t + dur, { locked: rand() < 0.1 }))
        t += dur
      }
      const target = blocks[Math.floor(rand() * blocks.length)]!
      if (target.locked) continue
      const start = h(6) + Math.floor(rand() * 40) * 15
      const r = resolveCollisions(blocks, [pin(target.id, start, start + (target.end - target.start))], {
        bounds: DAY,
      })
      if (!r.ok) continue
      const after = applyMoves(blocks, r.moves).sort((a, b) => a.start - b.start)
      for (let i = 1; i < after.length; i++) expect(after[i]!.start).toBeGreaterThanOrEqual(after[i - 1]!.end)
      for (const b of after) expect(b.end - b.start).toBe(blocks.find((x) => x.id === b.id)!.end - blocks.find((x) => x.id === b.id)!.start)
    }
  })
})

describe('resolveCollisions with a pivot', () => {
  it('slots a block in at the seam nearest its centre', () => {
    const blocks = [block('a', h(9), h(10)), block('b', h(10), h(11)), block('c', h(11), h(12)), block('d', h(12), h(13))]
    // d centred on the b|c seam: b goes up, c goes down
    const r = resolveCollisions(blocks, [pin('d', h(10, 30), h(11, 30))], { bounds: DAY, pivot: h(11) })
    if (!r.ok) throw new Error(r.reason)
    const order = applyMoves(blocks, r.moves)
      .sort((x, y) => x.start - y.start)
      .map((b) => b.id)
    expect(order).toEqual(['a', 'b', 'd', 'c'])
  })
})

describe('resolvePush', () => {
  function pushOk(blocks: TimeBlock[], pinned: BlockMove[], upFloor?: number) {
    const r = resolvePush(blocks, pinned, { bounds: DAY, upFloor })
    if (!r.ok) throw new Error(`expected ok, got ${r.reason} (${r.blockerId})`)
    return positions(blocks, r.moves)
  }
  const chain = () => [block('a', h(9), h(10)), block('b', h(10), h(11)), block('c', h(11), h(12)), block('d', h(12), h(13))]

  it('pushes the whole chain ahead of a block dragged far up, never passing through', () => {
    const p = pushOk(chain(), [pin('d', h(10), h(11))])
    expect(p).toEqual({ a: [h(7), h(8)], b: [h(8), h(9)], c: [h(9), h(10)], d: [h(10), h(11)] })
  })

  it('pushes blocks below down', () => {
    const p = pushOk(chain(), [pin('a', h(9, 30), h(10, 30))])
    expect(p.b).toEqual([h(10, 30), h(11, 30)])
    expect(p.d).toEqual([h(12, 30), h(13, 30)])
  })

  it('leaves blocks past a gap alone', () => {
    const blocks = [block('x', h(6), h(7)), ...chain()]
    const p = pushOk(blocks, [pin('d', h(11, 45), h(12, 45))])
    expect(p.a).toEqual([h(8, 45), h(9, 45)])
    expect(p.x).toEqual([h(6), h(7)])
  })

  it('moves a group around an unselected block between its members', () => {
    // a and c selected, b sits between them; drag the pair up 15 minutes
    const p = pushOk(chain(), [pin('a', h(8, 45), h(9, 45)), pin('c', h(10, 45), h(11, 45))])
    expect(p.b).toEqual([h(9, 45), h(10, 45)])
    expect(p.d).toEqual([h(12), h(13)])
  })

  it('stops at the wall instead of reordering', () => {
    const blocks = [block('a', h(6), h(7)), block('b', h(7), h(8))]
    expect(resolvePush(blocks, [pin('b', h(6, 30), h(7, 30))], { bounds: DAY })).toMatchObject({
      ok: false,
      reason: 'out-of-bounds',
      blockerId: 'a',
    })
    // "now" is a wall too
    expect(resolvePush(chain(), [pin('b', h(9, 30), h(10, 30))], { bounds: DAY, upFloor: h(9) })).toMatchObject({
      ok: false,
      reason: 'out-of-bounds',
    })
  })

  it('hops pushed blocks over locked ones and rejects landing on them', () => {
    const blocks = [block('a', h(9), h(10)), block('lock', h(8), h(9), { locked: true }), block('b', h(10), h(11))]
    const p = pushOk(blocks, [pin('b', h(9, 30), h(10, 30))])
    expect(p.lock).toEqual([h(8), h(9)])
    expect(p.a).toEqual([h(7), h(8)])
    expect(resolvePush(blocks, [pin('b', h(8, 30), h(9, 30))], { bounds: DAY })).toMatchObject({
      ok: false,
      reason: 'blocked',
      blockerId: 'lock',
    })
  })

  it('never overlaps blocks or changes the order of movable ones', () => {
    let seed = 7
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let run = 0; run < 300; run++) {
      const blocks: TimeBlock[] = []
      let t = h(6)
      for (let i = 0; i < 12; i++) {
        t += Math.floor(rand() * 4) * 15
        const dur = (1 + Math.floor(rand() * 4)) * 15
        blocks.push(block(`b${i}`, t, t + dur, { locked: rand() < 0.1 }))
        t += dur
      }
      const target = blocks[Math.floor(rand() * blocks.length)]!
      if (target.locked) continue
      const start = h(6) + Math.floor(rand() * 40) * 15
      const r = resolvePush(blocks, [pin(target.id, start, start + (target.end - target.start))], { bounds: DAY })
      if (!r.ok) continue
      const after = applyMoves(blocks, r.moves).sort((a, b) => a.start - b.start)
      for (let i = 1; i < after.length; i++) expect(after[i]!.start).toBeGreaterThanOrEqual(after[i - 1]!.end)
      const movable = (list: TimeBlock[]) => list.filter((b) => !b.locked && b.id !== target.id).map((b) => b.id)
      expect(movable(after)).toEqual(movable(blocks))
    }
  })
})

describe('connectedChain', () => {
  it('follows touching edges both ways and stops at gaps', () => {
    const blocks = [...[block('a', h(9), h(10)), block('b', h(10), h(11)), block('c', h(11), h(12))], block('far', h(13), h(14))]
    expect([...connectedChain(blocks, ['b'])].sort()).toEqual(['a', 'b', 'c'])
    expect([...connectedChain(blocks, ['far'])]).toEqual(['far'])
  })
})

describe('computeCap', () => {
  it('ends the block now and pulls following blocks up by the freed time', () => {
    const blocks = [block('a', h(10), h(11)), block('b', h(11), h(12)), block('c', h(13), h(14))]
    const r = computeCap(blocks, 'a', h(10, 35))
    expect(r).toMatchObject({ ok: true, freed: 25 })
    if (!r.ok) return
    const p = positions(blocks, r.moves)
    expect(p.a).toEqual([h(10), h(10, 35)])
    expect(p.b).toEqual([h(10, 35), h(11, 35)])
    expect(p.c).toEqual([h(12, 35), h(13, 35)])
  })

  it('stops pulling at the first locked or completed block', () => {
    const blocks = [
      block('a', h(10), h(11)),
      block('b', h(11), h(12)),
      block('lock', h(12), h(13), { locked: true }),
      block('c', h(13), h(14)),
    ]
    const r = computeCap(blocks, 'a', h(10, 30))
    if (!r.ok) throw new Error()
    expect(r.moves.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('ignores blocks before the capped block', () => {
    const blocks = [block('early', h(8), h(9)), block('a', h(10), h(11))]
    const r = computeCap(blocks, 'a', h(10, 30))
    if (!r.ok) throw new Error()
    expect(r.moves.map((m) => m.id)).toEqual(['a'])
  })

  it('refuses to cap a block that has not started', () => {
    expect(computeCap([block('a', h(10), h(11))], 'a', h(9, 59))).toEqual({ ok: false, reason: 'not-started' })
  })

  it('frees nothing when capped at or after its end', () => {
    const r = computeCap([block('a', h(10), h(11)), block('b', h(11), h(12))], 'a', h(11, 5))
    expect(r).toEqual({ ok: true, moves: [pin('a', h(10), h(11))], freed: 0 })
  })
})

describe('findFreeSlot', () => {
  const blocks = [block('a', h(9), h(10)), block('b', h(10), h(10, 30)), block('c', h(11), h(12))]

  it('finds the first gap big enough', () => {
    expect(findFreeSlot(blocks, 30, h(9), DAY)).toBe(h(10, 30))
    expect(findFreeSlot(blocks, 45, h(9), DAY)).toBe(h(12))
  })

  it('returns the start time when it is already free', () => {
    expect(findFreeSlot(blocks, 60, h(7), DAY)).toBe(h(7))
  })

  it('returns null when nothing fits before the end of the day', () => {
    expect(findFreeSlot(blocks, 120, h(23), DAY)).toBeNull()
  })
})
