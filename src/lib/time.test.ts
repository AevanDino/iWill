import { describe, expect, it } from 'vitest'
import { ceilTo, formatDuration, formatTime, parseTime, shiftDate, slotSpan, snap } from './time'

describe('time helpers', () => {
  it('snaps to the chosen grid', () => {
    expect(snap(7, 15)).toBe(0)
    expect(snap(8, 15)).toBe(15)
    expect(snap(592, 15)).toBe(585)
    expect(snap(592, 5)).toBe(590)
    expect(snap(593, 5)).toBe(595)
    expect(snap(594, 10)).toBe(590)
    expect(ceilTo(541, 5)).toBe(545)
    expect(ceilTo(540, 10)).toBe(540)
  })

  it('formats and parses clock times', () => {
    expect(formatTime(570)).toBe('09:30')
    expect(formatTime(1440)).toBe('00:00')
    expect(parseTime('9:30')).toBe(570)
    expect(parseTime('24:00')).toBe(1440)
    expect(parseTime('24:30')).toBeNull()
    expect(parseTime('nope')).toBeNull()
  })

  it('formats durations', () => {
    expect(formatDuration(25)).toBe('25m')
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(95)).toBe('1h 35m')
  })

  it('shifts date keys across month boundaries', () => {
    expect(shiftDate('2026-09-30', 1)).toBe('2026-10-01')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('spans the slots between a press and a drag, in either direction', () => {
    const day = { start: 360, end: 1440 }
    // press and release in the same slot → that one slot
    expect(slotSpan(545, 551, day, 15)).toEqual({ start: 540, end: 555 })
    // dragging down includes the slot under the pointer
    expect(slotSpan(545, 631, day, 15)).toEqual({ start: 540, end: 645 })
    // dragging up keeps the pressed slot as the bottom
    expect(slotSpan(545, 482, day, 15)).toEqual({ start: 480, end: 555 })
    // never leaves the day
    expect(slotSpan(370, 100, day, 15)).toEqual({ start: 360, end: 375 })
    expect(slotSpan(1430, 2000, day, 15)).toEqual({ start: 1425, end: 1440 })
    // finer grids select finer slots
    expect(slotSpan(541, 541, day, 5)).toEqual({ start: 540, end: 545 })
    expect(slotSpan(541, 562, day, 10)).toEqual({ start: 540, end: 570 })
  })
})
