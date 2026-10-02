import { AnimatePresence, motion } from 'motion/react'
import { connectedChain } from '../lib/collision'
import { useStore } from '../store/appStore'
import { useUi } from '../store/uiStore'
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, LockIcon, TrashIcon, UnlockIcon } from './icons'
import { failureMessage } from './messages'

/** Actions for the blocks picked in select mode. Dragging a picked block moves them all (see Timeline). */
export function SelectionBar() {
  const selecting = useUi((s) => s.selecting)
  return <AnimatePresence>{selecting && <Bar key="selection" />}</AnimatePresence>
}

function Bar() {
  const selected = useUi((s) => s.selected)
  const blocks = useStore((s) => s.blocks)
  const grid = useStore((s) => s.settings.grid)
  const chosen = blocks.filter((b) => selected.has(b.id))
  const ids = chosen.map((b) => b.id)
  const n = ids.length
  const allLocked = n > 0 && chosen.every((b) => b.locked)
  const allDone = n > 0 && chosen.every((b) => b.completed)
  const ui = () => useUi.getState()

  const nudge = (delta: number) => {
    const r = useStore.getState().moveGroup(ids, delta)
    if (!r.ok) ui().notify(failureMessage(r))
  }
  const remove = () => {
    useStore.getState().deleteBlocks(ids)
    ui().notify(`🗑️ ${n} block${n === 1 ? '' : 's'} deleted`)
  }
  const connected = connectedChain(blocks, ids)

  const icon = 'btn btn-icon'
  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
      className="absolute inset-x-2 bottom-2 z-40 space-y-2.5 border-[3px] border-line bg-paper p-3 shadow-brutal-lg sm:inset-x-4"
      role="toolbar"
      aria-label="Selected blocks"
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate text-sm font-black" aria-live="polite">
          {n === 0 ? 'Tap blocks to select them' : `${n} selected`}
        </div>
        <button
          type="button"
          className="btn px-2.5! py-1! text-xs"
          disabled={n === 0 || connected.size === n}
          data-tip="Also select every block touching these"
          onClick={() => ui().setSelected(connected)}
        >
          Connected
        </button>
        <button type="button" className="btn bg-accent! px-3! py-1! text-xs text-[#111]!" onClick={() => ui().stopSelecting()}>
          Done
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" className={icon} disabled={n === 0} aria-label={`Move up ${grid} minutes`} data-tip={`Up ${grid}m`} onClick={() => nudge(-grid)}>
          <ArrowUpIcon size={16} />
        </button>
        <button type="button" className={icon} disabled={n === 0} aria-label={`Move down ${grid} minutes`} data-tip={`Down ${grid}m`} onClick={() => nudge(grid)}>
          <ArrowDownIcon size={16} />
        </button>
        <div className="flex-1" />
        <button
          type="button"
          className={icon}
          disabled={n === 0}
          aria-pressed={allLocked}
          aria-label={allLocked ? 'Unlock all' : 'Lock all'}
          data-tip={allLocked ? 'Unlock all' : 'Lock all'}
          onClick={() => useStore.getState().setMany(ids, { locked: !allLocked })}
        >
          {allLocked ? <LockIcon size={16} /> : <UnlockIcon size={16} />}
        </button>
        <button
          type="button"
          className={icon}
          disabled={n === 0}
          aria-pressed={allDone}
          aria-label={allDone ? 'Mark all not done' : 'Mark all done'}
          data-tip={allDone ? 'Mark all not done' : 'Mark all done'}
          onClick={() => useStore.getState().setMany(ids, { completed: !allDone })}
        >
          <CheckIcon size={16} />
        </button>
        <button
          type="button"
          className={`${icon} hover:bg-hot! hover:text-white!`}
          disabled={n === 0}
          aria-label="Delete selected"
          data-tip="Delete selected"
          onClick={remove}
        >
          <TrashIcon size={16} />
        </button>
      </div>
    </motion.div>
  )
}
