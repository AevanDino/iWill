import { findFreeSlot } from '../lib/collision'
import { formatDateLabel, minutesOfDay, shiftDate, toDateKey } from '../lib/time'
import { boundsOf, useStore } from '../store/appStore'
import { useClock } from '../store/clock'
import { usePomodoro } from '../store/pomodoroStore'
import { useUi } from '../store/uiStore'
import { ChevronLeftIcon, ChevronRightIcon, GearIcon, PlusIcon, SelectIcon, StackIcon } from './icons'
import { failureMessage } from './messages'

export function Header() {
  const date = useStore((s) => s.date)
  const setDate = useStore((s) => s.setDate)
  const deckOpen = useUi((s) => s.deckOpen)
  const settingsOpen = useUi((s) => s.settingsOpen)
  const selecting = useUi((s) => s.selecting)
  const today = useClock((s) => toDateKey(new Date(s.now)))

  const addBlock = () => {
    const store = useStore.getState()
    const bounds = boundsOf(store.settings)
    const now = new Date()
    const from = date === toDateKey(now) ? Math.ceil(minutesOfDay(now) / 15) * 15 : Math.max(bounds.start, 9 * 60)
    const start = findFreeSlot(store.blocks, 30, from, bounds) ?? Math.min(from, bounds.end - 30)
    const { result, id } = store.addBlock({ start, end: start + 30 })
    if (result.ok) useUi.getState().edit(id)
    else useUi.getState().notify(failureMessage(result))
  }

  return (
    <header className="relative z-30 flex items-center gap-1.5 border-b-[3px] border-line bg-paper px-2 py-2.5 @xl/planner:gap-3 @xl/planner:px-5">
      <div
        className="shrink-0 -rotate-2 border-[3px] border-[#111] bg-accent px-1.5 py-0.5 text-lg font-black tracking-tighter text-[#111] shadow-[3px_3px_0_0_#111] select-none @xl/planner:px-2 @xl/planner:text-2xl"
        aria-label="iWill"
      >
        iWill<span className="text-hot">.</span>
      </div>

      <nav className="flex min-w-0 items-center gap-1 @xl/planner:ml-2" aria-label="Day">
        <button type="button" className="btn btn-icon" aria-label="Previous day" onClick={() => setDate(shiftDate(date, -1))}>
          <ChevronLeftIcon size={16} />
        </button>
        <button
          type="button"
          className="btn min-w-0 truncate px-2 text-xs @xl/planner:min-w-[7.5rem] @xl/planner:text-sm"
          onClick={() => setDate(today)}
          aria-label={`${formatDateLabel(date, today)} — jump to today`}
          title="Jump to today"
        >
          {formatDateLabel(date, today)}
        </button>
        <button type="button" className="btn btn-icon" aria-label="Next day" onClick={() => setDate(shiftDate(date, 1))}>
          <ChevronRightIcon size={16} />
        </button>
      </nav>

      <div className="flex-1" />

      <Clock />

      <FocusButton />
      <button type="button" className="btn bg-accent! text-[#111]!" onClick={addBlock} aria-label="Add block">
        <PlusIcon size={16} />
        <span className="@max-xl/planner:hidden">Block</span>
      </button>
      <button
        type="button"
        className="btn btn-icon"
        aria-pressed={selecting}
        aria-label="Select blocks"
        title="Select several blocks to move or edit together"
        onClick={() => (selecting ? useUi.getState().stopSelecting() : useUi.getState().startSelecting())}
      >
        <SelectIcon size={16} />
      </button>
      <button
        type="button"
        className="btn"
        aria-pressed={deckOpen}
        onClick={() => useUi.getState().toggleDeck()}
        aria-label="Routine deck"
      >
        <StackIcon size={16} />
        <span className="@max-xl/planner:hidden">Routines</span>
      </button>
      <button
        type="button"
        className="btn btn-icon"
        aria-pressed={settingsOpen}
        aria-label="Settings"
        onClick={() => useUi.getState().toggleSettings()}
      >
        <GearIcon size={18} />
      </button>
    </header>
  )
}

/** Quick focus: a Pomodoro not tied to any block. Hidden while the timer pane is already showing. */
function FocusButton() {
  const hasSession = usePomodoro((s) => !!s.session)
  if (hasSession) return null
  return (
    <button
      type="button"
      className="btn"
      onClick={() => usePomodoro.getState().openFocus()}
      aria-label="Quick focus"
      title="Quick focus — a Pomodoro not tied to a block"
    >
      <span aria-hidden="true">🍅</span>
      <span className="@max-xl/planner:hidden">Focus</span>
    </button>
  )
}

function Clock() {
  const now = useClock((s) => s.now)
  return (
    <time className="font-mono text-lg font-black tabular-nums @max-3xl/planner:hidden" dateTime={new Date(now).toISOString()}>
      {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
    </time>
  )
}
