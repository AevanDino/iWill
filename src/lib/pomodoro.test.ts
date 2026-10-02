import { describe, expect, it } from 'vitest'
import {
  advance,
  createSession,
  DEFAULT_POMODORO,
  estimatePomodoros,
  extraBreak,
  fitToBlock,
  formatClock,
  pause,
  recover,
  remainingMs,
  skip,
  start,
  tick,
  type PomodoroSession,
} from './pomodoro'

const C = DEFAULT_POMODORO
const MIN = 60_000
const T0 = 1_000_000

const fresh = () => createSession('b1', '2026-09-30', C, T0, 's1')

/** Run the current phase to completion and advance into the next one. */
function finishPhase(s: PomodoroSession, now: number) {
  const running = s.status === 'running' ? s : start(s, now)
  const done = tick(running, running.endsAt!)
  return { ...done, next: advance(done.session, C, running.endsAt!, true), at: running.endsAt! }
}

describe('pomodoro timer', () => {
  it('starts idle on a 25-minute focus, round 1', () => {
    const s = fresh()
    expect(s).toMatchObject({ phase: 'focus', status: 'idle', round: 1, remainingMs: 25 * MIN })
  })

  it('counts down from wall-clock time', () => {
    const s = start(fresh(), T0)
    expect(remainingMs(s, T0 + 10 * MIN)).toBe(15 * MIN)
    expect(formatClock(remainingMs(s, T0 + 10 * MIN + 500))).toBe('15:00')
    expect(formatClock(remainingMs(s, T0 + 10 * MIN + 1000))).toBe('14:59')
  })

  it('pauses and resumes without losing or gaining time', () => {
    let s = start(fresh(), T0)
    s = pause(s, T0 + 5 * MIN)
    expect(s).toMatchObject({ status: 'paused', remainingMs: 20 * MIN, pauses: 1 })
    // an hour later…
    s = start(s, T0 + 65 * MIN)
    expect(remainingMs(s, T0 + 70 * MIN)).toBe(15 * MIN)
  })

  it('completes a focus on the tick at/after endsAt and counts it', () => {
    const s = start(fresh(), T0)
    expect(tick(s, T0 + 25 * MIN - 1).finished).toBeNull()
    const r = tick(s, T0 + 25 * MIN)
    expect(r.finished).toBe('focus')
    expect(r.session).toMatchObject({ status: 'complete', completed: 1, focusMs: 25 * MIN })
  })

  it('follows the 4 × focus/short-break → long-break cycle, then wraps', () => {
    let s = fresh()
    let now = T0
    const phases: string[] = []
    for (let i = 0; i < 9; i++) {
      phases.push(`${s.phase}#${s.round}`)
      const r = finishPhase(s, now)
      s = r.next
      now = r.at
    }
    expect(phases).toEqual([
      'focus#1',
      'short-break#1',
      'focus#2',
      'short-break#2',
      'focus#3',
      'short-break#3',
      'focus#4',
      'long-break#4',
      'focus#1',
    ])
    expect(s.completed).toBe(5) // the five focus phases above
  })

  it('long break lasts 15 minutes', () => {
    let s = fresh()
    let now = T0
    for (let i = 0; i < 7; i++) ({ next: s, at: now } = finishPhase(s, now))
    expect(s).toMatchObject({ phase: 'long-break', durationMs: 15 * MIN })
  })

  it('skipping a focus does not count a Pomodoro but keeps the time spent', () => {
    const s = skip(start(fresh(), T0), C, T0 + 10 * MIN)
    expect(s).toMatchObject({ phase: 'short-break', status: 'running', completed: 0, focusMs: 10 * MIN })
  })

  it('skipping while idle moves on without starting', () => {
    expect(skip(fresh(), C, T0)).toMatchObject({ phase: 'short-break', status: 'idle' })
  })

  it('an extra break keeps the cycle position', () => {
    const done = tick(start(fresh(), T0), T0 + 25 * MIN).session
    const brk = extraBreak(done, C, T0 + 25 * MIN)
    expect(brk).toMatchObject({ phase: 'short-break', status: 'running', round: 1 })
    const afterBreak = advance(tick(brk, brk.endsAt!).session, C, brk.endsAt!, false)
    expect(afterBreak).toMatchObject({ phase: 'focus', round: 2 })
  })

  it('an extra break after a long break still restarts the cycle at #1', () => {
    const longBreak = { ...fresh(), phase: 'long-break' as const, round: 4, status: 'complete' as const }
    const brk = extraBreak(longBreak, C, T0)
    expect(advance(brk, C, T0, false)).toMatchObject({ phase: 'focus', round: 1 })
  })

  describe('recover after reload', () => {
    it('carries on seamlessly after a quick refresh', () => {
      const s = { ...start(fresh(), T0), updatedAt: T0 + 60_000 }
      expect(recover(s, T0 + 65_000)).toBe(s)
    })

    it('freezes at the last recorded second after a long absence', () => {
      const s = { ...start(fresh(), T0), updatedAt: T0 + 5 * MIN }
      const r = recover(s, T0 + 3 * 60 * MIN)
      expect(r).toMatchObject({ status: 'paused', remainingMs: 20 * MIN, interrupted: true, endsAt: null })
    })

    it('leaves paused sessions alone', () => {
      const s = pause(start(fresh(), T0), T0 + MIN)
      expect(recover(s, T0 + 999 * MIN)).toBe(s)
    })
  })

  it('estimates Pomodoros per block', () => {
    expect(estimatePomodoros(25, C)).toBe(1)
    expect(estimatePomodoros(60, C)).toBe(2)
    expect(estimatePomodoros(120, C)).toBe(4)
    expect(estimatePomodoros(10, C)).toBe(1)
  })

  it('shortens an unstarted focus to the time left in its block, never lengthening it', () => {
    expect(fitToBlock(fresh(), 10 * MIN)).toMatchObject({ durationMs: 10 * MIN, remainingMs: 10 * MIN })
    expect(fitToBlock(fresh(), 90 * MIN).durationMs).toBe(C.focusMin * MIN)
    // a focus already under way, or a break, is left alone
    const running = start(fresh(), T0)
    expect(fitToBlock(running, 10 * MIN)).toBe(running)
    const brk = advance(fresh(), C, T0, false)
    expect(fitToBlock(brk, MIN)).toBe(brk)
  })
})
