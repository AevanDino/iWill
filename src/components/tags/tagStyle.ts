import type { CSSProperties } from 'react'
import { inkOn, nightTone } from '../../lib/color'

const cache = new Map<string, CSSProperties>()

/** Inline variables for a `.tagged` / `.tag-fill` element in this colour (see index.css). */
export function tagStyle(color: string | undefined): CSSProperties {
  const c = color ?? '#dddddd'
  let style = cache.get(c)
  if (!style) {
    style = { '--tag': c, '--tag-on': inkOn(c), '--tag-glow': nightTone(c).glow } as CSSProperties
    cache.set(c, style)
  }
  return style
}
