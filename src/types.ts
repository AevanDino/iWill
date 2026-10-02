/** Minutes since local midnight, e.g. 9:30 → 570. */
export type Minutes = number

/** Local calendar date as `YYYY-MM-DD`. */
export type DateKey = string

export interface TimeBlock {
  id: string
  date: DateKey
  title: string
  categoryId: string
  start: Minutes
  end: Minutes
  completed: boolean
  locked: boolean
  /** Epoch ms when the block was capped (finished early). */
  cappedAt?: number
  /** Pomodoro focus sessions completed inside this block. */
  pomodoros?: number
}

export interface Category {
  id: string
  name: string
  color: string
  emoji?: string
  /** Position in tag lists; the first tag is the default for new blocks. */
  order?: number
}

export interface RoutineStep {
  title: string
  categoryId: string
  duration: Minutes
}

export interface RoutineTemplate {
  id: string
  name: string
  emoji?: string
  steps: RoutineStep[]
}

export interface DayState {
  date: DateKey
  blocks: TimeBlock[]
  activeBlockId: string | null
  lastModified: number
}

export interface Settings {
  hourHeight: number
  dayStartHour: number
  dayEndHour: number
  notifications: boolean
}

/** A single position change produced by the collision engine. */
export interface BlockMove {
  id: string
  start: Minutes
  end: Minutes
}
