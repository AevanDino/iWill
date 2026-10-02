import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useShallow } from 'zustand/react/shallow'
import { inkOn } from '../lib/color'
import { layoutFlags } from '../lib/flags'
import { isMovable, overlaps, resolveCollisions, resolvePush, type ResolveResult } from '../lib/collision'
import { clamp, formatDuration, formatTime, minutesOfDay, MIN_DURATION, slotSpan, snap, toDateKey } from '../lib/time'
import { usePomodoro } from '../store/pomodoroStore'
import {
  boundsOf,
  resolveOptionsFor,
  routineDropStart,
  routineToBlocks,
  useStore,
} from '../store/appStore'
import { useClock } from '../store/clock'
import { useUi } from '../store/uiStore'
import type { BlockMove, Category, Minutes, TimeBlock } from '../types'
import { CheckIcon } from './icons'
import { BlockView, SLIVER_PX, TINY_PX, type BlockActions, type GripKind } from './BlockView'
import { NowStrip } from './NowStrip'
import { failureMessage } from './messages'

/** `create`: press-and-drag on empty grid to size a new block. */
type GestureKind = GripKind | 'create'

/**
 * `push`: blocks are solid, the dragged block shoves everything ahead of it.
 * `slot`: it slides through, and blocks part at the seam nearest its middle.
 * Holding still mid-drag switches between the two.
 */
type DragMode = 'push' | 'slot'

type Span = { start: Minutes; end: Minutes }

interface Gesture {
  id: string
  kind: GestureKind
  pointerId: number
  origin: Span
  /** Every block this gesture moves, at its committed position (just `origin` unless a selection is dragged). */
  group: BlockMove[]
  mode: DragMode
  /** Last preview that worked in push mode — where the drag stops when it runs into a wall. */
  lastOk?: DragPreview
  /** Pointer Y where the hold-to-switch countdown last (re)started. */
  restY: number
  hold?: ReturnType<typeof setTimeout>
  grabOffset: Minutes
  downX: number
  downY: number
  lastY: number
  /** May this gesture drag? Touch must long-press the body first so plain swipes still scroll. */
  armed: boolean
  /** Has it moved past the tap threshold? */
  active: boolean
  locked: boolean
  timer?: ReturnType<typeof setTimeout>
}

interface DragPreview {
  /** The grabbed block (or `NEW_ID`). */
  id: string
  /** Where each dragged block is drawn: follows the pointer, unsnapped. */
  raw: Map<string, Span>
  /** Snapped targets, drawn as dashed outlines. */
  targets: BlockMove[]
  /** The grabbed block's target, labelled with its times. */
  target: Span
  result: ResolveResult
  mode: DragMode
}

const LONG_PRESS_MS = 260
const TAP_SLOP = 4
const SCROLL_SLOP = 8
const EDGE = 56
/** A second tap within this window starts a Pomodoro instead of opening the editor. */
const DOUBLE_TAP_MS = 260
/** Stand-in id for the block being drawn by a create gesture. */
const NEW_ID = 'new-block'
/** A sliver's flag in the rail, and the room between the lane and the flag for its leader line. */
const FLAG_HEIGHT = 22
const FLAG_INSET = 10
/** Invisible touch target around a sliver, and under its pull tab, in px. */
const SLIVER_HIT = 24
const TAB_HIT = 18
/** Blocks this short always get a pull tab, whatever the zoom. */
const PULL_TAB_MINUTES = 10
/** Hold still this long mid-drag to switch between push and slot-in. */
const HOLD_MS = 600
/** Pointer drift (px) that still counts as holding still. */
const HOLD_SLOP = 6

export function Timeline() {
  const { date, blocks, categories, routines, settings } = useStore(
    useShallow((s) => ({
      date: s.date,
      blocks: s.blocks,
      categories: s.categories,
      routines: s.routines,
      settings: s.settings,
    })),
  )
  const hydrated = useStore((s) => s.hydrated)
  const focusBlockId = useStore((s) => s.focusBlockId)
  const routineDrag = useUi((s) => s.routineDrag)
  const bouncing = useUi((s) => s.bouncing)
  const selecting = useUi((s) => s.selecting)
  const selected = useUi((s) => s.selected)

  const nowMinute = useClock((s) => Math.floor(s.now / 60000))
  const today = toDateKey(new Date(nowMinute * 60000))
  const isToday = date === today
  const nowMin = minutesOfDay(new Date(nowMinute * 60000))

  const bounds = boundsOf(settings)
  const pxPerMin = settings.hourHeight / 60
  const contentHeight = (bounds.end - bounds.start) * pxPerMin
  const yOf = useCallback((m: Minutes) => (m - bounds.start) * pxPerMin, [bounds.start, pxPerMin])

  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const rafRef = useRef(0)
  const [preview, setPreview] = useState<DragPreview | null>(null)
  const [liftedId, setLiftedId] = useState<string | null>(null)
  /** A hold-to-switch countdown is running; `key` restarts its progress bar. */
  const [hold, setHold] = useState<{ key: number; to: DragMode } | null>(null)

  // Handlers attached to window read the latest render's values through this ref.
  const live = useRef({ blocks, bounds, pxPerMin, grid: settings.grid })
  live.current = { blocks, bounds, pxPerMin, grid: settings.grid }

  const clientToMin = useCallback((clientY: number) => {
    const rect = contentRef.current!.getBoundingClientRect()
    const { bounds, pxPerMin } = live.current
    return bounds.start + (clientY - rect.top) / pxPerMin
  }, [])

  // ---- probe for routine drag-and-drop (used by the deck) -----------------
  const probe = useCallback(
    (x: number, y: number) => {
      const el = scrollRef.current
      if (!el) return null
      const r = el.getBoundingClientRect()
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null
      return clientToMin(y)
    },
    [clientToMin],
  )
  useEffect(() => {
    useUi.getState().setProbe(probe)
    return () => useUi.getState().setProbe(null)
  }, [probe])

  // ---- gesture engine -----------------------------------------------------
  const computePreview = useCallback(
    (g: Gesture, clientY: number): DragPreview => {
      const { bounds, grid } = live.current
      const m = clientToMin(clientY)
      if (g.kind === 'create') {
        const target = slotSpan(g.origin.start, m, bounds, grid)
        const ghost: TimeBlock = { id: g.id, date: '', title: '', categoryId: '', ...target, completed: false, locked: false }
        const result = resolveCollisions(
          [...live.current.blocks, ghost],
          [{ id: g.id, ...target }],
          resolveOptionsFor(useStore.getState()),
        )
        return { id: g.id, raw: new Map([[g.id, target]]), targets: [{ id: g.id, ...target }], target, result, mode: 'push' as const }
      }
      const opts = resolveOptionsFor(useStore.getState())
      if (g.kind === 'move') {
        const lo = bounds.start - Math.min(...g.group.map((o) => o.start))
        const hi = bounds.end - Math.max(...g.group.map((o) => o.end))
        const rawDelta = clamp(m - g.grabOffset - g.origin.start, lo, hi)
        const delta = clamp(snap(g.origin.start + rawDelta, grid) - g.origin.start, lo, hi)
        const raw = new Map(g.group.map((o) => [o.id, { start: o.start + rawDelta, end: o.end + rawDelta }]))
        const targets = g.group.map((o) => ({ id: o.id, start: o.start + delta, end: o.end + delta }))
        const target = { start: g.origin.start + delta, end: g.origin.end + delta }
        if (g.mode === 'slot') {
          const pivot = (Math.min(...targets.map((t) => t.start)) + Math.max(...targets.map((t) => t.end))) / 2
          const result = resolveCollisions(live.current.blocks, targets, { ...opts, pivot })
          return { id: g.id, raw, targets, target, result, mode: 'slot' }
        }
        return pushPreview(g, { id: g.id, raw, targets, target, result: resolvePush(live.current.blocks, targets, opts), mode: 'push' })
      }
      let raw: Span
      let target: Span
      if (g.kind === 'start') {
        const start = clamp(m, bounds.start, g.origin.end - MIN_DURATION)
        raw = { start, end: g.origin.end }
        target = { start: Math.min(snap(start, grid), g.origin.end - MIN_DURATION), end: g.origin.end }
      } else {
        const end = clamp(m, g.origin.start + MIN_DURATION, bounds.end)
        raw = { start: g.origin.start, end }
        target = { start: g.origin.start, end: Math.max(snap(end, grid), g.origin.start + MIN_DURATION) }
      }
      const targets = [{ id: g.id, ...target }]
      const result = resolvePush(live.current.blocks, targets, opts)
      return pushPreview(g, { id: g.id, raw: new Map([[g.id, raw]]), targets, target, result, mode: 'push' })
    },
    [clientToMin],
  )

  // ---- hold still to switch between push and slot-in ----------------------
  const cancelHold = useCallback((g: Gesture) => {
    clearTimeout(g.hold)
    g.hold = undefined
    setHold(null)
  }, [])

  const armHold = useCallback(
    (g: Gesture, current: DragPreview) => {
      cancelHold(g)
      if (g.kind !== 'move') return
      // Slotting in only means something when the drag is over blocks it would part.
      const ids = new Set(g.group.map((o) => o.id))
      const overBlocks = live.current.blocks.some(
        (b) => !ids.has(b.id) && isMovable(b) && current.targets.some((t) => overlaps(t, b)),
      )
      if (g.mode === 'push' && !overBlocks) return
      const to: DragMode = g.mode === 'push' ? 'slot' : 'push'
      setHold({ key: Date.now(), to })
      g.hold = setTimeout(() => {
        if (gestureRef.current !== g) return
        g.hold = undefined
        g.mode = to
        g.lastOk = undefined
        navigator.vibrate?.(10)
        setHold(null)
        setPreview(computePreview(g, g.lastY))
      }, HOLD_MS)
    },
    [cancelHold, computePreview],
  )

  const autoScroll = useCallback(() => {
    const g = gestureRef.current
    const el = scrollRef.current
    if (!g?.active || !el) {
      rafRef.current = 0
      return
    }
    const r = el.getBoundingClientRect()
    let v = 0
    if (g.lastY < r.top + EDGE) v = -Math.min(1, (r.top + EDGE - g.lastY) / EDGE) * 16
    else if (g.lastY > r.bottom - EDGE) v = Math.min(1, (g.lastY - (r.bottom - EDGE)) / EDGE) * 16
    if (v !== 0) {
      const before = el.scrollTop
      el.scrollTop += v
      if (el.scrollTop !== before) {
        setPreview(computePreview(g, g.lastY))
        // Resting in the scroll zone isn't holding still: re-arm on the next real move.
        cancelHold(g)
        g.restY = -Infinity
      }
    }
    rafRef.current = requestAnimationFrame(autoScroll)
  }, [cancelHold, computePreview])

  const endGesture = useCallback(() => {
    const g = gestureRef.current
    if (g?.timer) clearTimeout(g.timer)
    clearTimeout(g?.hold)
    setHold(null)
    gestureRef.current = null
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    setLiftedId(null)
    window.removeEventListener('pointermove', onMoveRef.current)
    window.removeEventListener('pointerup', onUpRef.current)
    window.removeEventListener('pointercancel', onCancelRef.current)
    window.removeEventListener('touchmove', onTouchMoveRef.current)
  }, [])

  const onMove = useCallback(
    (ev: globalThis.PointerEvent) => {
      const g = gestureRef.current
      if (!g || ev.pointerId !== g.pointerId) return
      const dist = Math.hypot(ev.clientX - g.downX, ev.clientY - g.downY)
      if (!g.armed) {
        // A touch that moves before the long-press fires is a scroll, not a drag.
        if (dist > SCROLL_SLOP) endGesture()
        return
      }
      if (g.locked) {
        if (dist > TAP_SLOP) {
          useUi.getState().notify(g.group.length > 1 ? '🔒 Unlock the locked blocks to move the group' : '🔒 Locked — unlock it to move')
          endGesture()
        }
        return
      }
      if (!g.active) {
        if (dist < TAP_SLOP) return
        g.active = true
        if (!rafRef.current) rafRef.current = requestAnimationFrame(autoScroll)
      }
      g.lastY = ev.clientY
      const next = computePreview(g, ev.clientY)
      setPreview(next)
      if (Math.abs(ev.clientY - g.restY) > HOLD_SLOP) {
        g.restY = ev.clientY
        armHold(g, next)
      }
    },
    [armHold, autoScroll, computePreview, endGesture],
  )

  const onUp = useCallback(
    (ev: globalThis.PointerEvent) => {
      const g = gestureRef.current
      if (!g || ev.pointerId !== g.pointerId) return
      endGesture()
      if (!g.active) {
        if (g.kind === 'create') {
          // A plain click on empty grid: a 30-minute block in that slot.
          const { bounds, grid } = live.current
          const start = clamp(Math.floor(g.origin.start / grid) * grid, bounds.start, bounds.end - 30)
          createBlock(start, start + 30)
        } else onTap(g.id)
        return
      }
      swallowNextClick()
      const p = computePreview(g, g.lastY)
      setPreview(null)
      if (!p.result.ok) {
        useUi.getState().notify(failureMessage(p.result))
        return
      }
      if (g.kind === 'create') {
        createBlock(p.target.start, p.target.end)
        return
      }
      if (p.target.start === g.origin.start && p.target.end === g.origin.end) return
      useStore.getState().applyMoves(p.result.moves)
    },
    [computePreview, endGesture],
  )

  const onCancel = useCallback(
    (ev: globalThis.PointerEvent) => {
      if (gestureRef.current && ev.pointerId === gestureRef.current.pointerId) {
        endGesture()
        setPreview(null)
      }
    },
    [endGesture],
  )

  const onTouchMove = useCallback((ev: TouchEvent) => {
    // Once a long-press has lifted a block, stop the page from scrolling under the finger.
    if (gestureRef.current?.armed) ev.preventDefault()
  }, [])

  const onMoveRef = useRef(onMove)
  const onUpRef = useRef(onUp)
  const onCancelRef = useRef(onCancel)
  const onTouchMoveRef = useRef(onTouchMove)
  onMoveRef.current = onMove
  onUpRef.current = onUp
  onCancelRef.current = onCancel
  onTouchMoveRef.current = onTouchMove

  useEffect(() => endGesture, [endGesture])

  const gestureStart = useCallback(
    (e: PointerEvent<HTMLElement>, id: string, kind: GripKind) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (gestureRef.current) return
      const block = live.current.blocks.find((b) => b.id === id)
      if (!block) return
      const needsLongPress = e.pointerType === 'touch' && kind === 'move'
      // Dragging a selected block in select mode carries the whole selection.
      const { selecting, selected } = useUi.getState()
      const group =
        selecting && kind === 'move' && selected.has(id)
          ? live.current.blocks.filter((b) => selected.has(b.id))
          : [block]
      const g: Gesture = {
        id,
        kind,
        pointerId: e.pointerId,
        origin: { start: block.start, end: block.end },
        group: group.map(({ id, start, end }) => ({ id, start, end })),
        mode: 'push',
        restY: e.clientY,
        grabOffset: clientToMin(e.clientY) - block.start,
        downX: e.clientX,
        downY: e.clientY,
        lastY: e.clientY,
        armed: !needsLongPress,
        active: false,
        locked: group.some((b) => b.locked),
      }
      if (needsLongPress && !g.locked) {
        g.timer = setTimeout(() => {
          g.armed = true
          navigator.vibrate?.(12)
          setLiftedId(id)
        }, LONG_PRESS_MS)
      }
      gestureRef.current = g
      window.addEventListener('pointermove', onMoveRef.current)
      window.addEventListener('pointerup', onUpRef.current)
      window.addEventListener('pointercancel', onCancelRef.current)
      window.addEventListener('touchmove', onTouchMoveRef.current, { passive: false })
    },
    [clientToMin],
  )

  /** Press on empty grid: drag up or down to size a new block, release to create it. */
  const createStart = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (gestureRef.current || useUi.getState().selecting) return
      const at = clientToMin(e.clientY)
      const needsLongPress = e.pointerType === 'touch'
      const g: Gesture = {
        id: NEW_ID,
        kind: 'create',
        pointerId: e.pointerId,
        origin: { start: at, end: at },
        group: [],
        mode: 'push',
        restY: e.clientY,
        grabOffset: 0,
        downX: e.clientX,
        downY: e.clientY,
        lastY: e.clientY,
        armed: !needsLongPress,
        active: false,
        locked: false,
      }
      if (needsLongPress) {
        g.timer = setTimeout(() => {
          // Show the first slot right away so the long-press has visible feedback.
          g.armed = true
          g.active = true
          navigator.vibrate?.(12)
          setPreview(computePreview(g, g.lastY))
          if (!rafRef.current) rafRef.current = requestAnimationFrame(autoScroll)
        }, LONG_PRESS_MS)
      }
      gestureRef.current = g
      window.addEventListener('pointermove', onMoveRef.current)
      window.addEventListener('pointerup', onUpRef.current)
      window.addEventListener('pointercancel', onCancelRef.current)
      window.addEventListener('touchmove', onTouchMoveRef.current, { passive: false })
    },
    [autoScroll, clientToMin, computePreview],
  )

  // ---- tap vs double-tap ----------------------------------------------------
  const lastTap = useRef<{ id: string; at: number; timer: ReturnType<typeof setTimeout> } | null>(null)
  const onTapRef = useRef((id: string) => {
    if (useUi.getState().selecting) {
      useUi.getState().toggleSelected(id)
      return
    }
    const prev = lastTap.current
    const now = Date.now()
    if (prev && prev.id === id && now - prev.at < DOUBLE_TAP_MS) {
      clearTimeout(prev.timer)
      lastTap.current = null
      startFocus(id)
      return
    }
    if (prev) clearTimeout(prev.timer)
    lastTap.current = { id, at: now, timer: setTimeout(() => useUi.getState().edit(id), DOUBLE_TAP_MS) }
  })
  const onTap = (id: string) => onTapRef.current(id)
  useEffect(() => () => clearTimeout(lastTap.current?.timer), [])

  // ---- block actions ------------------------------------------------------
  const actions = useMemo<BlockActions>(
    () => ({
      gestureStart,
      cap(id) {
        const r = useStore.getState().capBlock(id)
        if (!r.ok) return
        useUi.getState().bounce(r.moves.map((m) => m.id).filter((m) => m !== id))
        useUi.getState().notify(r.freed > 0 ? `🎉 Capped early — reclaimed ${Math.round(r.freed)} min` : '✅ Done')
      },
      startNow(id) {
        const r = useStore.getState().startNow(id)
        if (r.ok) useUi.getState().bounce(r.moves.map((m) => m.id))
        else useUi.getState().notify(failureMessage(r))
      },
      focus: startFocus,
      toggleLock: (id) => useStore.getState().toggleLock(id),
      toggleComplete: (id) => useStore.getState().toggleComplete(id),
      nudge(id, kind, dir) {
        const { blocks, settings } = useStore.getState()
        const b = blocks.find((x) => x.id === id)
        if (!b || b.locked) return
        const step = settings.grid * dir
        const start = kind === 'move' ? b.start + step : b.start
        const end = b.end + step
        if (end - start < MIN_DURATION) return
        const r = useStore.getState().moveBlock(id, start, end)
        if (!r.ok) useUi.getState().notify(failureMessage(r))
      },
      open(id) {
        if (useUi.getState().selecting) useUi.getState().toggleSelected(id)
        else useUi.getState().edit(id)
      },
      remove(id) {
        useStore.getState().deleteBlock(id)
        useUi.getState().notify('🗑️ Block deleted')
      },
    }),
    [gestureStart],
  )

  // ---- routine drop preview -----------------------------------------------
  const routinePreview = useMemo(() => {
    if (!routineDrag) return null
    const m = probe(routineDrag.x, routineDrag.y)
    const routine = routines.find((r) => r.id === routineDrag.routineId)
    if (m == null || !routine) return null
    const start = routineDropStart(routine, m, bounds, settings.grid)
    const ghosts = routineToBlocks(routine, start, date, settings.grid, (i) => `ghost-${i}`)
    const result = resolveCollisions(
      [...blocks, ...ghosts],
      ghosts.map(({ id, start, end }) => ({ id, start, end })),
      { ...resolveOptionsFor({ date, settings }), direction: 'down' },
    )
    return { ghosts, result }
  }, [routineDrag, routines, blocks, date, settings, probe])

  // ---- where each block is drawn right now --------------------------------
  const display = useMemo(() => {
    const pos = new Map(blocks.map((b) => [b.id, { start: b.start, end: b.end }]))
    const displaced = new Set<string>()
    const apply = (result: ResolveResult | undefined, skip: (id: string) => boolean) => {
      if (!result?.ok) return
      for (const m of result.moves) {
        if (skip(m.id)) continue
        pos.set(m.id, { start: m.start, end: m.end })
        displaced.add(m.id)
      }
    }
    if (preview) {
      apply(preview.result, (id) => preview.raw.has(id))
      for (const [id, span] of preview.raw) pos.set(id, span)
    }
    apply(routinePreview?.result, (id) => id.startsWith('ghost-'))
    return { pos, displaced }
  }, [blocks, preview, routinePreview])

  // Tell the timer pane and Now strip where blocks would land, so they can preview the drag.
  useEffect(() => {
    if (!preview?.result.ok) {
      useUi.getState().setLanding(null)
      return
    }
    const landing: Record<string, Span> = {}
    for (const m of [...preview.result.moves, ...preview.targets]) landing[m.id] = { start: m.start, end: m.end }
    useUi.getState().setLanding(landing)
  }, [preview])
  useEffect(() => () => useUi.getState().setLanding(null), [])

  // Select mode belongs to one day, and forgets blocks that are gone.
  useEffect(() => {
    useUi.getState().stopSelecting()
  }, [date])
  useEffect(() => {
    const { selecting, selected, setSelected } = useUi.getState()
    if (!selecting) return
    const ids = new Set(blocks.map((b) => b.id))
    if ([...selected].some((id) => !ids.has(id))) setSelected([...selected].filter((id) => ids.has(id)))
  }, [blocks])
  useEffect(() => {
    if (!selecting) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useUi.getState().stopSelecting()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecting])

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const activeId = isToday ? blocks.find((b) => !b.completed && b.start <= nowMin && nowMin < b.end)?.id : undefined

  // ---- slivers: blocks too short on screen to hold their own text ---------
  const isSliver = (span: Span) => (span.end - span.start) * pxPerMin < SLIVER_PX
  // Only committed blocks decide the rail, so the lane doesn't jump mid-drag.
  const hasRail = blocks.some(isSliver)
  /** Where a block lands if the current drag is released: snapped target, cascade result, or where it is. */
  const landing = (b: TimeBlock): Span => {
    const target = preview?.targets.find((t) => t.id === b.id)
    if (target) return target
    return preview?.raw.has(b.id) ? b : display.pos.get(b.id)!
  }
  // 10 minutes or less, or drawn tiny at this zoom.
  const hasPullTab = (b: TimeBlock) => b.end - b.start <= PULL_TAB_MINUTES || (b.end - b.start) * pxPerMin < TINY_PX
  const slivers = blocks.filter((b) => isSliver(display.pos.get(b.id)!))
  const flagTops = layoutFlags(
    slivers.map((b) => {
      const p = display.pos.get(b.id)!
      return { id: b.id, center: yOf((p.start + p.end) / 2) }
    }),
    FLAG_HEIGHT,
    4,
    0,
    contentHeight,
  )

  // ---- initial scroll: now (today) or first block -------------------------
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !hydrated) return
    const first = [...blocks].sort((a, b) => a.start - b.start)[0]
    const focus = isToday ? nowMin - 90 : first ? first.start - 45 : 8 * 60
    el.scrollTop = Math.max(0, yOf(focus))
    // Deliberately only when the day changes, not on every edit.
  }, [hydrated, date])

  const hours = []
  for (let h = settings.dayStartHour; h <= settings.dayEndHour; h++) hours.push(h)

  const dragTarget = preview && { ...preview.target, ok: preview.result.ok }
  const dragTargets = preview?.targets ?? []
  const creating = preview?.id === NEW_ID
  const newColor = categories[0]?.color ?? '#ddd'

  return (
    <div ref={scrollRef} className="relative h-full overflow-y-auto overscroll-contain" data-testid="timeline">
      <NowStrip />
      <div className={`px-0 pt-4 ${selecting ? 'pb-44' : 'pb-24'}`}>
        <div
          ref={contentRef}
          onPointerDown={createStart}
          className="timeline-content relative cursor-copy select-none"
          data-rail={hasRail || undefined}
          style={{
            height: contentHeight,
            backgroundImage: `linear-gradient(to bottom, var(--grid-strong) 2px, transparent 2px), linear-gradient(to bottom, var(--grid) 1px, transparent 1px)`,
            backgroundSize: `100% ${settings.hourHeight}px, 100% ${settings.hourHeight / 4}px`,
            backgroundPosition: '0 -1px, 0 0',
            backgroundClip: 'content-box',
          }}
          aria-label="Timeline. Click an empty slot to add a block, or press and drag to size it."
        >
          {/* hour gutter */}
          {hours.map((h) => (
            <div
              key={h}
              className="pointer-events-none absolute left-0 w-[56px] -translate-y-1/2 pr-2 text-right font-mono text-[11px] font-black text-muted"
              style={{ top: yOf(h * 60) }}
            >
              <span className="bg-bg px-0.5">{String(h % 24).padStart(2, '0')}:00</span>
            </div>
          ))}
          <div className="pointer-events-none absolute top-0 bottom-0 left-[58px] w-[3px] bg-line" />

          {/* snap targets while dragging */}
          {dragTarget &&
            dragTargets.map((t) => (
              <div
                key={t.id}
                className="lane pointer-events-none border-[3px] border-dashed"
                style={{
                  top: yOf(t.start),
                  height: (t.end - t.start) * pxPerMin,
                  borderColor: dragTarget.ok ? 'var(--line)' : 'var(--hot)',
                  background: !dragTarget.ok
                    ? 'color-mix(in oklab, var(--hot) 15%, transparent)'
                    : creating
                      ? `color-mix(in oklab, ${newColor} 60%, transparent)`
                      : 'transparent',
                  zIndex: 5,
                }}
              />
            ))}
          {dragTarget && (
            <span
              className="pointer-events-none absolute right-5 -translate-y-full overflow-hidden px-1.5 py-0.5 font-mono text-xs font-black text-white sm:right-7"
              style={{ top: yOf(dragTarget.start) - 4, zIndex: 40, background: dragTarget.ok ? '#111' : 'var(--hot)' }}
            >
              {preview.mode === 'slot' && '↕ slot in · '}
              {formatTime(dragTarget.start)}–{formatTime(dragTarget.end)}
              {creating && ` · ${formatDuration(dragTarget.end - dragTarget.start)}`}
              {hold && (
                <>
                  <span className="block font-sans text-[10px] tracking-wide opacity-80">
                    hold to {hold.to === 'slot' ? 'slot in' : 'push'}
                  </span>
                  <span key={hold.key} className="hold-fill absolute inset-x-0 bottom-0 h-[3px] bg-accent" aria-hidden="true" />
                </>
              )}
            </span>
          )}

          {/* routine ghosts while dragging from the deck */}
          <AnimatePresence>
            {routinePreview?.ghosts.map((g) => (
              <motion.div
                key={g.id}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0, top: yOf(g.start), height: (g.end - g.start) * pxPerMin }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                className="lane pointer-events-none flex items-center gap-1.5 border-[3px] border-dashed px-2 text-xs font-black"
                style={{
                  zIndex: 25,
                  background: catById.get(g.categoryId)?.color ?? '#ddd',
                  color: inkOn(catById.get(g.categoryId)?.color ?? '#ddd'),
                  borderColor: routinePreview.result.ok ? '#111' : 'var(--hot)',
                  opacity: 0.85,
                }}
              >
                <span>{catById.get(g.categoryId)?.emoji}</span>
                <span className="truncate">{g.title}</span>
              </motion.div>
            ))}
          </AnimatePresence>

          {blocks.map((b) => {
            const p = display.pos.get(b.id)!
            const isDragging = !!preview?.raw.has(b.id)
            return (
              <BlockView
                key={b.id}
                block={b}
                category={catById.get(b.categoryId)}
                top={yOf(p.start)}
                liveStart={landing(b).start}
                liveEnd={landing(b).end}
                height={Math.max(6, (p.end - p.start) * pxPerMin)}
                mode={
                  isDragging
                    ? 'dragging'
                    : display.displaced.has(b.id) || bouncing.has(b.id)
                      ? 'displaced'
                      : 'idle'
                }
                lifted={liftedId === b.id}
                invalid={isDragging && !preview!.result.ok}
                slotting={isDragging && preview!.mode === 'slot'}
                pullTab={hasPullTab(b)}
                selecting={selecting}
                selected={selected.has(b.id)}
                isActive={activeId === b.id}
                focused={focusBlockId === b.id}
                isPast={isToday ? b.end <= nowMin : date < today}
                canStart={isToday && !b.completed && !b.locked && b.start > nowMin}
                actions={actions}
              />
            )
          })}

          {/* Slivers are hard to hit: a taller invisible handle each to move them, shortest on top. */}
          {slivers
            .filter((b) => !preview?.raw.has(b.id))
            .sort((a, b) => b.end - b.start - (a.end - a.start))
            .map((b) => {
              const p = display.pos.get(b.id)!
              return (
                <div
                  key={b.id}
                  className="lane cursor-grab"
                  style={{ top: yOf((p.start + p.end) / 2) - SLIVER_HIT / 2, height: SLIVER_HIT, zIndex: 13 }}
                  onPointerDown={(e) => actions.gestureStart(e, b.id, 'move')}
                  aria-hidden="true"
                />
              )
            })}

          {/* Short blocks get a pull tab under their bottom edge: a bigger target than the edge itself. */}
          {blocks
            .filter((b) => !b.locked && !selecting && !preview?.raw.has(b.id) && hasPullTab(b))
            .map((b) => {
              const p = display.pos.get(b.id)!
              const color = catById.get(b.categoryId)?.color ?? '#dddddd'
              return (
                <div
                  key={b.id}
                  className="lane pointer-events-none flex justify-center"
                  style={{ top: yOf(p.end) - 2, height: TAB_HIT, zIndex: 14 }}
                >
                  <div
                    className="group/tab pointer-events-auto flex w-14 cursor-ns-resize touch-none justify-center"
                    onPointerDown={(e) => actions.gestureStart(e, b.id, 'end')}
                    data-tip="Drag to change the length"
                    aria-hidden="true"
                  >
                    <span
                      className="flex h-2.5 w-9 items-center justify-center border-2 border-t-0 border-line group-hover/tab:h-3"
                      style={{ background: color }}
                    >
                      <span className="h-0.5 w-4 opacity-60" style={{ background: inkOn(color) }} />
                    </span>
                  </div>
                </div>
              )
            })}

          {hasRail && (
            <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: 'calc(100% - var(--lane-right))' }}>
              <svg className="absolute top-0 left-0 overflow-visible" width={FLAG_INSET} height={contentHeight} aria-hidden="true">
                {slivers.map((b) => {
                  const p = display.pos.get(b.id)!
                  const from = yOf((p.start + p.end) / 2)
                  const to = (flagTops.get(b.id) ?? from) + FLAG_HEIGHT / 2
                  return <path key={b.id} d={`M0 ${from} H3 L${FLAG_INSET} ${to}`} fill="none" stroke="var(--line)" strokeWidth={2} />
                })}
              </svg>
              {slivers.map((b) => (
                <SliverFlag
                  key={b.id}
                  end={landing(b).end}
                  block={b}
                  category={catById.get(b.categoryId)}
                  top={flagTops.get(b.id) ?? 0}
                  active={activeId === b.id}
                  nowMin={nowMin}
                  selecting={selecting}
                  selected={selected.has(b.id)}
                  onPointerDown={(e) => actions.gestureStart(e, b.id, 'move')}
                />
              ))}
            </div>
          )}

          {isToday && <NowLine yOf={yOf} bounds={bounds} />}
        </div>
      </div>
    </div>
  )
}

/**
 * A drag that ends off the element it started on makes the browser fire
 * `click` on their common ancestor — the timeline background, which would
 * create a block. Eat that one click.
 */
export function swallowNextClick() {
  const swallow = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
}

/** In push mode a wall (the day's edge, or "now") stops the drag where it last fit instead of turning it red. */
function pushPreview(g: Gesture, p: DragPreview): DragPreview {
  if (p.result.ok) {
    g.lastOk = p
    return p
  }
  if (p.result.reason === 'out-of-bounds' && g.lastOk) return g.lastOk
  return p
}

function createBlock(start: Minutes, end: Minutes) {
  const { result, id } = useStore.getState().addBlock({ start, end })
  if (result.ok) useUi.getState().edit(id)
  else useUi.getState().notify(failureMessage(result))
}

function startFocus(id: string) {
  const b = useStore.getState().blocks.find((x) => x.id === id)
  if (!b) return
  if (b.date !== toDateKey(new Date())) {
    useUi.getState().notify('🍅 Pomodoros are for today’s blocks')
    return
  }
  void usePomodoro.getState().startFor(id, { run: true })
}

/** The label for a sliver: its details, beside it in the rail. Also a drag handle for it. */
function SliverFlag({
  block,
  category,
  top,
  end,
  active,
  nowMin,
  selecting,
  selected,
  onPointerDown,
}: {
  block: TimeBlock
  category: Category | undefined
  top: number
  /** Live end time, so "Xm left" follows a drag. */
  end: number
  active: boolean
  nowMin: number
  selecting: boolean
  selected: boolean
  onPointerDown(e: PointerEvent<HTMLElement>): void
}) {
  const color = category?.color ?? '#dddddd'
  const detail = active ? `${Math.max(1, Math.ceil(end - nowMin))}m left` : formatDuration(block.end - block.start)
  return (
    <motion.div
      initial={false}
      animate={{ top }}
      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
      className="pointer-events-auto absolute right-1.5 flex cursor-grab items-center gap-1 border-2 border-line px-1.5 text-[11px] leading-none font-black shadow-brutal-sm select-none"
      style={{
        left: FLAG_INSET,
        height: FLAG_HEIGHT,
        background: color,
        color: inkOn(color),
        opacity: block.completed ? 0.72 : 1,
        outline: selecting && selected ? '3px solid var(--accent)' : undefined,
        outlineOffset: 1,
      }}
      onPointerDown={onPointerDown}
      aria-hidden="true"
    >
      {selecting && (
        <span className={`grid size-3 shrink-0 place-items-center border-2 border-current ${selected ? 'bg-[#111] text-white' : ''}`}>
          {selected && <CheckIcon size={8} />}
        </span>
      )}
      {category?.emoji && <span className="shrink-0">{category.emoji}</span>}
      <span className={`min-w-0 flex-1 truncate ${block.completed ? 'line-through' : ''}`}>{block.title}</span>
      {block.locked && <span className="shrink-0">🔒</span>}
      <span className="shrink-0 font-mono text-[10px] opacity-80">{detail}</span>
    </motion.div>
  )
}

function NowLine({ yOf, bounds }: { yOf: (m: number) => number; bounds: { start: number; end: number } }) {
  const now = useClock((s) => s.now)
  const m = minutesOfDay(new Date(now))
  if (m < bounds.start || m > bounds.end) return null
  return (
    <div
      className="pointer-events-none absolute right-0 left-[44px] z-20 flex items-center"
      style={{ top: yOf(m), transform: 'translateY(-50%)', transition: 'top 1s linear' }}
      aria-hidden="true"
    >
      <span className="size-3.5 shrink-0 border-[3px] border-line bg-hot" />
      <span className="h-[3px] flex-1 bg-hot" />
    </div>
  )
}
