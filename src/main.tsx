import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useStore } from './store/appStore'
import { startClock, useClock } from './store/clock'
import { startPomodoroLoop, usePomodoro } from './store/pomodoroStore'
import { useUi } from './store/uiStore'
import { toDateKey } from './lib/time'
import './index.css'

startClock()
void useStore
  .getState()
  .hydrate()
  .then(() => usePomodoro.getState().hydrate())
startPomodoroLoop()

// If the tab is left open past midnight while showing today, roll over to the new day.
let today = toDateKey(new Date())
useClock.subscribe(({ now }) => {
  const next = toDateKey(new Date(now))
  if (next === today) return
  if (useStore.getState().date === today) void useStore.getState().setDate(next)
  today = next
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </MotionConfig>
  </StrictMode>,
)

if (import.meta.env.DEV) Object.assign(window, { __iwill: { useStore, usePomodoro, useUi } })
