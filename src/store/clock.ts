import { create } from 'zustand'

/**
 * One shared 1 Hz ticker. Components select just the slice they need
 * (e.g. the current minute) so only they re-render each second.
 */
export const useClock = create<{ now: number }>(() => ({ now: Date.now() }))

let timer: ReturnType<typeof setInterval> | undefined

export function startClock() {
  if (timer) return
  const tick = () => useClock.setState({ now: Date.now() })
  // Align to the wall-clock second so the display doesn't drift.
  setTimeout(() => {
    tick()
    timer = setInterval(tick, 1000)
  }, 1000 - (Date.now() % 1000))
  document.addEventListener('visibilitychange', tick)
}
