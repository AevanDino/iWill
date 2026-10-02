import { create } from 'zustand'
import { db as defaultDb, type IWillDB } from '../db/db'
import { DEFAULT_CATEGORIES, DEFAULT_ROUTINES } from '../db/seed'
import {
  applyMoves,
  computeCap,
  resolveCollisions,
  resolvePush,
  type Bounds,
  type ResolveOptions,
  type ResolveResult,
} from '../lib/collision'
import { newId } from '../lib/id'
import { DEFAULT_GRID, minutesOfDay, snap, toDateKey } from '../lib/time'
import type { BlockMove, Category, DateKey, Minutes, RoutineTemplate, Settings, TimeBlock } from '../types'

export type Theme = 'system' | 'light' | 'dark'
export type AppSettings = Settings & { theme: Theme }

export const DEFAULT_SETTINGS: AppSettings = {
  hourHeight: 80,
  dayStartHour: 6,
  dayEndHour: 24,
  notifications: false,
  grid: DEFAULT_GRID,
  theme: 'system',
}

const SETTINGS_KEY = 'iwill:settings'

function loadSettings(): AppSettings {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(s: AppSettings) {
  try {
    globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // storage unavailable (private mode) — settings just won't persist
  }
}

export type SaveCategoryResult = { ok: true; category: Category } | { ok: false; reason: string }

export const TAG_NAME_MAX = 24

/** Tag list order: explicit `order`, then the seed order for tags saved before `order` existed. */
export function sortCategories(categories: Category[]): Category[] {
  const rank = (c: Category) => {
    const seed = DEFAULT_CATEGORIES.findIndex((d) => d.id === c.id)
    return c.order ?? (seed < 0 ? Number.MAX_SAFE_INTEGER : seed)
  }
  return [...categories].sort((a, b) => rank(a) - rank(b))
}

export interface NewBlock {
  title?: string
  categoryId?: string
  start: Minutes
  end: Minutes
}

export interface AppState {
  hydrated: boolean
  date: DateKey
  blocks: TimeBlock[]
  categories: Category[]
  routines: RoutineTemplate[]
  settings: AppSettings
  lastModified: number
  /** Block with a live Pomodoro session — highlighted on the timeline, still fully editable. */
  focusBlockId: string | null

  hydrate(): Promise<void>
  setDate(date: DateKey): Promise<void>
  updateSettings(patch: Partial<AppSettings>): void

  addBlock(input: NewBlock): { result: ResolveResult; id: string }
  updateBlock(id: string, patch: Partial<Pick<TimeBlock, 'title' | 'categoryId'>>): void
  moveBlock(id: string, start: Minutes, end: Minutes): ResolveResult
  applyMoves(moves: BlockMove[]): void
  deleteBlock(id: string): void
  /** Move several blocks by the same amount, pushing others out of the way (order-preserving). */
  moveGroup(ids: readonly string[], delta: Minutes): ResolveResult
  setMany(ids: readonly string[], patch: Partial<Pick<TimeBlock, 'locked' | 'completed'>>): void
  deleteBlocks(ids: readonly string[]): void
  toggleComplete(id: string): void
  toggleLock(id: string): void
  capBlock(id: string, now?: Date): ReturnType<typeof computeCap>
  startNow(id: string, now?: Date): ResolveResult
  spawnRoutine(routineId: string, start: Minutes): ResolveResult
  /** Push a block's end out by `minutes` (re-opening it if it already ended); later blocks cascade down. */
  extendBlock(id: string, minutes: Minutes, now?: Date): ResolveResult
  addPomodoro(blockId: string): void
  setFocusBlock(id: string | null): void

  saveRoutine(routine: Omit<RoutineTemplate, 'id'> & { id?: string }): void
  deleteRoutine(id: string): void

  /** Create or update a tag. Names are trimmed and must be unique (ignoring case). */
  saveCategory(input: Omit<Category, 'id' | 'order'> & { id?: string }): SaveCategoryResult
  /** Delete a tag, moving its blocks (on every day) and routine steps to `replacementId`. Resolves false if refused. */
  deleteCategory(id: string, replacementId: string): Promise<boolean>
}

export const boundsOf = (s: Pick<Settings, 'dayStartHour' | 'dayEndHour'>): Bounds => ({
  start: s.dayStartHour * 60,
  end: s.dayEndHour * 60,
})

/** Collision options for the timeline currently on screen. */
export function resolveOptionsFor(state: Pick<AppState, 'date' | 'settings'>, now = new Date()): ResolveOptions {
  const bounds = boundsOf(state.settings)
  // On today's timeline, don't shove future blocks into the past.
  const upFloor = state.date === toDateKey(now) ? Math.ceil(minutesOfDay(now)) : bounds.start
  return { bounds, upFloor }
}

export function createAppStore(database: IWillDB = defaultDb, { sync = false } = {}) {
  // Other tabs reload the day (or the tags) when this one writes them.
  const channel = sync && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`${database.name}:blocks`) : null

  /** Write every changed row for one user action in a single transaction. */
  function persist(put: TimeBlock[], remove: string[] = []) {
    const dates = new Set([...put.map((b) => b.date)])
    return database
      .transaction('rw', database.blocks, async () => {
        if (put.length) await database.blocks.bulkPut(put)
        if (remove.length) await database.blocks.bulkDelete(remove)
      })
      .then(() => {
        for (const date of dates) channel?.postMessage({ date })
        if (remove.length) channel?.postMessage({ date: null })
      })
      .catch((err) => console.error('[iwill] failed to persist blocks', err))
  }

  const store = create<AppState>()((set, get) => {
    /** Replace the in-memory blocks and persist only the rows that changed. */
    function commit(next: TimeBlock[], removed: string[] = []) {
      const prev = new Map(get().blocks.map((b) => [b.id, b]))
      const changed = next.filter((b) => prev.get(b.id) !== b)
      set({ blocks: next, lastModified: Date.now() })
      void persist(changed, removed)
    }

    function patchBlock(id: string, patch: Partial<TimeBlock>) {
      commit(get().blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)))
    }

    return {
      hydrated: false,
      date: toDateKey(new Date()),
      blocks: [],
      categories: [],
      routines: [],
      settings: loadSettings(),
      lastModified: 0,
      focusBlockId: null,

      async hydrate() {
        let [categories, routines] = await Promise.all([database.categories.toArray(), database.routines.toArray()])
        if (categories.length === 0) {
          await database.transaction('rw', database.categories, database.routines, async () => {
            await database.categories.bulkPut(DEFAULT_CATEGORIES)
            if (routines.length === 0) await database.routines.bulkPut(DEFAULT_ROUTINES)
          })
          categories = DEFAULT_CATEGORIES
          if (routines.length === 0) routines = DEFAULT_ROUTINES
        }
        const blocks = await database.blocks.where('date').equals(get().date).toArray()
        set({ categories: sortCategories(categories), routines, blocks, hydrated: true })
      },

      async setDate(date) {
        set({ date })
        const blocks = await database.blocks.where('date').equals(date).toArray()
        // Ignore stale loads if the user flipped days quickly.
        if (get().date === date) set({ blocks })
      },

      updateSettings(patch) {
        const settings = { ...get().settings, ...patch }
        saveSettings(settings)
        set({ settings })
      },

      addBlock({ title = 'New block', categoryId, start, end }) {
        const state = get()
        const id = newId()
        const block: TimeBlock = {
          id,
          date: state.date,
          title,
          categoryId: categoryId ?? state.categories[0]?.id ?? 'focus',
          start,
          end,
          completed: false,
          locked: false,
        }
        const withNew = [...state.blocks, block]
        const result = resolveCollisions(withNew, [{ id, start, end }], resolveOptionsFor(state))
        if (result.ok) commit(applyMoves(withNew, result.moves))
        return { result, id }
      },

      updateBlock(id, patch) {
        patchBlock(id, patch)
      },

      moveBlock(id, start, end) {
        const state = get()
        const result = resolveCollisions(state.blocks, [{ id, start, end }], resolveOptionsFor(state))
        if (result.ok) commit(applyMoves(state.blocks, result.moves))
        return result
      },

      applyMoves(moves) {
        commit(applyMoves(get().blocks, moves))
      },

      deleteBlock(id) {
        commit(
          get().blocks.filter((b) => b.id !== id),
          [id],
        )
      },

      moveGroup(ids, delta) {
        const state = get()
        const group = state.blocks.filter((b) => ids.includes(b.id))
        if (group.length === 0) return { ok: false, reason: 'invalid' }
        const locked = group.find((b) => b.locked)
        if (locked) return { ok: false, reason: 'locked', blockerId: locked.id }
        const pinned = group.map((b) => ({ id: b.id, start: b.start + delta, end: b.end + delta }))
        const result = resolvePush(state.blocks, pinned, resolveOptionsFor(state))
        if (result.ok) commit(applyMoves(state.blocks, result.moves))
        return result
      },

      setMany(ids, patch) {
        const set = new Set(ids)
        commit(get().blocks.map((b) => (set.has(b.id) ? { ...b, ...patch } : b)))
      },

      deleteBlocks(ids) {
        const set = new Set(ids)
        commit(
          get().blocks.filter((b) => !set.has(b.id)),
          [...set],
        )
      },

      toggleComplete(id) {
        const b = get().blocks.find((x) => x.id === id)
        if (b) patchBlock(id, { completed: !b.completed })
      },

      toggleLock(id) {
        const b = get().blocks.find((x) => x.id === id)
        if (b) patchBlock(id, { locked: !b.locked })
      },

      capBlock(id, now = new Date()) {
        const result = computeCap(get().blocks, id, minutesOfDay(now))
        if (result.ok) {
          const moved = applyMoves(get().blocks, result.moves)
          commit(moved.map((b) => (b.id === id ? { ...b, completed: true, cappedAt: now.getTime() } : b)))
        }
        return result
      },

      startNow(id, now = new Date()) {
        const state = get()
        const nowMin = Math.round(minutesOfDay(now))
        let blocks = state.blocks
        const target = blocks.find((b) => b.id === id)
        if (!target) return { ok: false, reason: 'invalid' }

        // Finishing whatever is running first — that alone may pull the
        // target up to "now" if it's next in line.
        const running = blocks.find((b) => b.id !== id && !b.completed && b.start <= nowMin && nowMin < b.end)
        const capMoves: BlockMove[] = []
        if (running) {
          const cap = computeCap(blocks, running.id, minutesOfDay(now))
          if (cap.ok) {
            capMoves.push(...cap.moves)
            blocks = applyMoves(blocks, cap.moves).map((b) =>
              b.id === running.id ? { ...b, completed: true, cappedAt: now.getTime() } : b,
            )
          }
        }

        const current = blocks.find((b) => b.id === id)!
        const duration = current.end - current.start
        const result = resolveCollisions(blocks, [{ id, start: nowMin, end: nowMin + duration }], {
          ...resolveOptionsFor(state, now),
          upFloor: nowMin,
        })
        if (!result.ok) return result
        commit(applyMoves(blocks, result.moves))
        return { ok: true, moves: [...capMoves, ...result.moves] }
      },

      spawnRoutine(routineId, start) {
        const state = get()
        const routine = state.routines.find((r) => r.id === routineId)
        if (!routine || routine.steps.length === 0) return { ok: false, reason: 'invalid' }
        const spawned = routineToBlocks(routine, start, state.date, state.settings.grid)
        const withNew = [...state.blocks, ...spawned]
        const result = resolveCollisions(
          withNew,
          spawned.map(({ id, start, end }) => ({ id, start, end })),
          { ...resolveOptionsFor(state), direction: 'down' },
        )
        if (result.ok) commit(applyMoves(withNew, result.moves))
        return result
      },

      extendBlock(id, minutes, now = new Date()) {
        const state = get()
        const b = state.blocks.find((x) => x.id === id)
        if (!b) return { ok: false, reason: 'invalid' }
        const base = Math.max(b.end, minutesOfDay(now))
        const end = Math.min(boundsOf(state.settings).end, Math.ceil((base + minutes) / 5) * 5)
        const reopened = state.blocks.map((x) => (x.id === id ? { ...x, completed: false, cappedAt: undefined } : x))
        const result = resolveCollisions(
          reopened,
          [{ id, start: b.start, end }],
          resolveOptionsFor(state, now),
        )
        if (result.ok) commit(applyMoves(reopened, result.moves))
        return result
      },

      addPomodoro(blockId) {
        const b = get().blocks.find((x) => x.id === blockId)
        if (b) {
          patchBlock(blockId, { pomodoros: (b.pomodoros ?? 0) + 1 })
          return
        }
        void database.blocks
          .where('id')
          .equals(blockId)
          .modify((row) => {
            row.pomodoros = (row.pomodoros ?? 0) + 1
          })
          .catch((err) => console.error('[iwill] failed to count pomodoro', err))
      },

      setFocusBlock(focusBlockId) {
        if (get().focusBlockId !== focusBlockId) set({ focusBlockId })
      },

      saveRoutine(input) {
        const routine: RoutineTemplate = { ...input, id: input.id ?? newId() }
        const routines = get().routines.some((r) => r.id === routine.id)
          ? get().routines.map((r) => (r.id === routine.id ? routine : r))
          : [...get().routines, routine]
        set({ routines })
        void database.routines.put(routine).catch((err) => console.error('[iwill] failed to save routine', err))
      },

      deleteRoutine(id) {
        set({ routines: get().routines.filter((r) => r.id !== id) })
        void database.routines.delete(id).catch((err) => console.error('[iwill] failed to delete routine', err))
      },

      saveCategory(input) {
        const name = input.name.trim()
        if (!name) return { ok: false, reason: 'Give the tag a name' }
        if (name.length > TAG_NAME_MAX) return { ok: false, reason: `Keep it under ${TAG_NAME_MAX} characters` }
        const { categories } = get()
        if (categories.some((c) => c.id !== input.id && c.name.toLowerCase() === name.toLowerCase()))
          return { ok: false, reason: `You already have a “${name}” tag` }

        const existing = categories.find((c) => c.id === input.id)
        const order = existing
          ? existing.order
          : categories.reduce((n, c, i) => Math.max(n, c.order ?? i), -1) + 1
        const category: Category = { ...existing, ...input, id: input.id ?? newId(), name, order }
        set({
          categories: existing
            ? categories.map((c) => (c.id === category.id ? category : c))
            : [...categories, category],
        })
        void database.categories
          .put(category)
          .then(() => channel?.postMessage({ categories: true }))
          .catch((err) => console.error('[iwill] failed to save tag', err))
        return { ok: true, category }
      },

      async deleteCategory(id, replacementId) {
        const { categories, blocks, routines } = get()
        if (categories.length <= 1 || id === replacementId) return false
        if (!categories.some((c) => c.id === id) || !categories.some((c) => c.id === replacementId)) return false

        const remapped = routines.map((r) =>
          r.steps.some((s) => s.categoryId === id)
            ? { ...r, steps: r.steps.map((s) => (s.categoryId === id ? { ...s, categoryId: replacementId } : s)) }
            : r,
        )
        set({
          categories: categories.filter((c) => c.id !== id),
          blocks: blocks.map((b) => (b.categoryId === id ? { ...b, categoryId: replacementId } : b)),
          routines: remapped,
          lastModified: Date.now(),
        })
        try {
          await database.transaction('rw', database.blocks, database.routines, database.categories, async () => {
            // Every day, not just the one on screen.
            await database.blocks.filter((b) => b.categoryId === id).modify({ categoryId: replacementId })
            const changed = remapped.filter((r, i) => r !== routines[i])
            if (changed.length) await database.routines.bulkPut(changed)
            await database.categories.delete(id)
          })
          channel?.postMessage({ date: null, categories: true })
        } catch (err) {
          console.error('[iwill] failed to delete tag', err)
        }
        return true
      },
    }
  })

  async function reloadTags() {
    const [categories, routines] = await Promise.all([database.categories.toArray(), database.routines.toArray()])
    store.setState({ categories: sortCategories(categories), routines })
  }

  channel?.addEventListener('message', (e: MessageEvent<{ date?: string | null; categories?: true }>) => {
    const { date, hydrated } = store.getState()
    if (!hydrated) return
    if (e.data.categories) void reloadTags()
    if (e.data.date === null || e.data.date === date) void store.getState().setDate(date)
  })

  return store
}

/** Lay a routine's steps out back-to-back starting at `start`. */
export function routineToBlocks(
  routine: RoutineTemplate,
  start: Minutes,
  date: DateKey,
  step: Minutes,
  makeId: (index: number) => string = newId,
): TimeBlock[] {
  let t = snap(start, step)
  return routine.steps.map((step, i) => {
    const block: TimeBlock = {
      id: makeId(i),
      date,
      title: step.title,
      categoryId: step.categoryId,
      start: t,
      end: t + step.duration,
      completed: false,
      locked: false,
    }
    t += step.duration
    return block
  })
}

export const useStore = createAppStore(defaultDb, { sync: true })

export const routineDuration = (routine: RoutineTemplate) => routine.steps.reduce((n, s) => n + s.duration, 0)

/** Where a routine dropped at `minute` should start: snapped and kept inside the day. */
export function routineDropStart(routine: RoutineTemplate, minute: Minutes, bounds: Bounds, step: Minutes): Minutes {
  const total = routineDuration(routine)
  return Math.max(bounds.start, Math.min(snap(minute, step), bounds.end - total))
}
