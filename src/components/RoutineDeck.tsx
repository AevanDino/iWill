import { useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { findFreeSlot } from '../lib/collision'
import { ceilTo, formatDuration, formatTime, minutesOfDay, snap, toDateKey } from '../lib/time'
import { boundsOf, routineDropStart, routineDuration, useStore } from '../store/appStore'
import { useUi } from '../store/uiStore'
import type { Category, RoutineStep, RoutineTemplate } from '../types'
import { CloseIcon, GripIcon, PlusIcon, TrashIcon } from './icons'
import { failureMessage } from './messages'
import { tagStyle } from './tags/tagStyle'
import { swallowNextClick } from './Timeline'

const DRAG_SLOP = 5


export function RoutineDeck() {
  const open = useUi((s) => s.deckOpen)
  const dragging = useUi((s) => s.routineDrag)
  const routines = useStore((s) => s.routines)
  const categories = useStore((s) => s.categories)
  const [editing, setEditing] = useState<RoutineTemplate | 'new' | null>(null)

  return (
    <>
      <AnimatePresence initial={false}>
        {open && (
          <motion.aside
            key="deck"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: dragging ? 0.15 : 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className={[
              'flex flex-col border-line bg-paper',
              '@max-4xl/planner:fixed @max-4xl/planner:inset-x-2 @max-4xl/planner:bottom-2 @max-4xl/planner:z-40 @max-4xl/planner:max-h-[62dvh] @max-4xl/planner:border-[3px] @max-4xl/planner:shadow-brutal-lg',
              '@4xl/planner:w-[340px] @4xl/planner:shrink-0 @4xl/planner:border-l-[3px]',
              dragging ? '@max-4xl/planner:pointer-events-none' : '',
            ].join(' ')}
            aria-label="Routine deck"
          >
            <div className="flex items-center justify-between gap-2 border-b-[3px] border-line bg-accent px-4 py-3 text-[#111]">
              <div>
                <h2 className="text-lg leading-none font-black tracking-tight uppercase">Routine deck</h2>
                <p className="mt-1 text-xs font-bold opacity-75">Drag a card onto the timeline</p>
              </div>
              <button
                type="button"
                className="btn btn-icon bg-white! text-[#111]!"
                aria-label="Close routine deck"
                onClick={() => useUi.getState().toggleDeck(false)}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {editing ? (
                <RoutineForm
                  initial={editing === 'new' ? undefined : editing}
                  categories={categories}
                  onDone={() => setEditing(null)}
                />
              ) : (
                <>
                  {routines.map((r) => (
                    <RoutineCard key={r.id} routine={r} categories={categories} onEdit={() => setEditing(r)} />
                  ))}
                  <button type="button" className="btn w-full border-dashed py-3" onClick={() => setEditing('new')}>
                    <PlusIcon size={16} /> New routine
                  </button>
                </>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
      <DragGhost />
    </>
  )
}

function RoutineCard({
  routine,
  categories,
  onEdit,
}: {
  routine: RoutineTemplate
  categories: Category[]
  onEdit(): void
}) {
  const total = routineDuration(routine)
  const colorOf = (id: string) => categories.find((c) => c.id === id)?.color ?? '#ddd'

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    const target = e.target as HTMLElement
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (target.closest('button')) return
    // On touch, only the grip starts a drag so the list can still scroll.
    if (e.pointerType === 'touch' && !target.closest('[data-grip]')) return

    const pointerId = e.pointerId
    const x0 = e.clientX
    const y0 = e.clientY
    let active = false
    const ui = useUi.getState()

    const move = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      if (!active && Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_SLOP) return
      active = true
      ui.setRoutineDrag({ routineId: routine.id, x: ev.clientX, y: ev.clientY })
    }
    const finish = (ev: globalThis.PointerEvent, drop: boolean) => {
      if (ev.pointerId !== pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      if (active) swallowNextClick()
      const minute = drop && active ? useUi.getState().probe?.(ev.clientX, ev.clientY) : null
      ui.setRoutineDrag(null)
      if (minute == null) return
      const store = useStore.getState()
      const start = routineDropStart(routine, minute, boundsOf(store.settings), store.settings.grid)
      const r = store.spawnRoutine(routine.id, start)
      ui.notify(r.ok ? `${routine.emoji ?? '✨'} ${routine.name} dropped at ${formatTime(start)}` : failureMessage(r))
    }
    const up = (ev: globalThis.PointerEvent) => finish(ev, true)
    const cancel = (ev: globalThis.PointerEvent) => finish(ev, false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  const addToNextSlot = () => {
    const store = useStore.getState()
    const bounds = boundsOf(store.settings)
    const now = new Date()
    const grid = store.settings.grid
    const from = store.date === toDateKey(now) ? ceilTo(minutesOfDay(now), grid) : Math.max(bounds.start, 9 * 60)
    const slot = findFreeSlot(store.blocks, total, snap(from, grid), bounds)
    if (slot == null) {
      ui().notify('🌙 No free slot left today — drag it in to push things around')
      return
    }
    const r = store.spawnRoutine(routine.id, slot)
    ui().notify(r.ok ? `${routine.emoji ?? '✨'} ${routine.name} added at ${formatTime(slot)}` : failureMessage(r))
  }

  return (
    <div
      onPointerDown={onPointerDown}
      className="group brutal cursor-grab bg-paper select-none active:cursor-grabbing"
      role="group"
      aria-label={`${routine.name}, ${formatDuration(total)}`}
    >
      <div className="flex items-start gap-2 p-3">
        <div data-grip className="-ml-1 touch-none pt-0.5 text-muted" data-tip="Drag onto the timeline">
          <GripIcon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-black">
            <span aria-hidden="true">{routine.emoji ?? '✨'}</span>
            <span className="truncate">{routine.name}</span>
          </div>
          <div className="font-mono text-xs font-bold text-muted">
            {routine.steps.length} blocks · {formatDuration(total)}
          </div>
        </div>
        <div className="flex gap-1">
          <button type="button" className="btn btn-icon px-2 text-xs" onClick={onEdit} aria-label={`Edit ${routine.name}`}>
            Edit
          </button>
          <button
            type="button"
            className="btn btn-icon bg-accent! text-[#111]!"
            onClick={addToNextSlot}
            aria-label={`Add ${routine.name} at the next free slot`}
            data-tip="Add at next free slot"
          >
            <PlusIcon size={16} />
          </button>
        </div>
      </div>
      <div className="flex h-5 border-t-[3px] border-line" aria-hidden="true">
        {routine.steps.map((s, i) => (
          <div
            key={i}
            className="h-full border-line not-last:border-r-2"
            style={{ flexGrow: s.duration, background: colorOf(s.categoryId) }}
            data-tip={`${s.title} · ${formatDuration(s.duration)}`}
          />
        ))}
      </div>
    </div>
  )
}

const ui = () => useUi.getState()

function DragGhost() {
  const drag = useUi((s) => s.routineDrag)
  const routine = useStore((s) => s.routines.find((r) => r.id === drag?.routineId))
  if (!drag || !routine) return null
  return createPortal(
    <div
      className="pointer-events-none fixed z-50 flex items-center gap-2 border-[3px] border-[#111] bg-accent px-3 py-1.5 text-sm font-black text-[#111] shadow-[5px_5px_0_0_var(--shadow)]"
      style={{ left: drag.x, top: drag.y, transform: 'translate(-12px, -130%) rotate(-3deg)' }}
    >
      <span>{routine.emoji ?? '✨'}</span>
      {routine.name}
      <span className="font-mono text-xs opacity-70">{formatDuration(routineDuration(routine))}</span>
    </div>,
    document.body,
  )
}

function RoutineForm({
  initial,
  categories,
  onDone,
}: {
  initial?: RoutineTemplate
  categories: Category[]
  onDone(): void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '✨')
  const fallbackCat = categories[0]?.id ?? 'focus'
  const [steps, setSteps] = useState<RoutineStep[]>(
    initial?.steps ?? [{ title: '', categoryId: fallbackCat, duration: 30 }],
  )
  const firstInput = useRef<HTMLInputElement>(null)

  const update = (i: number, patch: Partial<RoutineStep>) =>
    setSteps((s) => s.map((step, j) => (j === i ? { ...step, ...patch } : step)))

  const valid = name.trim() && steps.length > 0 && steps.every((s) => s.title.trim() && s.duration >= 5)

  const save = () => {
    if (!valid) return
    useStore.getState().saveRoutine({
      id: initial?.id,
      name: name.trim(),
      emoji: emoji.trim() || undefined,
      steps: steps.map((s) => ({ ...s, title: s.title.trim() })),
    })
    onDone()
  }

  return (
    <form
      className="brutal space-y-3 bg-paper p-3"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="flex gap-2">
        <label className="w-16">
          <span className="label">Icon</span>
          <input className="field text-center" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} />
        </label>
        <label className="flex-1">
          <span className="label">Name</span>
          <input
            ref={firstInput}
            autoFocus
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Morning Standup"
          />
        </label>
      </div>

      <div className="space-y-2">
        <span className="label">Blocks, in order</span>
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <select
              className="field tagged w-12! px-1! text-center"
              value={step.categoryId}
              onChange={(e) => update(i, { categoryId: e.target.value })}
              aria-label="Tag"
              style={tagStyle(categories.find((c) => c.id === step.categoryId)?.color)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
            <input
              className="field min-w-0 flex-1"
              value={step.title}
              onChange={(e) => update(i, { title: e.target.value })}
              placeholder="Block title"
              aria-label="Block title"
            />
            <input
              className="field w-16! px-1! text-center font-mono"
              type="number"
              min={5}
              step={5}
              value={step.duration}
              onChange={(e) => update(i, { duration: Number(e.target.value) })}
              aria-label="Minutes"
            />
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Remove block"
              disabled={steps.length === 1}
              onClick={() => setSteps((s) => s.filter((_, j) => j !== i))}
            >
              <CloseIcon size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn w-full border-dashed text-sm"
          onClick={() => setSteps((s) => [...s, { title: '', categoryId: s.at(-1)?.categoryId ?? fallbackCat, duration: 15 }])}
        >
          <PlusIcon size={14} /> Add block
        </button>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {initial && (
          <button
            type="button"
            className="btn btn-icon hover:bg-hot! hover:text-white!"
            aria-label="Delete routine"
            onClick={() => {
              useStore.getState().deleteRoutine(initial.id)
              onDone()
            }}
          >
            <TrashIcon size={16} />
          </button>
        )}
        <div className="flex-1" />
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn bg-accent! text-[#111]!" disabled={!valid}>
          Save
        </button>
      </div>
    </form>
  )
}
