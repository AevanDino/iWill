/** A sliver's flag: where its block's middle is on screen, in px. */
export interface FlagItem {
  id: string
  center: number
}

/**
 * Stack flags beside their slivers: each as close to its sliver's middle as
 * it can be without overlapping the others, all kept inside [min, max].
 * Returns each flag's top, in px.
 */
export function layoutFlags(items: readonly FlagItem[], height: number, gap: number, min: number, max: number) {
  const sorted = [...items].sort((a, b) => a.center - b.center)
  const tops = sorted.map((it) => it.center - height / 2)
  // Push down out of the way of the flag above…
  for (let i = 0; i < tops.length; i++) {
    const floor = i > 0 ? tops[i - 1]! + height + gap : min
    if (tops[i]! < floor) tops[i] = floor
  }
  // …then back up where that ran past the bottom.
  for (let i = tops.length - 1; i >= 0; i--) {
    const ceil = i < tops.length - 1 ? tops[i + 1]! - height - gap : max - height
    if (tops[i]! > ceil) tops[i] = ceil
  }
  return new Map(sorted.map((it, i) => [it.id, tops[i]!]))
}
