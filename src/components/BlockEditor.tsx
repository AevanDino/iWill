import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { inkOn } from '../lib/color'
import { formatDuration, formatTime, MIN_DURATION, parseTime } from '../lib/time'
import { useStore } from '../store/appStore'
import { useUi } from '../store/uiStore'
import type { TimeBlock } from '../types'
import { CheckIcon, CloseIcon, LockIcon, PlusIcon, SelectIcon, TrashIcon, UnlockIcon } from './icons'
import { failureMessage } from './messages'
import { TagChip } from './tags/TagChip'
import { TagForm } from './tags/TagForm'

const QUICK_DURATIONS = [5, 10, 15, 30, 45, 60, 90, 120]

/** Midnight at the end of the day is kept as "24:00" so it parses after the start. */
const toField = (m: number) => (m >= 24 * 60 ? '24:00' : formatTime(m))

export function BlockEditor() {
  const editingId = useUi((s) => s.editingId)
  const block = useStore((s) => s.blocks.find((b) => b.id === editingId))

  useEffect(() => {
    if (editingId && !block) useUi.getState().edit(null)
  }, [editingId, block])

  return (
    <AnimatePresence>
      {block && <EditorDialog key={block.id} block={block} />}
    </AnimatePresence>
  )
}

function EditorDialog({ block }: { block: TimeBlock }) {
  const categories = useStore((s) => s.categories)
  const [title, setTitle] = useState(block.title)
  const [categoryId, setCategoryId] = useState(block.categoryId)
  const [start, setStart] = useState(formatTime(block.start))
  const [end, setEnd] = useState(toField(block.end))
  const [creatingTag, setCreatingTag] = useState(false)

  // The chosen tag may have been deleted from the tag manager meanwhile.
  const category = categories.find((c) => c.id === categoryId) ?? categories[0]
  const color = category?.color ?? '#dddddd'

  const close = () => useUi.getState().edit(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // The tag manager stacks on top of the editor: Escape closes that first.
      if (useUi.getState().tagsOpen) useUi.getState().toggleTags(false)
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const startMin = parseTime(start)
  const endMin = parseTime(end)
  const timesValid = startMin != null && endMin != null && endMin - startMin >= MIN_DURATION

  const save = () => {
    const store = useStore.getState()
    const ui = useUi.getState()
    if (!timesValid) {
      ui.notify(`⏱️ Blocks need to be at least ${MIN_DURATION} minutes`)
      return
    }
    if (startMin !== block.start || endMin !== block.end) {
      const r = store.moveBlock(block.id, startMin, endMin)
      if (!r.ok) {
        ui.notify(failureMessage(r))
        return
      }
    }
    store.updateBlock(block.id, { title: title.trim() || 'Untitled', categoryId: category?.id ?? block.categoryId })
    close()
  }

  const setDuration = (d: number) => {
    if (startMin != null) setEnd(toField(startMin + d))
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-3 sm:place-items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <motion.form
        role="dialog"
        aria-modal="true"
        aria-label="Edit block"
        initial={{ y: 40, rotate: -1.5, opacity: 0 }}
        animate={{ y: 0, rotate: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 480, damping: 30 }}
        className="flex max-h-[90dvh] w-full max-w-lg flex-col border-[3px] border-line bg-paper shadow-brutal-lg"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {/* Header styled like the block itself. */}
        <div
          className="flex items-start gap-3 border-b-[3px] border-line px-5 pt-5 pb-4 transition-colors sm:px-6"
          style={{ background: color, color: inkOn(color) }}
        >
          <span className="pt-0.5 text-3xl leading-none" aria-hidden="true">
            {category?.emoji ?? '📌'}
          </span>
          <div className="min-w-0 flex-1">
            <input
              className="w-full border-b-[3px] border-transparent bg-transparent text-2xl leading-tight font-black tracking-tight outline-none placeholder:text-current placeholder:opacity-50 focus:border-current"
              value={title}
              placeholder="What's the plan?"
              aria-label="Title"
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              onFocus={(e) => block.title === 'New block' && e.currentTarget.select()}
            />
            <div className="mt-1.5 font-mono text-xs font-bold opacity-80">
              {timesValid
                ? `${formatTime(startMin)}–${formatTime(endMin)} · ${formatDuration(endMin - startMin)}`
                : `At least ${MIN_DURATION} minutes`}
            </div>
          </div>
          <button type="button" className="btn btn-icon bg-white! text-[#111]!" onClick={close} aria-label="Close">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-7 overflow-y-auto px-5 py-6 sm:px-6">
          <section>
            <h3 className="label mb-2">When</h3>
            <div className="flex items-center gap-3">
              <input
                className="field flex-1 font-mono text-lg"
                type="time"
                step={300}
                aria-label="Start"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
              <span className="font-black" aria-hidden="true">
                →
              </span>
              <input
                className="field flex-1 font-mono text-lg"
                type="time"
                step={300}
                aria-label="End"
                value={end === '24:00' ? '23:59' : end}
                onChange={(e) => setEnd(e.target.value === '23:59' ? '24:00' : e.target.value)}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="btn px-2.5! py-1! font-mono text-xs"
                  aria-pressed={startMin != null && endMin != null && endMin - startMin === d}
                  onClick={() => setDuration(d)}
                >
                  {formatDuration(d)}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="label">Tag</h3>
              {!creatingTag && (
                <button
                  type="button"
                  className="text-xs font-black underline decoration-2 underline-offset-4 hover:text-hot"
                  onClick={() => useUi.getState().toggleTags(true)}
                >
                  Manage tags →
                </button>
              )}
            </div>
            {creatingTag ? (
              <TagForm
                onSaved={(tag) => {
                  setCategoryId(tag.id)
                  setCreatingTag(false)
                }}
                onCancel={() => setCreatingTag(false)}
              />
            ) : (
              <div className="flex flex-wrap gap-2.5">
                {categories.map((c) => (
                  <TagChip key={c.id} tag={c} selected={c.id === category?.id} onClick={() => setCategoryId(c.id)} />
                ))}
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 border-[3px] border-dashed border-line px-3 py-1.5 text-sm font-black hover:bg-accent hover:text-[#111]"
                  onClick={() => setCreatingTag(true)}
                >
                  <PlusIcon size={14} /> New tag
                </button>
              </div>
            )}
          </section>
        </div>

        <div className="flex items-center gap-2 border-t-[3px] border-line px-5 py-4 sm:px-6">
          <button
            type="button"
            className="btn btn-icon hover:bg-hot! hover:text-white!"
            aria-label="Delete block"
            data-tip="Delete block"
            onClick={() => {
              useStore.getState().deleteBlock(block.id)
              useUi.getState().notify('🗑️ Block deleted')
            }}
          >
            <TrashIcon size={16} />
          </button>
          <button
            type="button"
            className="btn btn-icon"
            aria-pressed={block.locked}
            aria-label={block.locked ? 'Unlock block' : 'Lock block'}
            data-tip={block.locked ? 'Locked: never pushed around' : 'Lock: never gets pushed around'}
            onClick={() => useStore.getState().toggleLock(block.id)}
          >
            {block.locked ? <LockIcon size={16} /> : <UnlockIcon size={16} />}
          </button>
          <button
            type="button"
            className="btn btn-icon"
            aria-pressed={block.completed}
            aria-label={block.completed ? 'Mark not done' : 'Mark done'}
            data-tip={block.completed ? 'Mark not done' : 'Mark done'}
            onClick={() => useStore.getState().toggleComplete(block.id)}
          >
            <CheckIcon size={16} />
          </button>
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Select this and more blocks"
            data-tip="Select this and more blocks to move together"
            onClick={() => useUi.getState().startSelecting([block.id])}
          >
            <SelectIcon size={16} />
          </button>
          <div className="flex-1" />
          <button type="submit" className="btn bg-accent! px-6 text-[#111]!">
            Save
          </button>
        </div>
      </motion.form>
    </motion.div>
  )
}
