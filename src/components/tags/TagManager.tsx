import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useStore } from '../../store/appStore'
import { useUi } from '../../store/uiStore'
import type { Category } from '../../types'
import { CloseIcon, PlusIcon, TrashIcon } from '../icons'
import { TagChip } from './TagChip'
import { TagForm } from './TagForm'

/** The central place to create, edit and delete tags. Stacks above the block editor. */
export function TagManager() {
  const open = useUi((s) => s.tagsOpen)
  return <AnimatePresence>{open && <ManagerDialog key="tags" />}</AnimatePresence>
}

function ManagerDialog() {
  const categories = useStore((s) => s.categories)
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const close = () => useUi.getState().toggleTags(false)
  const start = (mode: 'edit' | 'delete', id: string | null) => {
    setEditing(mode === 'edit' ? id : null)
    setDeleting(mode === 'delete' ? id : null)
  }

  return (
    <motion.div
      className="fixed inset-0 z-[55] grid place-items-end bg-black/40 p-3 sm:place-items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={(e) => e.target === e.currentTarget && close()}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        // Keep it from reaching the block editor underneath.
        e.stopPropagation()
        close()
      }}
    >
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tags-title"
        initial={{ y: 40, rotate: 1.5, opacity: 0 }}
        animate={{ y: 0, rotate: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 480, damping: 30 }}
        className="flex max-h-[90dvh] w-full max-w-lg flex-col border-[3px] border-line bg-paper shadow-brutal-lg"
      >
        <header className="flex items-center justify-between gap-3 border-b-[3px] border-line bg-accent px-5 py-4 text-[#111] sm:px-6">
          <div>
            <h2 id="tags-title" className="text-lg leading-none font-black tracking-tight uppercase">
              Tags
            </h2>
            <p className="mt-1 text-xs font-bold opacity-75">Name them, give them an icon and a colour.</p>
          </div>
          <button type="button" autoFocus className="btn btn-icon bg-white! text-[#111]!" onClick={close} aria-label="Close tags">
            <CloseIcon size={16} />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-5 sm:p-6">
          {categories.map((c, i) =>
            editing === c.id ? (
              <TagForm key={c.id} initial={c} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />
            ) : deleting === c.id ? (
              <DeleteTag key={c.id} tag={c} others={categories.filter((o) => o.id !== c.id)} onDone={() => setDeleting(null)} />
            ) : (
              <div key={c.id} className="flex items-center gap-2">
                <TagChip tag={c} />
                {i === 0 && (
                  <span className="label text-muted" data-tip="New blocks get this tag">
                    Default
                  </span>
                )}
                <div className="flex-1" />
                <button type="button" className="btn px-2.5! py-1! text-xs" onClick={() => start('edit', c.id)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-icon hover:bg-hot! hover:text-white!"
                  aria-label={`Delete ${c.name}`}
                  data-tip={categories.length === 1 ? 'You need at least one tag' : `Delete ${c.name}`}
                  disabled={categories.length === 1}
                  onClick={() => start('delete', c.id)}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            ),
          )}

          {editing === 'new' ? (
            <TagForm onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />
          ) : (
            <button type="button" className="btn mt-2 w-full border-dashed py-3" onClick={() => start('edit', 'new')}>
              <PlusIcon size={16} /> New tag
            </button>
          )}
        </div>
      </motion.section>
    </motion.div>
  )
}

function DeleteTag({ tag, others, onDone }: { tag: Category; others: Category[]; onDone(): void }) {
  const [target, setTarget] = useState(others[0]!.id)
  const remove = async () => {
    const ok = await useStore.getState().deleteCategory(tag.id, target)
    useUi.getState().notify(ok ? `🗑️ “${tag.name}” deleted` : "🙅 Can't delete that tag")
    onDone()
  }
  return (
    <div className="space-y-3 border-[3px] border-hot p-4" role="group" aria-label={`Delete ${tag.name}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
        Delete <TagChip tag={tag} /> ?
      </div>
      <label className="block">
        <span className="label">Move its blocks and routine steps to</span>
        <select className="field mt-1" value={target} onChange={(e) => setTarget(e.target.value)} autoFocus>
          {others.map((o) => (
            <option key={o.id} value={o.id}>
              {o.emoji} {o.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn bg-hot! text-white!" onClick={() => void remove()}>
          Delete tag
        </button>
      </div>
    </div>
  )
}
