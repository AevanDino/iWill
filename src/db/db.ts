import Dexie, { type EntityTable } from 'dexie'
import type { PomodoroSession } from '../lib/pomodoro'
import type { Category, RoutineTemplate, TimeBlock } from '../types'

/** One finished focus session, kept for future insights. */
export interface FocusLogEntry {
  id: string
  sessionId: string
  blockId: string
  date: string
  startedAt: number
  endedAt: number
  durationMs: number
  pauses: number
}

export interface MetaRow {
  key: string
  value: unknown
}

export class IWillDB extends Dexie {
  blocks!: EntityTable<TimeBlock, 'id'>
  categories!: EntityTable<Category, 'id'>
  routines!: EntityTable<RoutineTemplate, 'id'>
  pomodoroSessions!: EntityTable<PomodoroSession, 'id'>
  focusLog!: EntityTable<FocusLogEntry, 'id'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor(name = 'iwill') {
    super(name)
    this.version(1).stores({
      blocks: 'id, date, [date+start], [date+end]',
      categories: 'id',
      routines: 'id',
    })
    this.version(2).stores({
      pomodoroSessions: 'id, [blockId+date], date, status',
      focusLog: 'id, sessionId, blockId, date',
      meta: 'key',
    })
  }
}

export const db = new IWillDB()
