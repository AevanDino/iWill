import type { DateKey, Minutes } from '../types'

export const SNAP: Minutes = 15
export const MIN_DURATION: Minutes = 15

export const snap = (m: Minutes, step: Minutes = SNAP): Minutes => Math.round(m / step) * step

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * The run of grid slots between two points, both slots included — what a
 * press-and-drag on empty timeline selects, whichever way it goes.
 */
export function slotSpan(
  from: Minutes,
  to: Minutes,
  bounds: { start: Minutes; end: Minutes },
  step: Minutes = SNAP,
): { start: Minutes; end: Minutes } {
  const slot = (m: Minutes) => clamp(Math.floor(m / step) * step, bounds.start, bounds.end - step)
  const a = slot(from)
  const b = slot(to)
  return { start: Math.min(a, b), end: Math.max(a, b) + step }
}

export function formatTime(m: Minutes): string {
  const total = Math.round(m)
  const h = Math.floor(total / 60) % 24
  const min = total % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function formatDuration(m: Minutes): string {
  const total = Math.round(m)
  const h = Math.floor(total / 60)
  const min = total % 60
  if (h === 0) return `${min}m`
  return min === 0 ? `${h}h` : `${h}h ${min}m`
}

export function parseTime(value: string): Minutes | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 24 || m > 59 || (h === 24 && m !== 0)) return null
  return h * 60 + m
}

export function toDateKey(d: Date): DateKey {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

export function shiftDate(key: DateKey, days: number): DateKey {
  const d = fromDateKey(key)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

/** Fractional minutes since midnight for a timestamp. */
export function minutesOfDay(d: Date): Minutes {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / 60000
}

export function formatDateLabel(key: DateKey, today: DateKey): string {
  if (key === today) return 'Today'
  if (key === shiftDate(today, 1)) return 'Tomorrow'
  if (key === shiftDate(today, -1)) return 'Yesterday'
  return fromDateKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
