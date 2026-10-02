import { useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  CALENDAR_MIN_HEIGHT,
  CALENDAR_MIN_WIDTH,
  SIDE_BY_SIDE_QUERY,
  TIMER_MIN_HEIGHT,
  TIMER_MIN_WIDTH,
} from '../../lib/layout'
import { clamp } from '../../lib/time'
import { clampSplit, DEFAULT_SPLIT, usePomodoro } from '../../store/pomodoroStore'

const STEP = 0.05

/** Timer below the calendar (not enough room side by side). */
function useStacked() {
  const [stacked, setStacked] = useState(() => !window.matchMedia(SIDE_BY_SIDE_QUERY).matches)
  useEffect(() => {
    const m = window.matchMedia(SIDE_BY_SIDE_QUERY)
    const on = () => setStacked(!m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return stacked
}

/** The timer's share, kept where both sides still get their minimum size. */
function fit(share: number, rootEl: HTMLElement, stacked: boolean) {
  const r = rootEl.getBoundingClientRect()
  const total = stacked ? r.height : r.width
  const lo = (stacked ? TIMER_MIN_HEIGHT : TIMER_MIN_WIDTH) / total
  const hi = 1 - (stacked ? CALENDAR_MIN_HEIGHT : CALENDAR_MIN_WIDTH) / total
  return clampSplit(lo <= hi ? clamp(share, lo, hi) : hi)
}

/**
 * Drag handle between the calendar and the timer. While dragging it writes
 * the CSS variable directly (no React re-render of the calendar per move),
 * and commits the ratio to the store — and localStorage — on release.
 */
export function SplitDivider() {
  const split = usePomodoro((s) => s.split)
  const stacked = useStacked()
  const [dragging, setDragging] = useState(false)

  const root = (el: Element) => el.closest<HTMLElement>('[data-split-root]')!

  const shareAt = (rootEl: HTMLElement, x: number, y: number) => {
    const r = rootEl.getBoundingClientRect()
    // The timer sits after the calendar: right of it side by side, below it when stacked.
    return fit(stacked ? (r.bottom - y) / r.height : (r.right - x) / r.width, rootEl, stacked)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    const rootEl = root(el)
    el.setPointerCapture(e.pointerId)
    setDragging(true)
    let latest = split
    const move = (ev: globalThis.PointerEvent) => {
      latest = shareAt(rootEl, ev.clientX, ev.clientY)
      rootEl.style.setProperty('--split', String(latest))
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      setDragging(false)
      usePomodoro.getState().setSplit(latest)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Arrow toward the calendar grows the timer.
    const grow = stacked ? 'ArrowUp' : 'ArrowLeft'
    const shrink = stacked ? 'ArrowDown' : 'ArrowRight'
    const rootEl = root(e.currentTarget)
    const set = (share: number) => usePomodoro.getState().setSplit(fit(share, rootEl, stacked))
    if (e.key === grow) set(split + STEP)
    else if (e.key === shrink) set(split - STEP)
    else if (e.key === 'Home') set(DEFAULT_SPLIT)
    else return
    e.preventDefault()
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={stacked ? 'horizontal' : 'vertical'}
      aria-label="Resize calendar and timer"
      aria-valuenow={Math.round(split * 100)}
      aria-valuemin={20}
      aria-valuemax={85}
      aria-valuetext={`Timer ${Math.round(split * 100)}%, calendar ${Math.round((1 - split) * 100)}%`}
      data-tip="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => usePomodoro.getState().setSplit(DEFAULT_SPLIT)}
      className={[
        'group relative z-20 flex shrink-0 touch-none items-center justify-center bg-line outline-none select-none',
        'focus-visible:bg-accent hover:bg-accent',
        stacked ? 'h-3.5 w-full cursor-row-resize' : 'h-full w-3 cursor-col-resize',
        dragging ? 'bg-accent' : '',
      ].join(' ')}
    >
      {/* bigger invisible hit area for fingers */}
      <span className={`absolute ${stacked ? 'inset-x-0 -inset-y-2' : 'inset-y-0 -inset-x-2'}`} aria-hidden="true" />
      <span
        className={`flex gap-1 ${stacked ? 'flex-row' : 'flex-col'}`}
        aria-hidden="true"
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 bg-bg group-hover:bg-[#111] group-focus-visible:bg-[#111]" />
        ))}
      </span>
    </div>
  )
}
