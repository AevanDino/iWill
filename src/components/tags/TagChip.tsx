import type { Category } from '../../types'
import { CheckIcon } from '../icons'
import { tagStyle } from './tagStyle'

type ChipTag = Pick<Category, 'name' | 'color' | 'emoji'>

const base = 'tagged inline-flex max-w-full items-center gap-1.5 border-[3px] border-line px-3 py-1.5 text-sm font-black'

/** A tag as a little block-coloured chip. Clickable (a toggle) when `onClick` is given. */
export function TagChip({ tag, selected, onClick }: { tag: ChipTag; selected?: boolean; onClick?(): void }) {
  const style = tagStyle(tag.color)
  const body = (
    <>
      {tag.emoji && <span aria-hidden="true">{tag.emoji}</span>}
      <span className="truncate">{tag.name}</span>
    </>
  )
  if (!onClick)
    return (
      <span className={base} style={style}>
        {body}
      </span>
    )
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={style}
      className={`${base} cursor-pointer transition-[transform,box-shadow] duration-75 ${
        selected
          ? '-translate-x-0.5 -translate-y-0.5 shadow-brutal'
          : 'hover:-translate-x-px hover:-translate-y-px hover:shadow-brutal-sm'
      }`}
    >
      {body}
      {selected && <CheckIcon size={13} />}
    </button>
  )
}
