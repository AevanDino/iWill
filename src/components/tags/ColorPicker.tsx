import { inkOn, TAG_PALETTE } from '../../lib/color'
import { CheckIcon } from '../icons'

const swatch = 'relative grid size-8 place-items-center border-[3px] border-line transition-[transform,box-shadow] duration-75'
const raised = '-translate-x-0.5 -translate-y-0.5 shadow-brutal'

/** Palette swatches, plus a custom swatch backed by the native colour picker. */
export function ColorPicker({ value, onChange }: { value: string; onChange(color: string): void }) {
  const current = value.toLowerCase()
  const custom = !TAG_PALETTE.includes(current)
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
      {TAG_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === current}
          aria-label={c}
          title={c}
          onClick={() => onChange(c)}
          className={`${swatch} ${c === current ? raised : 'hover:-translate-x-px hover:-translate-y-px'}`}
          style={{ background: c, color: inkOn(c) }}
        >
          {c === current && <CheckIcon size={14} />}
        </button>
      ))}
      <label
        title="Custom colour"
        className={`${swatch} cursor-pointer ${custom ? raised : 'hover:-translate-x-px hover:-translate-y-px'}`}
        style={{
          background: custom ? value : 'conic-gradient(#ff5d5d, #ffd23f, #3ddc97, #4d96ff, #b69cff, #ff5d8f, #ff5d5d)',
          color: custom ? inkOn(value) : undefined,
        }}
      >
        <input
          type="color"
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#888888'}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Custom colour"
        />
        {custom && <CheckIcon size={14} />}
      </label>
    </div>
  )
}
