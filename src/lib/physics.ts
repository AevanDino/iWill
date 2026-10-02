import type { Transition } from 'motion/react'

/**
 * Spring tuning for the timeline. Tension ≈ stiffness, friction ≈ damping.
 * Lower damping → more overshoot ("elastic"); higher stiffness → snappier.
 */
export const SNAP_SPRING: Transition = { type: 'spring', stiffness: 520, damping: 34, mass: 0.8 }

/** Used when blocks get shoved by a collision or pulled up by a cap. */
export const CASCADE_SPRING: Transition = { type: 'spring', stiffness: 300, damping: 17, mass: 0.9 }

export const INSTANT: Transition = { duration: 0 }
