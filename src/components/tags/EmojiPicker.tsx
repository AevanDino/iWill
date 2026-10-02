import { useState } from 'react'
import { EMOJI_GROUPS, firstEmoji } from '../../lib/emoji'

/** A grouped grid of emoji, plus a box to type or paste any other. */
export function EmojiPicker({ value, onChange }: { value: string; onChange(emoji: string): void }) {
  const [group, setGroup] = useState(() => Math.max(0, EMOJI_GROUPS.findIndex((g) => g.emoji.includes(value))))
  const [typed, setTyped] = useState('')
  const emoji = EMOJI_GROUPS[group]!.emoji

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Emoji groups">
        {EMOJI_GROUPS.map((g, i) => (
          <button
            key={g.name}
            type="button"
            role="tab"
            aria-selected={i === group}
            onClick={() => setGroup(i)}
            className={`border-2 px-2 py-0.5 text-xs font-black ${
              i === group ? 'border-line bg-ink text-paper' : 'border-transparent text-muted hover:border-line'
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-1 sm:grid-cols-12">
        {emoji.map((e) => (
          <button
            key={e}
            type="button"
            aria-label={e}
            aria-pressed={e === value}
            onClick={() => onChange(e)}
            className={`grid aspect-square place-items-center border-[3px] text-xl ${
              e === value ? 'border-line bg-accent' : 'border-transparent hover:border-line'
            }`}
          >
            {e}
          </button>
        ))}
      </div>
      <input
        className="field w-44! py-1! text-sm"
        placeholder="…or type / paste one"
        aria-label="Any emoji"
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value)
          const picked = firstEmoji(e.target.value)
          if (picked) onChange(picked)
        }}
      />
    </div>
  )
}
