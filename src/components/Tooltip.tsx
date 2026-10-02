import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { clamp } from '../lib/time'

const TIP_ID = 'iwill-tooltip'
/**
 * Practically instant: just long enough that sweeping the mouse across a row
 * of buttons doesn't strobe a tip for each one it merely passes over.
 */
const HOVER_DELAY = 50
const GAP = 8
const EDGE = 8

/**
 * What a hovered or focused element's tip says: its `data-tip`, or — for a
 * button whose label isn't visible right now (icon-only, or its text hidden
 * at this width) — its `aria-label`.
 */
function tipFor(el: HTMLElement): { text: string; describes: boolean } | null {
  if (el.dataset.tip) return { text: el.dataset.tip, describes: el.dataset.tip !== el.getAttribute('aria-label') }
  const label = el.getAttribute('aria-label')
  if (el.tagName === 'BUTTON' && label && el.innerText.trim() === '') return { text: label, describes: false }
  return null
}

function tipTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null
  const el = node.closest<HTMLElement>('[data-tip], button[aria-label]')
  return el && tipFor(el) ? el : null
}

/**
 * One tooltip for the whole app, in the toast's style. Shows on mouse hover
 * and keyboard focus, never on touch (a tap there means "do it").
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<{ id: number; el: HTMLElement; text: string } | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let count = 0
    let shown: HTMLElement | null = null
    // After a click, stay quiet until the pointer moves on to something else.
    let muted: HTMLElement | null = null

    const hide = () => {
      clearTimeout(timer)
      shown?.removeAttribute('aria-describedby')
      shown = null
      setTip(null)
    }
    const show = (el: HTMLElement, delay: number) => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const t = el.isConnected ? tipFor(el) : null
        if (!t) return hide()
        shown?.removeAttribute('aria-describedby')
        shown = el
        if (t.describes) el.setAttribute('aria-describedby', TIP_ID)
        setTip({ id: ++count, el, text: t.text })
      }, delay)
    }

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const el = tipTarget(e.target)
      if (el !== muted) muted = null
      if (el === shown) return
      if (!el || el === muted) return hide()
      show(el, shown ? 0 : HOVER_DELAY)
    }
    const onDown = (e: PointerEvent) => {
      muted = tipTarget(e.target)
      hide()
    }
    const onFocus = (e: FocusEvent) => {
      const el = tipTarget(e.target)
      if (el?.matches(':focus-visible')) show(el, 0)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide()

    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', hide)
    document.addEventListener('scroll', hide, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', hide)
    document.documentElement.addEventListener('pointerleave', hide)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', hide)
      document.removeEventListener('scroll', hide, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', hide)
      document.documentElement.removeEventListener('pointerleave', hide)
    }
  }, [])

  // Below the element, or above it near the bottom of the screen; kept on screen sideways.
  useLayoutEffect(() => {
    if (!tip || !box.current) return setPos(null)
    const r = tip.el.getBoundingClientRect()
    const b = box.current.getBoundingClientRect()
    const above = r.bottom + GAP + b.height > window.innerHeight - EDGE
    setPos({
      above,
      top: above ? r.top - GAP - b.height : r.bottom + GAP,
      left: clamp(r.left + r.width / 2 - b.width / 2, EDGE, window.innerWidth - b.width - EDGE),
    })
  }, [tip])

  if (!tip) return null
  return createPortal(
    <motion.div
      key={tip.id}
      ref={box}
      id={TIP_ID}
      role="tooltip"
      initial={{ opacity: 0, y: pos?.above ? 4 : -4, rotate: -2 }}
      animate={pos ? { opacity: 1, y: 0, rotate: 0 } : { opacity: 0 }}
      transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      className="pointer-events-none fixed z-[70] max-w-60 border-[3px] border-line bg-[#111] px-2 py-1 text-xs leading-snug font-black text-white shadow-[3px_3px_0_0_var(--accent)]"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      {tip.text}
    </motion.div>,
    document.body,
  )
}
