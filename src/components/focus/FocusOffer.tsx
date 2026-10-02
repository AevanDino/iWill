import { AnimatePresence, motion } from 'motion/react'
import { inkOn } from '../../lib/color'
import { unlockAudio } from '../../lib/sound'
import { useStore } from '../../store/appStore'
import { usePomodoro } from '../../store/pomodoroStore'

/** "Your block just started — focus on it?" */
export function FocusOffer() {
  const offer = usePomodoro((s) => s.offer)
  const fullscreen = usePomodoro((s) => s.fullscreen)
  const block = useStore((s) => s.blocks.find((b) => b.id === offer?.blockId))
  const category = useStore((s) => s.categories.find((c) => c.id === block?.categoryId))
  const p = usePomodoro.getState()

  return (
    <AnimatePresence>
      {offer && block && !block.completed && !fullscreen && (
        <motion.div
          key={offer.blockId}
          initial={{ y: -30, opacity: 0, rotate: -2 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -30, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 520, damping: 24 }}
          className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-3"
        >
          <div
            className="pointer-events-auto w-full max-w-[26rem] border-[3px] border-[#111] bg-paper shadow-brutal-lg"
            role="alertdialog"
            aria-label="Start a Pomodoro?"
          >
            <div
              className="flex items-center gap-2 border-b-[3px] border-[#111] px-3 py-2"
              style={{ background: category?.color, color: category ? inkOn(category.color) : '#111' }}
            >
              <span className="text-lg">{category?.emoji}</span>
              <span className="label">Starting now</span>
            </div>
            <div className="p-3">
              <div className="mb-3 text-lg leading-tight font-black">“{block.title}” is on. Focus with a Pomodoro?</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn flex-1 bg-(--phase-focus)! text-[#111]!"
                  onClick={() => {
                    unlockAudio()
                    p.acceptOffer()
                  }}
                >
                  🍅 Start focus
                </button>
                <button type="button" className="btn" onClick={p.dismissOffer}>
                  Not now
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
