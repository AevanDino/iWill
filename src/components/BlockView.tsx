import { memo, type KeyboardEvent, type PointerEvent } from 'react'
import { motion } from 'motion/react'
import { CASCADE_SPRING, INSTANT, SNAP_SPRING } from '../lib/physics'
import { clamp, formatDuration, formatTime, minutesOfDay } from '../lib/time'
import { useClock } from '../store/clock'
import type { Category, TimeBlock } from '../types'
import { tagStyle } from './tags/tagStyle'
import { CapIcon, CheckIcon, LockIcon, PlayIcon } from './icons'

export type GripKind = 'move' | 'start' | 'end'

/** Blocks shorter than this on screen are drawn as slivers; the timeline shows their details in a flag. */
export const SLIVER_PX = 16
/** Below this the block's text shrinks to one small line. */
export const TINY_PX = 22

export interface BlockActions {
  gestureStart(e: PointerEvent<HTMLElement>, id: string, kind: GripKind): void
  cap(id: string): void
  startNow(id: string): void
  focus(id: string): void
  toggleLock(id: string): void
  toggleComplete(id: string): void
  /** Keyboard nudge by one grid step: `move` shifts the block, `resize` moves its end. */
  nudge(id: string, kind: 'move' | 'resize', dir: 1 | -1): void
  open(id: string): void
  remove(id: string): void
}

interface Props {
  block: TimeBlock
  category: Category | undefined
  top: number
  /**
   * Where the block would land if the drag on screen were released (or its
   * committed times when nothing's moving). Countdowns use these so they
   * follow a move or resize live.
   */
  liveStart: number
  liveEnd: number
  height: number
  mode: 'idle' | 'dragging' | 'displaced'
  lifted: boolean
  invalid: boolean
  isActive: boolean
  /** A Pomodoro session is attached — highlighted, but still editable. */
  focused: boolean
  isPast: boolean
  canStart: boolean
  /** Being dragged in slot-in mode: it passes through blocks instead of pushing them. */
  slotting: boolean
  /** The timeline draws a pull tab under this block, so its own bottom grip stays invisible. */
  pullTab: boolean
  /** Select mode is on: taps toggle selection, and the block's own buttons step aside. */
  selecting: boolean
  selected: boolean
  actions: BlockActions
}


export const BlockView = memo(function BlockView({
  block,
  category,
  top,
  liveStart,
  liveEnd,
  height,
  mode,
  lifted,
  invalid,
  isActive,
  focused,
  isPast,
  canStart,
  slotting,
  pullTab,
  selecting,
  selected,
  actions,
}: Props) {
  const pinned = block.locked
  const color = category?.color ?? '#dddddd'
  const compact = height < 50
  const tiny = height < TINY_PX
  const sliver = height < SLIVER_PX
  // Slivers are too thin to grab by an edge: the timeline's pull tab resizes them instead.
  const resizable = !pinned && !selecting && !sliver
  const missed = isPast && !block.completed
  const raised = mode === 'dragging' || lifted

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('button')) return
    let grip = (target.closest('[data-grip]') as HTMLElement | null)?.dataset.grip as GripKind | undefined
    if (!grip && resizable && e.pointerType !== 'touch') {
      // The grip strips sit inside the border; treat the border band as edge too.
      const rect = e.currentTarget.getBoundingClientRect()
      const edge = Math.min(12, rect.height / 4)
      if (e.clientY - rect.top <= edge) grip = 'start'
      else if (rect.bottom - e.clientY <= edge) grip = 'end'
    }
    actions.gestureStart(e, block.id, grip ?? 'move')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        actions.open(block.id)
        break
      case 'ArrowUp':
        e.preventDefault()
        actions.nudge(block.id, e.shiftKey ? 'resize' : 'move', -1)
        break
      case 'ArrowDown':
        e.preventDefault()
        actions.nudge(block.id, e.shiftKey ? 'resize' : 'move', 1)
        break
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        actions.remove(block.id)
        break
    }
  }

  return (
    <motion.div
      role="button"
      tabIndex={0}
      data-block-id={block.id}
      aria-label={`${block.title}, ${formatTime(block.start)} to ${formatTime(block.end)}${block.completed ? ', done' : ''}${block.locked ? ', locked' : ''}${isActive ? ', in progress' : ''}${selecting && selected ? ', selected' : ''}`}
      aria-pressed={selecting ? selected : undefined}
      aria-keyshortcuts="Enter ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown Delete"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      initial={false}
      animate={{
        top,
        height,
        scale: raised ? 1.025 : 1,
        rotate: mode === 'dragging' ? -0.8 : 0,
        boxShadow: raised ? '8px 8px 0 0 var(--tag-shadow)' : '4px 4px 0 0 var(--tag-shadow)',
      }}
      transition={{
        top: mode === 'dragging' ? INSTANT : mode === 'displaced' ? CASCADE_SPRING : SNAP_SPRING,
        height: mode === 'dragging' ? INSTANT : SNAP_SPRING,
        default: SNAP_SPRING,
      }}
      className={[
        'lane tagged select-none overflow-hidden outline-none',
        'focus-visible:ring-4 focus-visible:ring-accent focus-visible:ring-offset-2',
        pinned ? 'cursor-pointer' : mode === 'dragging' ? 'cursor-grabbing' : 'cursor-grab',
        isActive && mode === 'idle' ? 'is-active-block' : '',
      ].join(' ')}
      style={{
        zIndex: raised ? 30 : isActive ? 12 : 10,
        // Colours come from .tagged (a slab by day, a glowing edge at night); only "invalid" overrides them.
        ...tagStyle(color),
        borderStyle: block.locked && !sliver ? 'double' : slotting ? 'dashed' : 'solid',
        ...(invalid && { borderColor: 'var(--hot)' }),
        // A 3px border top and bottom would swallow a 7px sliver.
        borderWidth: sliver ? 2 : block.locked ? 5 : 3,
        filter: missed ? 'saturate(0.35)' : undefined,
        outline: selected && selecting ? '4px solid var(--accent)' : focused ? '4px solid var(--phase-focus)' : undefined,
        outlineOffset: 3,
        opacity: block.completed && !isActive ? 0.72 : 1,
      }}
    >
      {isActive && <LiquidFill start={liveStart} end={liveEnd} />}
      {(block.completed || missed) && <div className="hatched pointer-events-none absolute inset-0" />}

      {resizable && (
        <>
          <div
            data-grip="start"
            className="absolute inset-x-0 top-0 z-20 h-2 cursor-ns-resize touch-none"
            aria-hidden="true"
          />
          <div
            data-grip="end"
            className="group/grip absolute inset-x-0 bottom-0 z-20 flex h-2.5 cursor-ns-resize touch-none justify-center"
            aria-hidden="true"
          >
            {!pullTab && <span className="mt-0.5 h-1 w-8 bg-current opacity-25 group-hover/grip:opacity-70" />}
          </div>
        </>
      )}

      {sliver ? (
        height >= 12 &&
        category?.emoji && (
          <span className="relative z-10 flex h-full items-center px-1.5 text-[9px] leading-none" aria-hidden="true">
            {category.emoji}
          </span>
        )
      ) : (
        <div
          className={`relative z-10 flex h-full min-w-0 gap-2 px-2 ${compact ? 'items-center py-0' : 'items-start py-1.5'}`}
        >
          <div className="min-w-0 flex-1">
            <div
              className={`flex items-center gap-1.5 font-black leading-tight ${tiny ? 'text-[11px]' : 'text-sm'} ${block.completed ? 'line-through decoration-[3px]' : ''}`}
            >
              {selecting && (
                <span
                  className={`grid size-4 shrink-0 place-items-center border-2 border-current ${selected ? 'bg-chip text-on-chip' : ''}`}
                  aria-hidden="true"
                >
                  {selected && <CheckIcon size={10} />}
                </span>
              )}
              {category?.emoji && <span aria-hidden="true">{category.emoji}</span>}
              <span className="truncate">{block.title}</span>
              {focused && (
                <span className="shrink-0 border-2 border-line bg-(--phase-focus) px-1 text-[10px] font-black tracking-wider text-[#111] uppercase">
                  Focus
                </span>
              )}
              {!!block.pomodoros && (
                <span className="shrink-0 font-mono text-[11px] font-bold" data-tip={`${block.pomodoros} Pomodoros done`}>
                  🍅{block.pomodoros}
                </span>
              )}
              {compact && !tiny && (
                <span className="shrink-0 font-mono text-[11px] font-bold opacity-70">{formatTime(block.start)}</span>
              )}
            </div>
            {!compact && (
              <div className="mt-0.5 font-mono text-[11px] font-bold opacity-75">
                {formatTime(block.start)}–{formatTime(block.end)} · {formatDuration(block.end - block.start)}
              </div>
            )}
            {isActive && height >= 64 && <TimeLeft end={liveEnd} />}
          </div>

          {!tiny && mode !== 'dragging' && !selecting && (
            <div className="flex shrink-0 items-center gap-1">
              {block.locked && (
                <SmallButton label="Unlock block" onClick={() => actions.toggleLock(block.id)}>
                  <LockIcon size={13} />
                </SmallButton>
              )}
              {!block.completed && !focused && (isActive || canStart) && (
                <SmallButton label={`Focus on ${block.title} with a Pomodoro`} onClick={() => actions.focus(block.id)}>
                  <span className="text-[12px] leading-none" aria-hidden="true">
                    🍅
                  </span>
                </SmallButton>
              )}
              {isActive ? (
                <button
                  type="button"
                  onClick={() => actions.cap(block.id)}
                  className="flex items-center gap-1 border-[3px] border-chip bg-chip px-2 py-0.5 text-[11px] font-black tracking-wider text-on-chip uppercase shadow-[2px_2px_0_0_var(--card)] hover:bg-[#ff3b3b] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                  data-tip="Finish now and pull the rest of your day up"
                >
                  <CapIcon size={12} /> Cap
                </button>
              ) : (
                <>
                  {canStart && (
                    <SmallButton label={`Start ${block.title} now`} onClick={() => actions.startNow(block.id)}>
                      <PlayIcon size={12} />
                    </SmallButton>
                  )}
                  <SmallButton
                    label={block.completed ? 'Mark not done' : 'Mark done'}
                    pressed={block.completed}
                    onClick={() => actions.toggleComplete(block.id)}
                  >
                    <CheckIcon size={13} />
                  </SmallButton>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
})

function SmallButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string
  onClick(): void
  pressed?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      data-tip={label}
      onClick={onClick}
      className={`grid size-6 place-items-center border-2 border-line ${pressed ? 'bg-chip text-on-chip' : 'bg-card/80 text-ink'} hover:-translate-x-px hover:-translate-y-px hover:shadow-[2px_2px_0_0_var(--shadow)] active:translate-0 active:shadow-none`}
    >
      {children}
    </button>
  )
}

/** Wave path spanning 200 units, period 20 — so a -50% translate loops seamlessly. */
const WAVE = `M0 0 V4 Q5 8 10 4 ${Array.from({ length: 19 }, (_, i) => `T${(i + 2) * 10} 4`).join(' ')} V0 Z`

/**
 * The "liquid" fill: drains in from the top as time elapses. Its colour
 * heats toward red over the last 20% so the end sneaks up visibly.
 */
function LiquidFill({ start, end }: { start: number; end: number }) {
  const now = useClock((s) => s.now)
  const progress = clamp((minutesOfDay(new Date(now)) - start) / (end - start), 0, 1)
  const heat = clamp((progress - 0.8) / 0.2, 0, 1)
  // --liquid comes from .tagged: the tag darkened by day, its glow at night.
  const fill = `color-mix(in oklab, var(--liquid) ${Math.round((1 - heat) * 100)}%, #ff3b3b)`

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0"
      style={{ height: `${progress * 100}%`, background: fill, transition: 'height 1s linear, background 1s linear' }}
      role="progressbar"
      aria-label="Time elapsed"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg
        className="liquid-wave absolute top-full left-0 h-2 w-[200%]"
        viewBox="0 0 200 8"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d={WAVE} style={{ fill, transition: 'fill 1s linear' }} />
      </svg>
    </div>
  )
}

function TimeLeft({ end }: { end: number }) {
  const now = useClock((s) => s.now)
  const left = Math.max(0, Math.round((end - minutesOfDay(new Date(now))) * 60))
  const mm = Math.floor(left / 60)
  const ss = String(left % 60).padStart(2, '0')
  return (
    <div className="mt-1 inline-block bg-chip px-1.5 py-0.5 font-mono text-xs font-black text-on-chip" aria-live="off">
      {mm}:{ss} left
    </div>
  )
}
