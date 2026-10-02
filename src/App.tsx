import { useEffect, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BlockEditor } from './components/BlockEditor'
import { Header } from './components/Header'
import { RoutineDeck } from './components/RoutineDeck'
import { SelectionBar } from './components/SelectionBar'
import { SettingsPanel } from './components/SettingsPanel'
import { TagManager } from './components/tags/TagManager'
import { TooltipLayer } from './components/Tooltip'
import { Timeline } from './components/Timeline'
import { FocusOffer } from './components/focus/FocusOffer'
import { SplitDivider } from './components/focus/SplitDivider'
import { TimerPane } from './components/focus/TimerPane'
import { useActiveBlockTimer } from './hooks/useActiveBlock'
import { useStore } from './store/appStore'
import { usePomodoro } from './store/pomodoroStore'
import { useUi } from './store/uiStore'

export default function App() {
  const hydrated = useStore((s) => s.hydrated)
  const empty = useStore((s) => s.blocks.length === 0)
  const hasTimer = usePomodoro((s) => !!s.session)
  const fullscreen = usePomodoro((s) => s.fullscreen)
  const split = usePomodoro((s) => s.split)
  useActiveBlockTimer()
  useTheme()

  return (
    // Calendar and timer side by side when there's room for both, stacked (calendar on top) otherwise.
    <div
      className="flex h-dvh flex-col side:flex-row"
      data-split-root
      style={{ '--split': split } as CSSProperties}
    >
      <div className="@container/planner flex min-h-0 min-w-0 flex-1 flex-col" inert={fullscreen}>
        <Header />
        <main className="flex min-h-0 flex-1">
          <section className="relative min-w-0 flex-1">
            {hydrated ? <Timeline /> : <Loading />}
            {hydrated && empty && !hasTimer && <EmptyHint />}
            <SelectionBar />
          </section>
          <RoutineDeck />
        </main>
      </div>
      {hasTimer && !fullscreen && <SplitDivider />}
      <AnimatePresence>{hasTimer && <TimerPane key="timer" />}</AnimatePresence>
      <BlockEditor />
      <SettingsPanel />
      <TagManager />
      <FocusOffer />
      <Toast />
      <TooltipLayer />
    </div>
  )
}

function useTheme() {
  const theme = useStore((s) => s.settings.theme)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#16151a' : '#fff7e0')
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}

function Loading() {
  return (
    <div className="grid h-full place-items-center">
      <div className="brutal animate-pulse bg-accent px-4 py-2 font-black text-[#111]">Loading your day…</div>
    </div>
  )
}

function EmptyHint() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-6 z-20 flex justify-center px-4">
      <div className="brutal max-w-sm rotate-1 bg-paper px-4 py-3 text-sm font-bold">
        <div className="mb-1 text-base font-black">A blank day. Delicious. 🍩</div>
        Tap an empty slot to add a block, or open <b>Routines</b> and drag a whole stack in.
      </div>
    </div>
  )
}

function Toast() {
  const toast = useUi((s) => s.toast)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => useUi.setState((s) => (s.toast?.id === toast.id ? { toast: null } : s)), 2800)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4 side:bottom-5 stacked:top-16"
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout">
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ y: 30, opacity: 0, rotate: -2 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            className="border-[3px] border-[#111] bg-[#111] px-4 py-2 text-sm font-black text-white shadow-[4px_4px_0_0_var(--accent)]"
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
