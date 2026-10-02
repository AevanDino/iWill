import { useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { clampSplit, DEFAULT_SPLIT, usePomodoro } from '../../store/pomodoroStore'

const STEP = 0.05

function usePortrait() {
  const query = '(orientation: portrait)'
  const [portrait, setPortrait] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setPortrait(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return portrait
}

/**
 * Drag handle between the calendar and the timer. While dragging it writes
 * the CSS variable directly (no React re-render of the calendar per move),
 * and commits the ratio to the store — and localStorage — on release.
 */
export function SplitDivider() {
  const split = usePomodoro((s) => s.split)
  const portrait = usePortrait()
  const [dragging, setDragging] = useState(false)

  const root = (el: Element) => el.closest<HTMLElement>('[data-split-root]')!

  const shareAt = (rootEl: HTMLElement, x: number, y: number) => {
    const r = rootEl.getBoundingClientRect()
    // The timer sits after the calendar: right of it in landscape, below it in portrait.
    return clampSplit(portrait ? (r.bottom - y) / r.height : (r.right - x) / r.width)
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
    const grow = portrait ? 'ArrowUp' : 'ArrowLeft'
    const shrink = portrait ? 'ArrowDown' : 'ArrowRight'
    const set = usePomodoro.getState().setSplit
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
      aria-orientation={portrait ? 'horizontal' : 'vertical'}
      aria-label="Resize calendar and timer"
      aria-valuenow={Math.round(split * 100)}
      aria-valuemin={20}
      aria-valuemax={85}
      aria-valuetext={`Timer ${Math.round(split * 100)}%, calendar ${Math.round((1 - split) * 100)}%`}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => usePomodoro.getState().setSplit(DEFAULT_SPLIT)}
      className={[
        'group relative z-20 flex shrink-0 touch-none items-center justify-center bg-line outline-none select-none',
        'focus-visible:bg-accent hover:bg-accent',
        portrait ? 'h-3.5 w-full cursor-row-resize' : 'h-full w-3 cursor-col-resize',
        dragging ? 'bg-accent' : '',
      ].join(' ')}
    >
      {/* bigger invisible hit area for fingers */}
      <span className={`absolute ${portrait ? 'inset-x-0 -inset-y-2' : 'inset-y-0 -inset-x-2'}`} aria-hidden="true" />
      <span
        className={`flex gap-1 ${portrait ? 'flex-row' : 'flex-col'}`}
        aria-hidden="true"
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 bg-bg group-hover:bg-[#111] group-focus-visible:bg-[#111]" />
        ))}
      </span>
    </div>
  )
}
