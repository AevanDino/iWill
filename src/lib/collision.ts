import type { BlockMove, Minutes, TimeBlock } from '../types'

/**
 * Pure, deterministic collision engine.
 *
 * All functions take the committed block list and return a list of moves;
 * nothing is mutated. The store applies the moves as one atomic transaction,
 * and the UI calls the same functions on every pointer move to preview the
 * cascade before the gesture ends.
 */

export interface Bounds {
  start: Minutes
  end: Minutes
}

export interface ResolveOptions {
  bounds: Bounds
  /**
   * Earliest start a block may be pushed *up* to (e.g. "now" on today's
   * timeline, so future blocks aren't shoved into the past). A block that
   * can't be pushed up far enough is pushed down instead.
   */
  upFloor?: Minutes
  /**
   * `nearest` (default): colliding blocks that start above the pinned group
   * are pushed up, the rest down. `down`: everything is pushed below it —
   * used when dropping routines, which should never split what's above.
   */
  direction?: 'nearest' | 'down'
  /**
   * With `nearest`: split by block *centre* against this minute instead of
   * by start against the pinned start. Used to slot a dragged block in at
   * the seam nearest its middle.
   */
  pivot?: Minutes
}

export type ResolveFailure = {
  ok: false
  reason: 'blocked' | 'out-of-bounds' | 'invalid' | 'locked'
  /** The block that caused the failure, if any. */
  blockerId?: string
}

export type ResolveResult = { ok: true; moves: BlockMove[] } | ResolveFailure

interface Interval {
  id: string
  start: Minutes
  end: Minutes
}

export const isMovable = (b: Pick<TimeBlock, 'locked' | 'completed'>) => !b.locked && !b.completed

export const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && b.start < a.end

/**
 * Place `pinned` blocks at the given positions and displace every movable
 * block they collide with, cascading recursively.
 *
 * - Locked and completed blocks never move. A pinned block overlapping one
 *   is rejected (`blocked`); a displaced block hops over them.
 * - Colliding blocks that start before the pinned group are pushed up
 *   (falling back to down if they'd cross `upFloor`/the day start); the rest
 *   are pushed down. Relative order within each direction is preserved.
 * - If any block would leave `bounds`, the whole resolution fails so the
 *   caller can reject the gesture rather than apply a partial result.
 */
/** Checks shared by both resolvers: pinned blocks are sane, inside the day, and not on a fixed block. */
function checkPinned(blocks: readonly TimeBlock[], pinned: readonly BlockMove[], bounds: Bounds): ResolveFailure | null {
  for (const p of pinned) {
    if (p.end <= p.start) return { ok: false, reason: 'invalid', blockerId: p.id }
    if (p.start < bounds.start || p.end > bounds.end) return { ok: false, reason: 'out-of-bounds', blockerId: p.id }
  }
  for (let i = 0; i < pinned.length; i++)
    for (let j = i + 1; j < pinned.length; j++)
      if (overlaps(pinned[i]!, pinned[j]!)) return { ok: false, reason: 'invalid', blockerId: pinned[j]!.id }
  const pinnedIds = new Set(pinned.map((p) => p.id))
  const fixed = blocks.filter((b) => !pinnedIds.has(b.id) && !isMovable(b))
  for (const p of pinned) {
    const blocker = fixed.find((f) => overlaps(p, f))
    if (blocker) return { ok: false, reason: 'blocked', blockerId: blocker.id }
  }
  return null
}

const center = (b: { start: number; end: number }) => (b.start + b.end) / 2

export function resolveCollisions(
  blocks: readonly TimeBlock[],
  pinned: readonly BlockMove[],
  { bounds, upFloor = bounds.start, direction = 'nearest', pivot }: ResolveOptions,
): ResolveResult {
  if (pinned.length === 0) return { ok: true, moves: [] }
  const invalid = checkPinned(blocks, pinned, bounds)
  if (invalid) return invalid

  const pinnedIds = new Set(pinned.map((p) => p.id))
  const others = blocks.filter((b) => !pinnedIds.has(b.id))
  const fixed = others.filter((b) => !isMovable(b))

  const occupied: Interval[] = [...pinned, ...fixed.map(({ id, start, end }) => ({ id, start, end }))]
  const anchor = Math.min(...pinned.map((p) => p.start))
  const floor = Math.max(upFloor, bounds.start)

  const movable = others.filter(isMovable)
  const pushesUp = (b: TimeBlock) => direction === 'nearest' && (pivot != null ? center(b) < pivot : b.start < anchor)
  const upward = movable.filter(pushesUp).sort((a, b) => b.end - a.end || b.start - a.start)
  const downward = movable.filter((b) => !pushesUp(b))

  const placed = new Map<string, Interval>()

  // Upward pass: nearest-to-anchor first, so pushes ripple outwards.
  for (const b of upward) {
    const duration = b.end - b.start
    let end = b.end
    for (;;) {
      const hits = occupied.filter((o) => overlaps(o, { start: end - duration, end }))
      if (hits.length === 0) break
      // Anything straddling a gap it can't fit in must go above all hits.
      end = Math.min(...hits.map((h) => h.start))
    }
    if (end - duration < floor) {
      downward.push(b) // no room above — let it fall below instead
      continue
    }
    const slot = { id: b.id, start: end - duration, end }
    occupied.push(slot)
    placed.set(b.id, slot)
  }

  // Downward pass: earliest first, so order is preserved as blocks stack up.
  downward.sort((a, b) => a.start - b.start || a.end - b.end)
  for (const b of downward) {
    const duration = b.end - b.start
    let start = b.start
    for (;;) {
      const hits = occupied.filter((o) => overlaps(o, { start, end: start + duration }))
      if (hits.length === 0) break
      start = Math.max(...hits.map((h) => h.end))
    }
    if (start + duration > bounds.end) return { ok: false, reason: 'out-of-bounds', blockerId: b.id }
    const slot = { id: b.id, start, end: start + duration }
    occupied.push(slot)
    placed.set(b.id, slot)
  }

  const moves: BlockMove[] = pinned.map(({ id, start, end }) => ({ id, start, end }))
  for (const b of movable) {
    const slot = placed.get(b.id)!
    if (slot.start !== b.start) moves.push({ id: b.id, start: slot.start, end: slot.end })
  }
  return { ok: true, moves }
}

/**
 * Order-preserving push, for dragging blocks on the timeline: blocks are
 * solid, so nothing ever passes through a pinned block however far or fast
 * it moves. Every movable block keeps its place in the order of committed
 * centres; blocks before a pinned block are pushed up out of its way, blocks
 * after it pushed down. Locked/completed blocks stay put and are hopped over.
 *
 * Fails atomically: `out-of-bounds` when a pushed block would cross the day's
 * edges or `upFloor` (the caller treats that as a wall), `blocked` when a
 * pinned block lands on a fixed one or a block gets crushed between two
 * pinned ones.
 */
export function resolvePush(
  blocks: readonly TimeBlock[],
  pinned: readonly BlockMove[],
  { bounds, upFloor = bounds.start }: Pick<ResolveOptions, 'bounds' | 'upFloor'>,
): ResolveResult {
  if (pinned.length === 0) return { ok: true, moves: [] }
  const invalid = checkPinned(blocks, pinned, bounds)
  if (invalid) return invalid

  const pinnedById = new Map(pinned.map((p) => [p.id, p]))
  const fixed = blocks.filter((b) => !pinnedById.has(b.id) && !isMovable(b))
  const original = new Map(blocks.map((b) => [b.id, b]))

  interface Item extends Interval {
    rank: number
    pinned: boolean
  }
  const items: Item[] = [
    ...pinned.map((p) => ({ ...p, rank: center(original.get(p.id) ?? p), pinned: true })),
    ...blocks
      .filter((b) => !pinnedById.has(b.id) && isMovable(b))
      .map(({ id, start, end }) => ({ id, start, end, rank: center({ start, end }), pinned: false })),
  ].sort((a, b) => a.rank - b.rank || Number(b.pinned) - Number(a.pinned))

  const hitsFixed = (start: number, end: number) => fixed.filter((f) => overlaps(f, { start, end }))

  // Downward sweep: anything after a pinned block starts no earlier than the block before it ends.
  let floorLine = -Infinity
  for (const it of items) {
    if (!it.pinned && it.start < floorLine) {
      const duration = it.end - it.start
      let start = floorLine
      for (let hits = hitsFixed(start, start + duration); hits.length; hits = hitsFixed(start, start + duration))
        start = Math.max(...hits.map((h) => h.end))
      it.start = start
      it.end = start + duration
    }
    floorLine = Math.max(floorLine, it.end)
  }

  // Upward sweep: anything before a pinned block ends no later than the block after it starts.
  let ceil = Infinity
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!
    if (!it.pinned && it.end > ceil) {
      const duration = it.end - it.start
      let end = ceil
      for (let hits = hitsFixed(end - duration, end); hits.length; hits = hitsFixed(end - duration, end))
        end = Math.min(...hits.map((h) => h.start))
      it.start = end - duration
      it.end = end
    }
    ceil = Math.min(ceil, it.start)
  }

  // Squeezed from both sides: a block didn't fit between two pinned blocks.
  for (let i = 1; i < items.length; i++)
    if (items[i]!.start < items[i - 1]!.end) return { ok: false, reason: 'blocked', blockerId: items[i]!.id }

  const floor = Math.max(upFloor, bounds.start)
  const moves: BlockMove[] = pinned.map(({ id, start, end }) => ({ id, start, end }))
  for (const it of items) {
    if (it.pinned) continue
    const was = original.get(it.id)!
    if (it.start === was.start) continue
    if (it.start < bounds.start || it.end > bounds.end || (it.start < was.start && it.start < floor))
      return { ok: false, reason: 'out-of-bounds', blockerId: it.id }
    moves.push({ id: it.id, start: it.start, end: it.end })
  }
  return { ok: true, moves }
}

/** `ids` plus every block chained to them edge-to-edge (one's end is the next one's start). */
export function connectedChain(blocks: readonly TimeBlock[], ids: Iterable<string>): Set<string> {
  const out = new Set(ids)
  const queue = [...out]
  while (queue.length) {
    const id = queue.pop()
    const b = blocks.find((x) => x.id === id)
    if (!b) continue
    for (const o of blocks)
      if (!out.has(o.id) && (o.end === b.start || o.start === b.end)) {
        out.add(o.id)
        queue.push(o.id)
      }
  }
  return out
}

export type CapResult =
  | { ok: true; moves: BlockMove[]; freed: Minutes }
  | { ok: false; reason: 'not-found' | 'not-started' | 'immovable' }

/**
 * Finish a block early at `now` and pull the following movable blocks up by
 * the freed time. The pull stops at the first locked/completed block, since
 * pulling past it would make blocks leapfrog an anchor.
 */
export function computeCap(blocks: readonly TimeBlock[], id: string, now: Minutes): CapResult {
  const target = blocks.find((b) => b.id === id)
  if (!target) return { ok: false, reason: 'not-found' }
  if (target.completed) return { ok: false, reason: 'immovable' }
  if (now <= target.start) return { ok: false, reason: 'not-started' }

  const newEnd = Math.min(target.end, Math.max(target.start + 1, Math.round(now)))
  const freed = target.end - newEnd
  const moves: BlockMove[] = [{ id, start: target.start, end: newEnd }]
  if (freed <= 0) return { ok: true, moves, freed: 0 }

  const following = blocks
    .filter((b) => b.id !== id && b.start >= target.end)
    .sort((a, b) => a.start - b.start)

  for (const b of following) {
    if (!isMovable(b)) break
    moves.push({ id: b.id, start: b.start - freed, end: b.end - freed })
  }
  return { ok: true, moves, freed }
}

export function applyMoves<T extends TimeBlock>(blocks: readonly T[], moves: readonly BlockMove[]): T[] {
  if (moves.length === 0) return blocks.slice()
  const byId = new Map(moves.map((m) => [m.id, m]))
  return blocks.map((b) => {
    const m = byId.get(b.id)
    return m ? { ...b, start: m.start, end: m.end } : b
  })
}

/** The first gap of at least `duration` minutes at or after `from`. */
export function findFreeSlot(
  blocks: readonly TimeBlock[],
  duration: Minutes,
  from: Minutes,
  bounds: Bounds,
): Minutes | null {
  const sorted = [...blocks].sort((a, b) => a.start - b.start)
  let start = Math.max(from, bounds.start)
  for (const b of sorted) {
    if (b.end <= start) continue
    if (b.start >= start + duration) break
    start = Math.max(start, b.end)
  }
  return start + duration <= bounds.end ? start : null
}
