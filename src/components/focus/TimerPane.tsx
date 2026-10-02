import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { phasePalette } from '../../lib/color'
import { AnimatePresence, motion, useIsPresent } from 'motion/react'
import {
  estimatePomodoros,
  formatClock,
  nextPhase,
  PHASE_LABEL,
  POMODORO_LIMITS,
  progress,
  remainingMs,
  type PomodoroConfig,
  type PomodoroSession,
} from '../../lib/pomodoro'
import { unlockAudio } from '../../lib/sound'
import { clamp, formatDuration, formatTime, minutesOfDay } from '../../lib/time'
import { useStore } from '../../store/appStore'
import { useClock } from '../../store/clock'
import { projectSession, usePomodoro } from '../../store/pomodoroStore'
import { useUi } from '../../store/uiStore'
import type { TimeBlock } from '../../types'
import { CollapseIcon, ExpandIcon, GearIcon, PlayIcon } from '../icons'
import { failureMessage } from '../messages'
import { PHASE_COLOR, PHASE_SHOUT } from './phase'

const INK = '#111'
const ghost = 'btn flex-1 bg-white! text-[#111]! text-sm'

/**
 * The timer pane. Docked beside the calendar (right in landscape, below in
 * portrait) while a session exists, or blown up to fill the screen. The
 * calendar next to it stays fully interactive.
 */
export function TimerPane() {
  // The pane keeps rendering while it animates out after the session ends,
  // so hold on to the last live session instead of reading null.
  const live = usePomodoro((s) => s.session)
  const last = useRef(live)
  if (live) last.current = live
  const session = last.current
  const isPresent = useIsPresent()
  const fullscreen = usePomodoro((s) => s.fullscreen)
  const config = usePomodoro((s) => s.config)
  const role = usePomodoro((s) => s.role)
  const now = useClock((s) => s.now)
  const block = useStore((s) => s.blocks.find((b) => b.id === session?.blockId))
  const blockColor = useStore((s) => s.categories.find((c) => c.id === block?.categoryId)?.color)
  const landing = useUi((s) => (session?.blockId ? s.landing?.[session.blockId] : undefined))
  // Theme the pane from the block's tag colour; a quick focus keeps the default red/teal/grey.
  const palette = useMemo(() => (blockColor ? phasePalette(blockColor) : null), [blockColor])
  const [optionsOpen, setOptionsOpen] = useState(false)
  useTimerKeys()
  if (!session) return null
  const ink = palette
    ? { focus: palette.onFocus, 'short-break': palette.onShortBreak, 'long-break': palette.onLongBreak }[session.phase]
    : INK
  const themeVars = palette && {
    '--phase-focus': palette.focus,
    '--phase-short': palette.shortBreak,
    '--phase-long': palette.longBreak,
  }

  // While the linked block is being dragged, show where the timer will end up.
  const shown = landing && block ? projectSession(session, config, { ...block, ...landing }, now) : session
  const left = remainingMs(shown, now)
  // The edge bar shows how far through its block you are (live while it's dragged);
  // a quick focus has no block, so it shows the Pomodoro instead.
  const span = block && (landing ?? block)
  const nowMin = minutesOfDay(new Date(now))
  const pct = span
    ? clamp((nowMin - span.start) / (span.end - span.start), 0, 1)
    : clamp(progress(shown, now), 0, 1)
  const running = session.status === 'running'

  return (
    <motion.aside
      data-timer-pane
      initial={{ opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 80 }}
      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
      className={[
        'flex flex-col overflow-hidden text-[#111] [container-type:inline-size]',
        // (no `relative` here — it would beat `fixed` and collapse the fullscreen pane)
        fullscreen ? 'fixed inset-0 z-50' : 'timer-dock relative',
      ].join(' ')}
      style={{ ...themeVars, background: PHASE_COLOR[session.phase] } as CSSProperties}
      aria-label="Pomodoro timer"
      aria-keyshortcuts="Space F Escape"
      inert={!isPresent}
    >
      {session.status === 'paused' && <div className="stripes pointer-events-none absolute inset-0" />}
      <EdgeProgress pct={pct} color={blockColor} label={span ? 'Block progress' : 'Pomodoro progress'} />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 p-4 pr-7 sm:gap-4">
        <div className="flex items-center gap-2">
          <SessionBadge session={session} config={config} />
          <div className="flex-1" />
          <button
            type="button"
            className="btn btn-icon bg-white! text-[#111]!"
            aria-expanded={optionsOpen}
            aria-label="Timer settings"
            data-tip="Timer settings"
            onClick={() => setOptionsOpen((o) => !o)}
          >
            <GearIcon size={16} />
          </button>
          <button
            type="button"
            className="btn bg-white! px-2! text-sm text-[#111]!"
            aria-pressed={fullscreen}
            onClick={() => usePomodoro.getState().setFullscreen(!fullscreen)}
            data-tip={fullscreen ? 'Back to split view (Esc)' : 'Fullscreen timer (F)'}
          >
            {fullscreen ? <CollapseIcon size={16} /> : <ExpandIcon size={16} />}
            <span className="hidden @md:inline">{fullscreen ? 'Split view' : 'Fullscreen'}</span>
          </button>
        </div>

        {/* Sits straight on the phase colour, so it takes that colour's ink (white on dark tags). */}
        <div
          className="relative flex min-h-[4.5rem] flex-1 flex-col items-center justify-center gap-3 [container-type:size]"
          style={{ color: ink }}
        >
          <div className="relative">
            {running && config.pulse !== 'off' && (
              <div
                key={Math.ceil(left / 1000)}
                aria-hidden="true"
                className="tick-flash pointer-events-none absolute -inset-2"
                style={{
                  border: `${config.pulse === 'bold' ? 7 : 3}px solid currentColor`,
                  opacity: config.pulse === 'bold' ? 1 : 0.4,
                }}
              />
            )}
            <div
              role="timer"
              aria-label={`${PHASE_LABEL[session.phase]}, ${formatClock(left)} remaining${session.status === 'paused' ? ', paused' : ''}`}
              className="font-mono leading-[0.85] font-black tracking-tighter tabular-nums"
              style={{
                fontSize: 'min(30cqw, 62cqh)',
                textShadow: `0.045em 0.045em 0 ${ink === INK ? 'rgb(255 255 255 / 0.55)' : 'rgb(0 0 0 / 0.3)'}`,
              }}
            >
              {formatClock(left)}
            </div>
            {session.status === 'paused' && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-6 border-[4px] border-[#111] bg-white px-3 py-0.5 text-xl font-black tracking-widest text-[#111] uppercase shadow-[5px_5px_0_0_#111]">
                Paused
              </div>
            )}
          </div>
          <CycleDots session={session} config={config} />
        </div>

        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 sm:gap-4">
        <BlockSummary session={session} />

        {role === 'viewer' ? (
          <ViewerCard session={session} />
        ) : session.interrupted ? (
          <RecoveryCard session={session} />
        ) : session.status === 'complete' ? (
          <CompleteCard session={session} config={config} />
        ) : (
          <Controls session={session} />
        )}
        </div>
      </div>

      <AnimatePresence>
        {optionsOpen && <CycleOptions config={config} onClose={() => setOptionsOpen(false)} />}
      </AnimatePresence>
      <PhaseFlash />
    </motion.aside>
  )
}

/** Space: start/pause · F: fullscreen · Esc: leave fullscreen. Ignored while typing or on the calendar's own controls. */
function useTimerKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.closest('input, select, textarea, [role=dialog], [role=alertdialog]')) return
      const free = target === document.body || !!target.closest('[data-timer-pane]')
      const p = usePomodoro.getState()
      if (e.key === 'Escape' && p.fullscreen) p.setFullscreen(false)
      else if (!free || target.closest('button')) return
      else if (e.key === ' ') {
        e.preventDefault()
        unlockAudio()
        p.toggle()
      } else if (e.key === 'f' || e.key === 'F') p.setFullscreen(!p.fullscreen)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/**
 * Progress as a bar down the pane's right edge, away from the calendar:
 * through the linked block, or through the Pomodoro for a quick focus. The
 * elapsed part is a light tint of the block's colour (near-white without one).
 */
function EdgeProgress({ pct, color, label }: { pct: number; color: string | undefined; label: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 right-0 z-20 w-3 bg-black/15"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ '--p': pct } as CSSProperties}
    >
      <div
        className="h-[calc(var(--p)*100%)] w-full transition-[height] duration-1000 ease-linear"
        style={{ background: color ? `color-mix(in oklab, ${color} 55%, white)` : 'rgb(255 255 255 / 0.85)' }}
      />
    </div>
  )
}

function SessionBadge({ session, config }: { session: PomodoroSession; config: PomodoroConfig }) {
  const text =
    session.phase === 'focus' ? `Focus · Session ${session.round} / ${config.sessionsBeforeLong}` : PHASE_LABEL[session.phase]
  return (
    <div className="flex min-w-0 items-center gap-2 border-[3px] border-[#111] bg-[#111] px-2.5 py-1 text-xs font-black tracking-widest text-white uppercase sm:text-sm">
      {session.status === 'running' && <span className="blink size-2.5 shrink-0 bg-white" aria-hidden="true" />}
      <span className="truncate">{text}</span>
    </div>
  )
}

function CycleDots({ session, config }: { session: PomodoroSession; config: PomodoroConfig }) {
  const doneInCycle = session.phase === 'focus' && session.status !== 'complete' ? session.round - 1 : session.round
  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={`${doneInCycle} of ${config.sessionsBeforeLong} focus sessions done this cycle`}
    >
      {Array.from({ length: config.sessionsBeforeLong }, (_, i) => {
        const done = i < doneInCycle
        const current = !done && i === session.round - 1 && session.phase === 'focus'
        return (
          <span
            key={i}
            className={`size-4 border-[3px] border-current ${done ? 'bg-current' : current ? 'bg-white' : ''} ${current && session.status === 'running' ? 'blink' : ''}`}
          />
        )
      })}
      <span className="ml-1.5 font-mono text-xs font-black">🍅×{session.completed}</span>
    </div>
  )
}

/** Compact summary of the block this session is attached to. */
function BlockSummary({ session }: { session: PomodoroSession }) {
  const nowMin = useClock((s) => minutesOfDay(new Date(s.now)))
  const stored = useStore((s) => s.blocks.find((b) => b.id === session.blockId))
  const landing = useUi((s) => s.landing?.[session.blockId])
  // Mid-drag, describe the block where it will land.
  const block = stored && landing ? { ...stored, ...landing } : stored
  const category = useStore((s) => s.categories.find((c) => c.id === block?.categoryId))
  const blocks = useStore((s) => s.blocks)
  const config = usePomodoro((s) => s.config)

  if (!block) {
    const current = blocks.find((b) => !b.completed && b.start <= nowMin && nowMin < b.end)
    return (
      <div className="flex items-center gap-3 border-[3px] border-[#111] bg-white px-3 py-2">
        <span className="text-2xl" aria-hidden="true">
          ⚡
        </span>
        <div className="min-w-0 flex-1">
          <div className="label">{session.blockId ? 'Block removed — timer kept going' : 'Quick focus'}</div>
          <div className="truncate text-sm font-bold">{current ? `Scheduled now: ${current.title}` : 'Not tied to a block'}</div>
        </div>
        {current && (
          <button type="button" className="btn px-2! py-1! text-xs" onClick={() => usePomodoro.getState().retarget(current.id)}>
            Link
          </button>
        )}
      </div>
    )
  }

  const duration = block.end - block.start
  const elapsed = clamp(nowMin - block.start, 0, duration)
  const left = block.end - nowMin
  const over = block.completed || left <= 0
  const done = block.pomodoros ?? 0
  const estimate = estimatePomodoros(duration, config)
  const status = over
    ? block.completed
      ? 'Done'
      : 'Time’s up'
    : nowMin < block.start
      ? `Starts ${formatTime(block.start)}`
      : `${formatDuration(Math.ceil(left))} left`

  return (
    <div className="border-[3px] border-[#111] bg-white">
      <div className="flex items-center gap-3 px-3 py-2">
        <span
          className="grid size-10 shrink-0 place-items-center border-[3px] border-[#111] text-xl"
          style={{ background: category?.color }}
          aria-hidden="true"
        >
          {category?.emoji ?? '📌'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="label">{session.phase === 'focus' ? 'Now focusing on' : 'Working block'}</div>
          <div className={`truncate text-base leading-tight font-black ${block.completed ? 'line-through' : ''}`}>
            {block.title}
          </div>
          <div className="font-mono text-[11px] font-bold opacity-75">
            {formatTime(block.start)}–{formatTime(block.end)} · {status} · 🍅 {done}/{estimate}
          </div>
        </div>
      </div>
      <div className="h-2 border-t-[3px] border-[#111]">
        <div
          className="h-full"
          style={{ width: `${(elapsed / duration) * 100}%`, background: category?.color ?? INK, transition: 'width 1s linear' }}
        />
      </div>
      {(over || left <= 5) && <EndingBanner block={block} over={over} left={left} />}
    </div>
  )
}

/** The linked block is ending: extend it (pushing the day down) or wrap up. */
function EndingBanner({ block, over, left }: { block: TimeBlock; over: boolean; left: number }) {
  const blocks = useStore((s) => s.blocks)
  const next = blocks
    .filter((b) => !b.completed && b.id !== block.id && b.start >= block.start)
    .sort((a, b) => a.start - b.start)[0]
  const extend = (minutes: number) => {
    const r = useStore.getState().extendBlock(block.id, minutes)
    useUi.getState().notify(r.ok ? `⏩ Extended to ${formatTime(r.moves[0]!.end)} — later blocks pushed down` : failureMessage(r))
  }
  const cap = () => {
    const r = useStore.getState().capBlock(block.id)
    if (r.ok) useUi.getState().notify(r.freed > 0 ? `🎉 Capped — reclaimed ${Math.round(r.freed)} min` : '✅ Block done')
  }
  return (
    <div className="border-t-[3px] border-[#111] bg-accent px-3 py-2" role="alert">
      <div className="mb-1.5 text-xs font-black uppercase">
        {over ? '⏰ Block’s over — keep going?' : `⏳ Block ends in ${Math.ceil(left)} min`}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="btn bg-white! px-2! py-0.5! text-xs" onClick={() => extend(15)}>
          +15m
        </button>
        <button type="button" className="btn bg-white! px-2! py-0.5! text-xs" onClick={() => extend(30)}>
          +30m
        </button>
        {!block.completed && (
          <button type="button" className="btn bg-[#111]! px-2! py-0.5! text-xs text-white!" onClick={cap}>
            Cap block
          </button>
        )}
        {block.completed && next && (
          <button
            type="button"
            className="btn min-w-0 bg-[#111]! px-2! py-0.5! text-xs text-white!"
            onClick={() => usePomodoro.getState().retarget(next.id)}
          >
            <span className="truncate">Carry on into “{next.title}”</span>
          </button>
        )}
      </div>
    </div>
  )
}

function BigButton({ children, onClick, label }: { children: React.ReactNode; onClick(): void; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        unlockAudio()
        onClick()
      }}
      aria-label={label}
      className="flex w-full items-center justify-center gap-3 border-[4px] border-[#111] bg-[#111] px-5 py-2.5 text-xl font-black tracking-wider text-white uppercase shadow-[5px_5px_0_0_#fff] transition-transform duration-75 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0_0_#fff] active:translate-x-1 active:translate-y-1 active:shadow-none"
    >
      {children}
    </button>
  )
}

function Controls({ session }: { session: PomodoroSession }) {
  const p = usePomodoro.getState()
  const running = session.status === 'running'
  return (
    <div className="flex flex-col gap-2.5">
      <BigButton onClick={p.toggle} label={running ? 'Pause' : 'Start'}>
        {running ? (
          <>
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="h-5 w-2 bg-white" />
              <span className="h-5 w-2 bg-white" />
            </span>
            Pause
          </>
        ) : (
          <>
            <PlayIcon size={20} /> {session.status === 'paused' ? 'Resume' : 'Start'}
          </>
        )}
      </BigButton>
      <div className="flex gap-2">
        <button type="button" className={ghost} onClick={p.skip}>
          Skip ⏭
        </button>
        <button type="button" className={ghost} onClick={p.end} data-tip="Stop the timer — your calendar isn't touched">
          End Pomodoro
        </button>
      </div>
    </div>
  )
}

function CompleteCard({ session, config }: { session: PomodoroSession; config: PomodoroConfig }) {
  const p = usePomodoro.getState()
  const next = nextPhase(session, config)
  const wasFocus = session.phase === 'focus'
  return (
    <motion.div
      initial={{ y: 24, rotate: -2, opacity: 0 }}
      animate={{ y: 0, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 600, damping: 18 }}
      className="border-[4px] border-[#111] bg-white p-3 shadow-[5px_5px_0_0_#111]"
      role="status"
    >
      <div className="text-lg leading-tight font-black tracking-tight uppercase">
        {wasFocus ? `🍅 Pomodoro #${session.completed} done` : "⏰ Break's over"}
      </div>
      <p className="mb-2.5 text-xs font-bold">
        {wasFocus
          ? next.phase === 'long-break'
            ? `That's ${config.sessionsBeforeLong} in a row. Long break earned.`
            : 'Nice work. Step away for a minute.'
          : `Ready for focus ${next.round} of ${config.sessionsBeforeLong}?`}
      </p>
      <div className="flex flex-col gap-2">
        <BigButton onClick={p.next}>
          <PlayIcon size={18} /> {wasFocus ? `Start ${PHASE_LABEL[next.phase]}` : 'Start focus'}
        </BigButton>
        <div className="flex flex-wrap gap-2">
          {wasFocus ? (
            <button type="button" className={ghost} onClick={p.skipBreak}>
              Skip break
            </button>
          ) : (
            <>
              <button type="button" className={ghost} onClick={p.extraBreak}>
                +{config.shortBreakMin}m break
              </button>
              <button type="button" className={ghost} onClick={p.newCycle}>
                New cycle
              </button>
            </>
          )}
          <button type="button" className={ghost} onClick={p.end}>
            End
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function RecoveryCard({ session }: { session: PomodoroSession }) {
  const p = usePomodoro.getState()
  return (
    <div className="border-[4px] border-[#111] bg-white p-3 shadow-[5px_5px_0_0_#111]" role="alert">
      <div className="text-lg font-black uppercase">Welcome back</div>
      <p className="mb-2.5 text-xs font-bold">
        Your {PHASE_LABEL[session.phase].toLowerCase()} was interrupted with {formatClock(session.remainingMs)} left.
      </p>
      <div className="flex gap-2">
        <button type="button" className="btn flex-1 bg-[#111]! text-white!" onClick={p.resume}>
          <PlayIcon size={14} /> Resume
        </button>
        <button type="button" className={ghost} onClick={p.end}>
          Discard
        </button>
      </div>
    </div>
  )
}

function ViewerCard({ session }: { session: PomodoroSession }) {
  const p = usePomodoro.getState()
  return (
    <div className="border-[4px] border-[#111] bg-white p-3 shadow-[5px_5px_0_0_#111]" role="status">
      <div className="font-black uppercase">⏱️ Timer running in another tab</div>
      <p className="mb-2.5 text-xs font-bold">Only one tab keeps time, so nothing gets counted twice.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={ghost} onClick={session.status === 'running' ? p.pauseTimer : p.resume}>
          {session.status === 'running' ? 'Pause' : 'Resume'}
        </button>
        <button type="button" className={ghost} onClick={p.end}>
          End
        </button>
        <button type="button" className="btn flex-1 bg-[#111]! text-sm text-white!" onClick={() => void p.takeOver()}>
          Move timer here
        </button>
      </div>
    </div>
  )
}

/** Full-pane colour slam announcing the new phase. */
function PhaseFlash() {
  const flash = usePomodoro((s) => s.flash)
  const [visible, setVisible] = useState<typeof flash>(null)

  useEffect(() => {
    if (!flash) return
    setVisible(flash)
    const t = setTimeout(() => setVisible(null), 1100)
    return () => clearTimeout(t)
  }, [flash])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={visible.id}
          className="absolute inset-0 z-30 grid place-items-center border-[6px] border-[#111] p-4"
          style={{ background: PHASE_COLOR[visible.phase], transformOrigin: 'left' }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          exit={{ x: '105%' }}
          transition={{ duration: 0.2, ease: 'linear' }}
          aria-hidden="true"
        >
          <motion.div
            initial={{ scale: 1.6, rotate: -8 }}
            animate={{ scale: 1, rotate: -3 }}
            transition={{ type: 'spring', stiffness: 700, damping: 14 }}
            className="border-[5px] border-[#111] bg-white px-5 py-2.5 text-center text-[min(13cqw,4.5rem)] leading-none font-black tracking-tight whitespace-nowrap text-[#111] shadow-[8px_8px_0_0_#111]"
          >
            {PHASE_SHOUT[visible.phase]}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function CycleOptions({ config, onClose }: { config: PomodoroConfig; onClose(): void }) {
  const update = usePomodoro.getState().updateConfig
  const num = (key: keyof typeof POMODORO_LIMITS, label: string, unit = 'min') => {
    const [lo, hi] = POMODORO_LIMITS[key]
    return (
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-black uppercase">{label}</span>
        <span className="flex items-center gap-1.5">
          <input
            type="number"
            min={lo}
            max={hi}
            value={config[key]}
            onChange={(e) => update({ [key]: Number(e.target.value) })}
            className="field w-20! text-center font-mono"
          />
          <span className="w-8 text-xs font-bold text-muted">{unit}</span>
        </span>
      </label>
    )
  }
  return (
    <motion.div
      initial={{ y: '-100%' }}
      animate={{ y: 0 }}
      exit={{ y: '-100%' }}
      transition={{ duration: 0.18, ease: 'linear' }}
      className="absolute inset-x-0 top-0 z-40 max-h-full overflow-y-auto border-b-[4px] border-line bg-paper p-4 text-ink shadow-[0_6px_0_0_#111]"
      role="dialog"
      aria-label="Timer settings"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-black tracking-tight uppercase">Timer settings</h3>
        <button type="button" className="btn text-sm" onClick={onClose}>
          Done
        </button>
      </div>
      <div className="grid gap-2.5 @lg:grid-cols-2 @lg:gap-x-6">
        {num('focusMin', 'Focus')}
        {num('shortBreakMin', 'Short break')}
        {num('longBreakMin', 'Long break')}
        {num('sessionsBeforeLong', 'Long break every', '🍅')}
      </div>
      <div className="mt-4 grid gap-2 @lg:grid-cols-2">
        <button
          type="button"
          className="btn justify-start text-sm"
          aria-pressed={config.autoStart}
          onClick={() => update({ autoStart: !config.autoStart })}
        >
          {config.autoStart ? '✓' : '○'} Auto-start next session
        </button>
        <button
          type="button"
          className="btn justify-start text-sm"
          aria-pressed={config.sound}
          onClick={() => {
            unlockAudio()
            update({ sound: !config.sound })
          }}
        >
          {config.sound ? '🔊' : '🔈'} Sounds {config.sound ? 'on' : 'off'}
        </button>
      </div>
      {config.sound && (
        <label className="mt-3 flex items-center gap-3">
          <span className="text-sm font-black uppercase">Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.volume}
            onChange={(e) => update({ volume: Number(e.target.value) })}
            className="flex-1 accent-[#111]"
          />
        </label>
      )}
      <Segmented label="Tick pulse" value={config.pulse} options={['off', 'subtle', 'bold']} onChange={(pulse) => update({ pulse })} />
      <Segmented
        label="When a block starts"
        value={config.autoFocus}
        options={['off', 'prompt', 'auto']}
        names={{ off: 'Nothing', prompt: 'Ask me', auto: 'Auto-start' }}
        onChange={(autoFocus) => update({ autoFocus })}
      />
    </motion.div>
  )
}

function Segmented<T extends string>({
  label,
  value,
  options,
  names,
  onChange,
}: {
  label: string
  value: T
  options: T[]
  names?: Partial<Record<T, string>>
  onChange(v: T): void
}) {
  return (
    <fieldset className="mt-4">
      <legend className="label mb-1">{label}</legend>
      <div className="flex gap-1.5">
        {options.map((o) => (
          <button key={o} type="button" className="btn flex-1 text-sm capitalize" aria-pressed={value === o} onClick={() => onChange(o)}>
            {names?.[o] ?? o}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
