import { useState, type KeyboardEvent } from 'react'
import { TAG_PALETTE } from '../../lib/color'
import { TAG_NAME_MAX, useStore } from '../../store/appStore'
import type { Category } from '../../types'
import { ColorPicker } from './ColorPicker'
import { EmojiPicker } from './EmojiPicker'
import { TagChip } from './TagChip'

/**
 * Create or edit a tag. Not a <form>: it's also used inside the block
 * editor's form, so Enter saves the tag here instead of submitting that.
 */
export function TagForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Category
  onSaved(tag: Category): void
  onCancel(): void
}) {
  const categories = useStore((s) => s.categories)
  const [name, setName] = useState(initial?.name ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '🏷️')
  const [color, setColor] = useState(
    () => initial?.color ?? TAG_PALETTE.find((c) => !categories.some((t) => t.color.toLowerCase() === c)) ?? TAG_PALETTE[0]!,
  )
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    const r = useStore.getState().saveCategory({ id: initial?.id, name, emoji, color })
    if (r.ok) onSaved(r.category)
    else setError(r.reason)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      // Close just this form, not the dialog around it.
      e.stopPropagation()
      onCancel()
    }
  }

  return (
    <div className="space-y-5 border-[3px] border-line p-4 sm:p-5" onKeyDown={onKeyDown}>
      <div className="flex items-center justify-between gap-3">
        <span className="label">{initial ? 'Edit tag' : 'New tag'}</span>
        <TagChip tag={{ name: name.trim() || 'Your tag', emoji, color }} />
      </div>

      <label className="block">
        <span className="label">Name</span>
        <input
          autoFocus
          className="field mt-1"
          maxLength={TAG_NAME_MAX}
          value={name}
          placeholder="e.g. Client X"
          aria-invalid={!!error}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
        />
        {error && (
          <span role="alert" className="mt-1 block text-xs font-black text-hot">
            {error}
          </span>
        )}
      </label>

      <div>
        <span className="label mb-1.5 block">Icon</span>
        <EmojiPicker value={emoji} onChange={setEmoji} />
      </div>

      <div>
        <span className="label mb-1.5 block">Colour</span>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn bg-accent! text-[#111]!" onClick={save}>
          {initial ? 'Save tag' : 'Add tag'}
        </button>
      </div>
    </div>
  )
}
