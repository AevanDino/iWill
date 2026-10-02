import type { Phase } from '../../lib/pomodoro'

export const PHASE_COLOR: Record<Phase, string> = {
  focus: 'var(--phase-focus)',
  'short-break': 'var(--phase-short)',
  'long-break': 'var(--phase-long)',
}

export const PHASE_SHOUT: Record<Phase, string> = {
  focus: 'FOCUS TIME',
  'short-break': 'BREAK TIME',
  'long-break': 'LONG BREAK',
}
