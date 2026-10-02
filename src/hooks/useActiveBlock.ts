import { useEffect, useRef } from 'react'
import { formatTime, minutesOfDay, toDateKey } from '../lib/time'
import { sendNotification } from '../lib/notify'
import { useStore } from '../store/appStore'
import { useClock } from '../store/clock'
import { usePomodoro } from '../store/pomodoroStore'
import type { TimeBlock } from '../types'

export function findActive(blocks: readonly TimeBlock[], nowMin: number): TimeBlock | undefined {
  return blocks.find((b) => !b.completed && b.start <= nowMin && nowMin < b.end)
}

/**
 * The timer loop: watches the clock, and when the running block's time runs
 * out it's marked complete and a local notification announces what's next.
 * Blocks that were already in the past when the app opened are left alone —
 * we only know a block was "done" if we saw it running.
 */
export function useActiveBlockTimer() {
  const now = useClock((s) => s.now)
  const lastActive = useRef<string | null>(null)

  useEffect(() => {
    const { date, blocks, settings, toggleComplete } = useStore.getState()
    const nowDate = new Date(now)
    if (date !== toDateKey(nowDate)) {
      lastActive.current = null
      return
    }
    const nowMin = minutesOfDay(nowDate)
    const active = findActive(blocks, nowMin)

    const prevId = lastActive.current
    if (prevId && prevId !== active?.id) {
      const prev = blocks.find((b) => b.id === prevId)
      if (prev && !prev.completed && nowMin >= prev.end) {
        toggleComplete(prev.id)
        if (settings.notifications) {
          const next = blocks
            .filter((b) => !b.completed && b.start >= prev.end)
            .sort((a, b) => a.start - b.start)[0]
          sendNotification(
            `⏰ Time's up: ${prev.title}`,
            next ? `Next: ${next.title} at ${formatTime(next.start)}` : 'Nothing else scheduled. Nice.',
          )
        }
      }
    }
    if (active && active.id !== prevId && usePomodoro.getState().hydrated) usePomodoro.getState().blockStarted(active.id)
    lastActive.current = active?.id ?? null
  }, [now])
}
