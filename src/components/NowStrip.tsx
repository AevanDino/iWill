import { useShallow } from 'zustand/react/shallow'
import { clamp, formatTime, minutesOfDay, toDateKey } from '../lib/time'
import { findActive } from '../hooks/useActiveBlock'
import { useStore } from '../store/appStore'
import { useClock } from '../store/clock'
import { usePomodoro } from '../store/pomodoroStore'
import { useUi } from '../store/uiStore'
import { tagStyle } from './tags/tagStyle'

/**
 * The block running right now, pinned to the top of the timeline: title,
 * time left and progress at a readable size, however short the block is.
 * Hidden while the timer pane is already showing that block.
 */
export function NowStrip() {
  const now = useClock((s) => s.now)
  const { date, blocks, categories, focusBlockId } = useStore(
    useShallow((s) => ({ date: s.date, blocks: s.blocks, categories: s.categories, focusBlockId: s.focusBlockId })),
  )
  const landing = useUi((s) => s.landing)
  const debt = usePomodoro((s) => s.breakDebt)
  const nowDate = new Date(now)
  if (date !== toDateKey(nowDate)) return null
  const nowMin = minutesOfDay(nowDate)
  const current = findActive(blocks, nowMin)
  if (!current || current.id === focusBlockId) return null
  // Mid-drag, count down to where the block will land.
  const active = landing?.[current.id] ? { ...current, ...landing[current.id] } : current

  const category = categories.find((c) => c.id === active.categoryId)
  const color = category?.color ?? '#dddddd'
  const left = Math.max(0, Math.round((active.end - nowMin) * 60))
  const progress = clamp((nowMin - active.start) / (active.end - active.start), 0, 1)
  const scrollTo = () =>
    document.querySelector(`[data-block-id="${active.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })

  return (
    <div className="sticky top-0 z-30 h-0">
      <button
        type="button"
        onClick={scrollTo}
        className="relative mx-3 mt-2 flex w-[calc(100%-1.5rem)] items-center gap-2.5 overflow-hidden border-[3px] border-line bg-paper py-1.5 pr-3 text-left shadow-brutal sm:mx-5 sm:w-[calc(100%-2.5rem)]"
        aria-label={`Now: ${active.title}, ${Math.ceil(left / 60)} minutes left. Show it on the timeline.`}
      >
        <span
          className="tagged grid w-9 shrink-0 place-items-center self-stretch border-r-[3px] text-base"
          style={tagStyle(color)}
          aria-hidden="true"
        >
          {category?.emoji ?? '📌'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="label block text-muted">Now · ends {formatTime(active.end)}</span>
          <span className="block truncate text-sm leading-tight font-black">
            {active.title}
            {debt?.blockId === active.id && (
              <span className="ml-1.5 font-mono text-[11px] font-bold text-muted">· {debt.minutes} min went to your break</span>
            )}
          </span>
        </span>
        <span className="shrink-0 font-mono text-lg font-black tabular-nums">
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </span>
        <span className="absolute inset-x-0 bottom-0 h-1 bg-ink/10" aria-hidden="true">
          <span
            className="tag-fill block h-full"
            style={{ ...tagStyle(color), width: `${progress * 100}%`, transition: 'width 1s linear' }}
          />
        </span>
      </button>
    </div>
  )
}
