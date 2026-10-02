import type { DateKey } from '../types'

/**
 * Pure Pomodoro state machine.
 *
 * Time is tracked with wall-clock timestamps (`endsAt`) rather than by
 * decrementing a counter, so a throttled background tab or a slow tick can
 * never make the timer drift — every reader derives the same remaining time.
 */

export type Phase = 'focus' | 'short-break' | 'long-break'
export type TimerStatus = 'idle' | 'running' | 'paused' | 'complete' | 'ended'

export interface PomodoroConfig {
  focusMin: number
  shortBreakMin: number
  longBreakMin: number
  sessionsBeforeLong: number
  autoStart: boolean
  sound: boolean
  volume: number
  pulse: 'off' | 'subtle' | 'bold'
  /** What to do when a planned block starts and no timer is running. */
  autoFocus: 'off' | 'prompt' | 'auto'
}

export const DEFAULT_POMODORO: PomodoroConfig = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  sessionsBeforeLong: 4,
  autoStart: false,
  sound: false,
  volume: 0.4,
  pulse: 'subtle',
  autoFocus: 'prompt',
}

export const POMODORO_LIMITS = {
  focusMin: [5, 90],
  shortBreakMin: [1, 30],
  longBreakMin: [5, 45],
  sessionsBeforeLong: [2, 8],
} as const

export interface PomodoroSession {
  id: string
  /** Linked TimeBlock, or '' for an ad-hoc "quick focus" session. */
  blockId: string
  date: DateKey
  phase: Phase
  status: TimerStatus
  /** Which focus session of the cycle this is (1…sessionsBeforeLong). */
  round: number
  /** Focus sessions finished in this Pomodoro session. */
  completed: number
  durationMs: number
  /** Authoritative unless running; while running, derive from `endsAt`. */
  remainingMs: number
  endsAt: number | null
  /** When the current phase was first started (for the focus log). */
  phaseStartedAt: number | null
  /** Pauses during the current phase / across the whole session. */
  pauses: number
  totalPauses: number
  /** Focus time actually spent, in ms. */
  focusMs: number
  /** Set on reload when the timer was running while the app was closed. */
  interrupted?: boolean
  createdAt: number
  updatedAt: number
}

export const QUICK = ''

export function phaseMs(phase: Phase, c: PomodoroConfig): number {
  const min = phase === 'focus' ? c.focusMin : phase === 'short-break' ? c.shortBreakMin : c.longBreakMin
  return min * 60_000
}

export function createSession(
  blockId: string,
  date: DateKey,
  config: PomodoroConfig,
  now: number,
  id: string,
): PomodoroSession {
  const durationMs = phaseMs('focus', config)
  return {
    id,
    blockId,
    date,
    phase: 'focus',
    status: 'idle',
    round: 1,
    completed: 0,
    durationMs,
    remainingMs: durationMs,
    endsAt: null,
    phaseStartedAt: null,
    pauses: 0,
    totalPauses: 0,
    focusMs: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export function remainingMs(s: PomodoroSession, now: number): number {
  return s.status === 'running' && s.endsAt != null ? Math.max(0, s.endsAt - now) : s.remainingMs
}

export function progress(s: PomodoroSession, now: number): number {
  return s.durationMs > 0 ? 1 - remainingMs(s, now) / s.durationMs : 0
}

export function start(s: PomodoroSession, now: number): PomodoroSession {
  if (s.status !== 'idle' && s.status !== 'paused') return s
  return {
    ...s,
    status: 'running',
    endsAt: now + s.remainingMs,
    phaseStartedAt: s.phaseStartedAt ?? now,
    interrupted: false,
    updatedAt: now,
  }
}

export function pause(s: PomodoroSession, now: number): PomodoroSession {
  if (s.status !== 'running') return s
  return {
    ...s,
    status: 'paused',
    remainingMs: remainingMs(s, now),
    endsAt: null,
    pauses: s.pauses + 1,
    totalPauses: s.totalPauses + 1,
    updatedAt: now,
  }
}

export interface TickResult {
  session: PomodoroSession
  /** The phase that just finished on this tick, if any. */
  finished: Phase | null
}

export function tick(s: PomodoroSession, now: number): TickResult {
  if (s.status !== 'running' || s.endsAt == null || now < s.endsAt) return { session: s, finished: null }
  const wasFocus = s.phase === 'focus'
  return {
    finished: s.phase,
    session: {
      ...s,
      status: 'complete',
      remainingMs: 0,
      endsAt: null,
      completed: s.completed + (wasFocus ? 1 : 0),
      focusMs: s.focusMs + (wasFocus ? s.durationMs : 0),
      updatedAt: now,
    },
  }
}

/** The phase after the current one, following the classic 4×(25+5) → 15 cycle. */
export function nextPhase(s: Pick<PomodoroSession, 'phase' | 'round'>, c: PomodoroConfig): { phase: Phase; round: number } {
  if (s.phase === 'focus') return { phase: s.round >= c.sessionsBeforeLong ? 'long-break' : 'short-break', round: s.round }
  return { phase: 'focus', round: s.phase === 'long-break' || s.round >= c.sessionsBeforeLong ? 1 : s.round + 1 }
}

function enter(s: PomodoroSession, phase: Phase, round: number, c: PomodoroConfig, now: number, run: boolean) {
  const durationMs = phaseMs(phase, c)
  return {
    ...s,
    phase,
    round,
    status: run ? 'running' : 'idle',
    durationMs,
    remainingMs: durationMs,
    endsAt: run ? now + durationMs : null,
    phaseStartedAt: run ? now : null,
    pauses: 0,
    updatedAt: now,
  } satisfies PomodoroSession
}

/** Move on to the next phase (from "complete", or any time). */
export function advance(s: PomodoroSession, c: PomodoroConfig, now: number, run: boolean): PomodoroSession {
  const n = nextPhase(s, c)
  return enter(s, n.phase, n.round, c, now, run)
}

/** Skip the rest of this phase. A skipped focus doesn't count as a Pomodoro, but its time does. */
export function skip(s: PomodoroSession, c: PomodoroConfig, now: number): PomodoroSession {
  const spent = s.phase === 'focus' && s.status !== 'complete' ? s.durationMs - remainingMs(s, now) : 0
  const run = s.status === 'running'
  return advance({ ...s, focusMs: s.focusMs + spent }, c, now, run)
}

/**
 * Shorten an unstarted focus so it ends with its block: a block with 10
 * minutes left gets a 10-minute focus. Never lengthens past the configured
 * focus time, and leaves started or break phases alone.
 */
export function fitToBlock(s: PomodoroSession, blockLeftMs: number): PomodoroSession {
  if (s.phase !== 'focus' || s.status !== 'idle') return s
  const durationMs = Math.max(1000, Math.min(s.durationMs, Math.round(blockLeftMs)))
  return durationMs === s.durationMs ? s : { ...s, durationMs, remainingMs: durationMs }
}

/** Take (another) short break without advancing the cycle. */
export function extraBreak(s: PomodoroSession, c: PomodoroConfig, now: number): PomodoroSession {
  // After a long break the cycle has already wrapped — make the next focus #1.
  const round = s.phase === 'long-break' ? c.sessionsBeforeLong : s.round
  return enter(s, 'short-break', round, c, now, true)
}

/** Start a fresh 4-session cycle, keeping the running totals. */
export function newCycle(s: PomodoroSession, c: PomodoroConfig, now: number): PomodoroSession {
  return enter(s, 'focus', 1, c, now, true)
}

/** Re-apply durations after the config changes. Only an unstarted phase is resized. */
export function applyConfig(s: PomodoroSession, c: PomodoroConfig): PomodoroSession {
  if (s.status !== 'idle') return s
  const durationMs = phaseMs(s.phase, c)
  return { ...s, durationMs, remainingMs: durationMs }
}

/**
 * Bring a persisted session back after a reload. A quick refresh (within
 * `graceMs` of the last tick) carries on seamlessly; a longer absence
 * freezes the timer at the last recorded second and flags it so the user
 * can choose to resume or discard.
 */
export function recover(s: PomodoroSession, now: number, graceMs = 15_000): PomodoroSession {
  if (s.status !== 'running' || s.endsAt == null) return s
  if (now - s.updatedAt <= graceMs) return s
  return {
    ...s,
    status: 'paused',
    remainingMs: Math.max(0, s.endsAt - s.updatedAt),
    endsAt: null,
    interrupted: true,
  }
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Rough number of Pomodoros that fit in a block of `minutes`. */
export function estimatePomodoros(minutes: number, c: PomodoroConfig): number {
  return Math.max(1, Math.floor((minutes + c.shortBreakMin) / (c.focusMin + c.shortBreakMin)))
}

export const PHASE_LABEL: Record<Phase, string> = {
  focus: 'Focus',
  'short-break': 'Short break',
  'long-break': 'Long break',
}
