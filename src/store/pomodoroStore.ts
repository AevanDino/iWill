import { create } from 'zustand'
import { db as defaultDb, type IWillDB } from '../db/db'
import { findBreakOverflow, isBreakTag, type BreakOverflow } from '../lib/breaks'
import { newId } from '../lib/id'
import { sendNotification } from '../lib/notify'
import * as P from '../lib/pomodoro'
import { playChime, playTick } from '../lib/sound'
import { createTabCoordinator, type SyncMessage, type TimerCoordinator } from '../lib/tabSync'
import { clamp, formatTime, minutesOfDay, toDateKey } from '../lib/time'
import type { TimeBlock } from '../types'
import { resolveOptionsFor, useStore } from './appStore'
import { useUi } from './uiStore'

/** Time left in `block` if it's running right now, else null. */
function blockLeftMs(block: TimeBlock | undefined, now: number): number | null {
  const nowDate = new Date(now)
  if (!block || block.completed || block.date !== toDateKey(nowDate)) return null
  const nowMin = minutesOfDay(nowDate)
  if (nowMin < block.start || nowMin >= block.end) return null
  return (block.end - nowMin) * 60_000
}

/**
 * What the session would look like if `block` had these times: used to
 * preview the timer live while the block is being dragged.
 */
export function projectSession(
  s: P.PomodoroSession,
  config: P.PomodoroConfig,
  block: TimeBlock,
  now: number,
): P.PomodoroSession {
  return P.followBlock(s, config, blockLeftMs(block, now), now)
}

/** If `block` is running right now, shorten an unstarted focus to the time it has left. */
function fitToActiveBlock(s: P.PomodoroSession, block: TimeBlock | undefined, now: number): P.PomodoroSession {
  const left = blockLeftMs(block, now)
  return left == null ? s : P.fitToBlock(s, left)
}

/** `viewer`: a session exists but another tab is running it. */
export type TimerRole = 'owner' | 'viewer'

export interface PomodoroState {
  hydrated: boolean
  session: P.PomodoroSession | null
  role: TimerRole
  config: P.PomodoroConfig
  /** Timer fills the screen and hides the calendar; otherwise it's docked beside it. */
  fullscreen: boolean
  /** Timer pane's share of the split (0–1); the calendar gets the rest. */
  split: number
  /** Full-pane "BREAK TIME" / "FOCUS TIME" slam; `id` changes every time. */
  flash: { id: number; phase: P.Phase } | null
  /** A planned block just started — offer to focus on it. */
  offer: { blockId: string } | null
  /** A break runs into the next block and we're asking how to pay for it. */
  breakPrompt: { overflow: BreakOverflow } | null
  /** "Leave my plan": the next block lost these minutes to a break (shown in the Now strip). */
  breakDebt: { blockId: string; minutes: number } | null

  hydrate(): Promise<void>
  /** Start (or resume) a session for a block, or a quick focus when `blockId` is null. */
  startFor(blockId: string | null, opts?: { run?: boolean }): Promise<void>
  toggle(): void
  pauseTimer(): void
  resume(): void
  skip(): void
  next(): void
  extraBreak(): void
  /** From a finished focus, go straight to the next focus. */
  skipBreak(): void
  newCycle(): void
  end(): void
  retarget(blockId: string): void
  /** Show the timer pane — starting an idle quick-focus session if there isn't one. */
  openFocus(): void
  setFullscreen(on: boolean): void
  setSplit(share: number): void
  takeOver(): Promise<void>
  updateConfig(patch: Partial<P.PomodoroConfig>): void
  tick(now: number): void
  blockStarted(blockId: string): void
  /** The day's blocks changed: keep a focus in step with its block (see `P.followBlock`). */
  blocksChanged(): void
  acceptOffer(): void
  dismissOffer(): void
  /** Answer the break prompt; `remember` makes it the default from now on. */
  resolveBreak(choice: P.BreakChoice, remember?: boolean): void
}

const CONFIG_KEY = 'iwill:pomodoro'
const SPLIT_KEY = 'iwill:split'
export const DEFAULT_SPLIT = 0.7
export const clampSplit = (v: number) => clamp(v, 0.2, 0.85)

function loadSplit(): number {
  try {
    const v = Number(globalThis.localStorage?.getItem(SPLIT_KEY))
    return v ? clampSplit(v) : DEFAULT_SPLIT
  } catch {
    return DEFAULT_SPLIT
  }
}

function loadConfig(): P.PomodoroConfig {
  try {
    const raw = globalThis.localStorage?.getItem(CONFIG_KEY)
    return raw ? { ...P.DEFAULT_POMODORO, ...JSON.parse(raw) } : P.DEFAULT_POMODORO
  } catch {
    return P.DEFAULT_POMODORO
  }
}

function saveConfig(c: P.PomodoroConfig) {
  try {
    globalThis.localStorage?.setItem(CONFIG_KEY, JSON.stringify(c))
  } catch {
    // private mode — config just won't persist
  }
}

function clampConfig(c: P.PomodoroConfig): P.PomodoroConfig {
  const out = { ...c }
  for (const [key, [lo, hi]] of Object.entries(P.POMODORO_LIMITS)) {
    const k = key as keyof typeof P.POMODORO_LIMITS
    out[k] = Math.round(clamp(Number(out[k]) || lo, lo, hi))
  }
  out.volume = clamp(out.volume, 0, 1)
  return out
}

interface Deps {
  database?: IWillDB
  coordinator?: TimerCoordinator
  app?: typeof useStore
  /** Sounds, notifications and toasts. Off in tests. */
  effects?: boolean
}

export function createPomodoroStore({
  database = defaultDb,
  coordinator = createTabCoordinator(),
  app = useStore,
  effects = true,
}: Deps = {}) {
  let flashId = 0
  let precise: ReturnType<typeof setTimeout> | undefined
  const dismissedOffers = new Set<string>()
  const warnedEnding = new Set<string>()

  const store = create<PomodoroState>()((set, get) => {
    const isLive = (s: P.PomodoroSession | null | undefined): s is P.PomodoroSession => !!s && s.status !== 'ended'

    function syncFocusBlock(s: P.PomodoroSession | null) {
      app.getState().setFocusBlock(isLive(s) && s.blockId ? s.blockId : null)
    }

    function persist(s: P.PomodoroSession) {
      return database
        .transaction('rw', database.pomodoroSessions, database.meta, async () => {
          await database.pomodoroSessions.put(s)
          await database.meta.put({ key: 'activeSession', value: isLive(s) ? s.id : null })
        })
        .catch((err) => console.error('[iwill] failed to persist pomodoro', err))
    }

    /** Fire exactly at the end of the phase, not up to a second late. */
    function schedulePrecise(s: P.PomodoroSession | null) {
      clearTimeout(precise)
      if (s?.status === 'running' && s.endsAt != null)
        precise = setTimeout(() => get().tick(Date.now()), Math.max(0, s.endsAt - Date.now()) + 5)
    }

    /** Owner only: apply, persist, and tell other tabs. */
    function commit(next: P.PomodoroSession) {
      const prev = get().session
      const now = Date.now()
      // Leaving a break we pushed the day for: give back what wasn't used — if it was left early.
      const leftBreak = !!prev?.breakBlockId && leftPhase(prev, next)
      const leftEarly = leftBreak && P.remainingMs(prev!, now) > 30_000
      if (leftBreak) next = { ...next, breakBlockId: undefined }
      if (prev && prev.phase !== 'focus' && leftPhase(prev, next) && get().breakPrompt) set({ breakPrompt: null })

      // A new or ended session must not replay the last session's phase flash when the pane opens.
      const fresh = !prev || !isLive(next) || prev.id !== next.id
      set({ session: isLive(next) ? next : null, ...(fresh && { flash: null }) })
      syncFocusBlock(next)
      schedulePrecise(next)
      void persist(next)
      if (isLive(next)) coordinator.broadcast({ type: 'state', session: next })
      else {
        coordinator.broadcast({ type: 'ended' })
        coordinator.release()
      }

      if (leftEarly) giveBack(prev!.breakBlockId!, now)
      if (startedBreak(prev, next)) onBreakStart(next)
    }

    /** `next` is no longer the same run of `prev`'s phase. */
    function leftPhase(prev: P.PomodoroSession, next: P.PomodoroSession) {
      return (
        !isLive(next) ||
        next.phase !== prev.phase ||
        next.phaseStartedAt !== prev.phaseStartedAt ||
        next.status === 'complete'
      )
    }

    /**
     * A break has just started running: a real transition, not resuming
     * after a pause, nor picking a session back up after a reload.
     */
    function startedBreak(prev: P.PomodoroSession | null, next: P.PomodoroSession) {
      if (!prev || next.phase === 'focus' || next.status !== 'running' || next.breakBlockId) return false
      return prev.phase !== next.phase || prev.phaseStartedAt !== next.phaseStartedAt || prev.status === 'idle'
    }

    // ---- breaks that run past their block ----------------------------------

    function onBreakStart(s: P.PomodoroSession) {
      const { blocks, categories, date } = app.getState()
      const block = blocks.find((b) => b.id === s.blockId)
      if (!block || date !== s.date || s.phaseStartedAt == null || s.endsAt == null) return
      const overflow = findBreakOverflow({
        blocks,
        categories,
        block,
        breakStart: minutesOfDay(new Date(s.phaseStartedAt)),
        breakEnd: minutesOfDay(new Date(s.endsAt)),
        ...resolveOptionsFor(app.getState()),
        breakBlockId: newId(),
      })
      if (!overflow) return
      const choice = get().config.breakOverflow
      if (choice === 'ask') set({ breakPrompt: { overflow } })
      else payForBreak(choice, overflow)
    }

    function payForBreak(choice: P.BreakChoice, o: BreakOverflow) {
      const notify = (msg: string) => effects && useUi.getState().notify(msg)
      const leave = () => {
        set({ breakDebt: { blockId: o.next.id, minutes: o.minutes } })
        notify(`☕ Your break runs ${o.minutes} min into “${o.next.title}”`)
      }
      const s = get().session
      if (!s) return

      if (choice === 'push') {
        const { categories } = app.getState()
        const id = o.breakBlockId
        const r = o.push.ok
          ? app.getState().insertBlock({
              id,
              date: s.date,
              title: 'Break',
              categoryId: categories.find(isBreakTag)?.id ?? o.next.categoryId,
              start: o.from,
              end: o.to,
              completed: false,
              locked: false,
            })
          : o.push
        if (!r.ok) {
          leave()
          return
        }
        commit({ ...s, breakBlockId: id })
        notify(`☕ Pushed your day ${o.minutes} min for your break`)
      } else if (choice === 'shorten') {
        const next = app.getState().blocks.find((b) => b.id === o.next.id)
        if (!o.canShorten || !next || !app.getState().moveBlock(next.id, o.to, next.end).ok) {
          leave()
          return
        }
        notify(`✂️ Took ${o.minutes} min from “${next.title}” for your break`)
      } else leave()
    }

    /** Cap the Break block we inserted, pulling the day back up by what's left of it. */
    function giveBack(blockId: string, now: number) {
      const block = app.getState().blocks.find((b) => b.id === blockId)
      if (!block || block.completed) return
      const left = block.end - minutesOfDay(new Date(now))
      if (left < 0.5) return
      const r = app.getState().capBlock(blockId, new Date(now))
      if (r.ok && effects && r.freed >= 1) useUi.getState().notify(`↩️ Gave ${Math.round(r.freed)} min back to your day`)
    }

    function flash(phase: P.Phase) {
      set({ flash: { id: ++flashId, phase } })
    }

    /** Run `fn` on the live session if this tab owns it; otherwise ask the owner. */
    function mutate(fn: (s: P.PomodoroSession, now: number) => P.PomodoroSession, remote?: 'pause' | 'resume' | 'end') {
      const { session, role } = get()
      if (!session) return
      if (role === 'viewer') {
        if (remote) coordinator.broadcast({ type: 'cmd', action: remote })
        return
      }
      const next = fn(session, Date.now())
      if (next !== session) commit(next)
    }

    /** Mutations that enter a new phase also slam the transition flash. */
    function enterPhase(fn: (s: P.PomodoroSession, now: number) => P.PomodoroSession) {
      mutate(fn)
      const s = get().session
      if (s && get().role === 'owner') flash(s.phase)
    }

    function onFinished(done: P.PomodoroSession, phase: P.Phase, now: number) {
      const { config } = get()
      if (phase === 'focus') {
        void database.focusLog
          .add({
            id: newId(),
            sessionId: done.id,
            blockId: done.blockId,
            date: done.date,
            startedAt: done.phaseStartedAt ?? now - done.durationMs,
            endedAt: now,
            durationMs: done.durationMs,
            pauses: done.pauses,
          })
          .catch((err) => console.error('[iwill] failed to log focus', err))
        if (done.blockId) app.getState().addPomodoro(done.blockId)
      }
      const next = config.autoStart ? P.advance(done, config, now, true) : done
      commit(next)
      if (config.autoStart) flash(next.phase)

      if (!effects) return
      if (config.sound) playChime(config.volume, phase === 'focus' ? 'focus-done' : 'break-done')
      if (app.getState().settings.notifications) {
        if (phase === 'focus')
          sendNotification(`🍅 Pomodoro #${done.completed} done`, config.autoStart ? 'Break started.' : 'Time for a break.')
        else sendNotification("⏰ Break's over", config.autoStart ? 'Focus started.' : 'Ready for the next round?')
      }
    }

    /** Heads-up when the linked block is about to end, so the user can extend it. */
    function checkBlockEnding(s: P.PomodoroSession, now: number) {
      if (!effects || !s.blockId) return
      const b = app.getState().blocks.find((x) => x.id === s.blockId)
      if (!b || b.completed) return
      const left = b.end - minutesOfDay(new Date(now))
      const key = `${b.id}@${b.end}`
      if (left > 0 && left <= 5 && !warnedEnding.has(key)) {
        warnedEnding.add(key)
        useUi.getState().notify(`⏳ “${b.title}” ends at ${formatTime(b.end)} — extend it from the timer`)
        if (app.getState().settings.notifications) sendNotification(`⏳ “${b.title}” ends in ${Math.ceil(left)} min`)
      }
    }

    /**
     * Right after a session ends, a queued tab may briefly grab the lock
     * before it learns there's nothing to adopt — give it a moment.
     */
    async function claimWithRetry() {
      for (let i = 0; i < 3; i++) {
        if (await coordinator.claim()) return true
        await new Promise((r) => setTimeout(r, 120))
      }
      return false
    }

    /** A viewer tab became the owner (the old owner closed) — pick the session up. */
    async function adopt() {
      const meta = await database.meta.get('activeSession')
      const s = meta?.value ? await database.pomodoroSessions.get(meta.value as string) : undefined
      if (!isLive(s)) {
        coordinator.release()
        set({ session: null, role: 'owner' })
        syncFocusBlock(null)
        return
      }
      set({ role: 'owner' })
      commit(P.recover(s, Date.now()))
    }

    function onMessage(msg: SyncMessage) {
      const { role, session } = get()
      switch (msg.type) {
        case 'state':
          if (role === 'owner' && session) return // split brain guard: we're authoritative
          set({ session: msg.session as P.PomodoroSession, role: 'viewer' })
          syncFocusBlock(msg.session as P.PomodoroSession)
          coordinator.waitForOwnership()
          break
        case 'ended':
          if (role !== 'viewer') return
          coordinator.cancelWait()
          set({ session: null, role: 'owner', fullscreen: false })
          syncFocusBlock(null)
          break
        case 'hello':
          if (role === 'owner' && session) coordinator.broadcast({ type: 'state', session })
          break
        case 'cmd':
          if (role !== 'owner' || !session) return
          if (msg.action === 'pause') mutate(P.pause)
          else if (msg.action === 'resume') mutate(P.start)
          else get().end()
          break
      }
    }

    return {
      hydrated: false,
      session: null,
      role: 'owner',
      config: loadConfig(),
      fullscreen: false,
      split: loadSplit(),
      flash: null,
      offer: null,
      breakPrompt: null,
      breakDebt: null,

      async hydrate() {
        coordinator.listen({
          message: onMessage,
          lost() {
            clearTimeout(precise)
            set({ role: 'viewer' })
            coordinator.waitForOwnership()
            if (effects) useUi.getState().notify('↗️ The timer moved to another tab')
          },
          acquired: () => void adopt(),
        })

        const meta = await database.meta.get('activeSession')
        const s = meta?.value ? await database.pomodoroSessions.get(meta.value as string) : undefined
        if (!isLive(s)) {
          set({ hydrated: true })
          return
        }
        if (s.date !== toDateKey(new Date())) {
          // Yesterday's session: close it out quietly.
          await persist({ ...s, status: 'ended', endsAt: null, updatedAt: Date.now() })
          set({ hydrated: true })
          return
        }
        if (await coordinator.claim()) {
          set({ role: 'owner', hydrated: true })
          commit(P.recover(s, Date.now()))
        } else {
          set({ role: 'viewer', session: s, hydrated: true })
          syncFocusBlock(s)
          coordinator.waitForOwnership()
          coordinator.broadcast({ type: 'hello' })
        }
      },

      async startFor(blockId, { run = true } = {}) {
        const key = blockId ?? P.QUICK
        const { session: cur, role, config } = get()
        const now = Date.now()
        const today = toDateKey(new Date(now))
        if (app.getState().date !== today) void app.getState().setDate(today)

        if (cur && role === 'viewer') {
          if (effects) useUi.getState().notify('⏱️ A timer is already running in another tab')
          return
        }
        if (cur && cur.blockId === key) {
          if (run) commit(P.start(fitToActiveBlock(cur, app.getState().blocks.find((b) => b.id === key), now), now))
          return
        }
        if (!(await claimWithRetry())) {
          set({ role: 'viewer' })
          coordinator.broadcast({ type: 'hello' })
          coordinator.waitForOwnership()
          return
        }
        set({ role: 'owner' })

        // Park the current session so it can be resumed later today.
        if (cur) await persist(P.pause(cur, now))

        const existing = await database.pomodoroSessions
          .where('[blockId+date]')
          .equals([key, today])
          .filter((s) => s.status !== 'ended')
          .last()
        let s = existing ? P.applyConfig({ ...existing, interrupted: false }, config) : P.createSession(key, today, config, now, newId())
        if (s.status === 'complete') s = P.advance(s, config, now, false)
        if (blockId) {
          // The timeline may still be loading today, so fall back to the database.
          const block = app.getState().blocks.find((b) => b.id === blockId) ?? (await database.blocks.get(blockId))
          s = fitToActiveBlock(s, block, now)
        }
        if (run) s = P.start(s, now)
        commit(s)
        set({ offer: null })
      },

      toggle() {
        const s = get().session
        if (!s) return
        if (s.status === 'running') get().pauseTimer()
        else if (s.status === 'complete') get().next()
        else get().resume()
      },
      pauseTimer: () => mutate(P.pause, 'pause'),
      resume: () => mutate(P.start, 'resume'),
      skip: () => enterPhase((s, now) => P.skip(s, get().config, now)),
      next: () => enterPhase((s, now) => P.advance(s, get().config, now, true)),
      extraBreak: () => enterPhase((s, now) => P.extraBreak(s, get().config, now)),
      newCycle: () => enterPhase((s, now) => P.newCycle(s, get().config, now)),
      skipBreak: () =>
        enterPhase((s, now) => {
          const c = get().config
          return P.advance(P.advance(s, c, now, false), c, now, true)
        }),

      end() {
        mutate((s, now) => {
          // Count an unfinished focus's time toward the total before closing out.
          const partial = s.phase === 'focus' && s.status !== 'idle' && s.status !== 'complete'
          const spent = partial ? s.durationMs - P.remainingMs(s, now) : 0
          return { ...P.pause(s, now), status: 'ended', focusMs: s.focusMs + spent, updatedAt: now }
        }, 'end')
        if (get().role === 'owner') set({ fullscreen: false })
      },

      retarget(blockId) {
        mutate((s) => ({ ...s, blockId }))
      },

      openFocus() {
        const s = get().session
        if (!s) {
          void get().startFor(null, { run: false })
          return
        }
        if (app.getState().date !== s.date) void app.getState().setDate(s.date)
      },
      setFullscreen: (fullscreen) => set({ fullscreen: fullscreen && !!get().session }),
      setSplit(share) {
        const split = clampSplit(share)
        set({ split })
        try {
          globalThis.localStorage?.setItem(SPLIT_KEY, String(split))
        } catch {
          // private mode — the split just won't persist
        }
      },

      async takeOver() {
        await coordinator.steal()
        await adopt()
      },

      updateConfig(patch) {
        const config = clampConfig({ ...get().config, ...patch })
        saveConfig(config)
        set({ config })
        const s = get().session
        if (s && get().role === 'owner') {
          const next = P.applyConfig(s, config)
          if (next !== s) commit(next)
        }
      },

      tick(now) {
        const { session: s, role, config } = get()
        if (!s || role !== 'owner' || s.status !== 'running') return
        const r = P.tick(s, now)
        if (r.finished) {
          onFinished(r.session, r.finished, now)
          return
        }
        // Persist every second so a crash loses at most one tick.
        commit({ ...s, updatedAt: now })
        checkBlockEnding(s, now)
        if (effects && config.sound && document.visibilityState === 'visible')
          playTick(config.volume)
      },

      blocksChanged() {
        const { session: s, role, config } = get()
        if (!s || role !== 'owner' || !s.blockId) return
        const { blocks, date } = app.getState()
        const block = blocks.find((b) => b.id === s.blockId)
        // Another day on screen: we can't see the block, which isn't the same as it being gone.
        if (!block && date !== s.date) return
        const now = Date.now()
        const next = P.followBlock(s, config, blockLeftMs(block, now), now)
        if (next !== s) commit(next)
      },

      blockStarted(blockId) {
        const { session, config } = get()
        if (config.autoFocus === 'off' || dismissedOffers.has(blockId)) return
        if (session && (session.status === 'running' || session.blockId === blockId)) return
        if (config.autoFocus === 'auto') void get().startFor(blockId, { run: true })
        else set({ offer: { blockId } })
      },
      acceptOffer() {
        const offer = get().offer
        if (offer) void get().startFor(offer.blockId, { run: true })
      },
      dismissOffer() {
        const offer = get().offer
        if (offer) dismissedOffers.add(offer.blockId)
        set({ offer: null })
      },

      resolveBreak(choice, remember = false) {
        const prompt = get().breakPrompt
        if (!prompt) return
        set({ breakPrompt: null })
        if (remember) get().updateConfig({ breakOverflow: choice })
        if (get().session?.phase !== 'focus') payForBreak(choice, prompt.overflow)
      },
    }
  })

  // Moving or resizing the focused block moves the end of its focus too.
  app.subscribe((state, prev) => {
    if (state.blocks !== prev.blocks) store.getState().blocksChanged()
  })
  return store
}

export const usePomodoro = createPomodoroStore()

/**
 * Drive `tick` from a Web Worker (not throttled in background tabs) while a
 * session is running, falling back to a main-thread interval.
 */
export function startPomodoroLoop(store = usePomodoro) {
  let worker: Worker | null = null
  let fallback: ReturnType<typeof setInterval> | undefined
  try {
    worker = new Worker(new URL('../lib/ticker.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = () => store.getState().tick(Date.now())
  } catch {
    worker = null
  }

  let running = false
  const sync = () => {
    const s = store.getState()
    const next = s.role === 'owner' && s.session?.status === 'running'
    if (next === running) return
    running = next
    if (worker) worker.postMessage(next ? 'start' : 'stop')
    else {
      clearInterval(fallback)
      if (next) fallback = setInterval(() => store.getState().tick(Date.now()), 1000)
    }
  }
  store.subscribe(sync)
  sync()
  document.addEventListener('visibilitychange', () => store.getState().tick(Date.now()))
}
