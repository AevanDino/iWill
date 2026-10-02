import { resolvePush, type Bounds, type ResolveResult } from './collision'
import { MIN_DURATION } from './time'
import type { Category, Minutes, TimeBlock } from '../types'

/** A tag meant for breaks: the seeded "Break" tag, or one named like it. */
export function isBreakTag(category: Category | undefined): boolean {
  return !!category && (category.id === 'break' || /\b(break|rest|pause)\b/i.test(category.name))
}

/** A block planned as a break, by its tag or its title. */
export function isBreakBlock(block: TimeBlock, category: Category | undefined): boolean {
  return isBreakTag(category) || /\bbreak\b/i.test(block.title)
}

export interface BreakOverflow {
  /** The block the break runs into. */
  next: TimeBlock
  /** How many minutes of it the break takes. */
  minutes: number
  /** Where a Break block covering the overflow would go, and its id. */
  breakBlockId: string
  from: Minutes
  to: Minutes
  /** The result of pushing the rest of the day down to make room for that Break block. */
  push: ResolveResult
  canShorten: boolean
  shortenReason?: string
}

/**
 * Does a Pomodoro break starting and ending at these times eat into the
 * next block? Only the part after the break's own block counts (the part
 * inside it is already budgeted), free gaps absorb it, and planned break
 * blocks in its way are used up by it rather than counted as lost. Returns
 * null when nothing needs resolving.
 */
export function findBreakOverflow({
  blocks,
  categories,
  block,
  breakStart,
  breakEnd,
  bounds,
  upFloor,
  breakBlockId,
}: {
  blocks: readonly TimeBlock[]
  categories: readonly Category[]
  block: TimeBlock
  breakStart: Minutes
  breakEnd: Minutes
  bounds: Bounds
  upFloor?: Minutes
  /** Id for the Break block that pushing would insert. */
  breakBlockId: string
}): BreakOverflow | null {
  let from = Math.max(breakStart, block.end)
  const tag = new Map(categories.map((c) => [c.id, c]))
  const ahead = blocks
    .filter((b) => b.id !== block.id && !b.completed && b.end > from && b.start < breakEnd)
    .sort((a, b) => a.start - b.start)

  let next: TimeBlock | undefined
  for (const b of ahead) {
    if (isBreakBlock(b, tag.get(b.categoryId))) {
      from = Math.max(from, b.end)
      continue
    }
    if (b.end > from) {
      next = b
      break
    }
  }
  if (!next || from >= breakEnd) return null
  // Whole minutes, without letting a few milliseconds of timer jitter round up to an extra one.
  const ceilMinute = (m: Minutes) => Math.ceil(m - 1 / 60)
  const minutes = ceilMinute(breakEnd - Math.max(next.start, from))
  if (minutes <= 0) return null

  const start = Math.round(from)
  const end = ceilMinute(breakEnd)
  const ghost: TimeBlock = { ...next, id: breakBlockId, title: 'Break', start, end, completed: false, locked: false }
  const push = resolvePush([...blocks, ghost], [{ id: breakBlockId, start, end }], { bounds, upFloor })

  let shortenReason: string | undefined
  if (next.locked) shortenReason = `🔒 “${next.title}” is locked`
  else if (next.end - end < MIN_DURATION) shortenReason = `“${next.title}” would be under ${MIN_DURATION} minutes`

  return { next, minutes, breakBlockId, from: start, to: end, push, canShorten: !shortenReason, shortenReason }
}
