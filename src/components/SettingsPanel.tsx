import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { notificationsSupported, requestNotificationPermission, sendNotification } from '../lib/notify'
import { GRID_OPTIONS } from '../lib/time'
import { useStore, type Theme } from '../store/appStore'
import { useUi } from '../store/uiStore'
import { BellIcon, BellOffIcon, CloseIcon, MinusIcon, PlusIcon } from './icons'

const HOURS = Array.from({ length: 25 }, (_, h) => h)

export function SettingsPanel() {
  const open = useUi((s) => s.settingsOpen)
  const settings = useStore((s) => s.settings)
  const categories = useStore((s) => s.categories)
  const update = useStore((s) => s.updateSettings)
  const close = () => useUi.getState().toggleSettings(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const toggleNotifications = async () => {
    if (settings.notifications) return update({ notifications: false })
    const granted = await requestNotificationPermission()
    update({ notifications: granted })
    if (granted) sendNotification('🔔 iWill notifications on', "You'll get a nudge when a block ends.")
    else useUi.getState().notify('🔕 Notifications are blocked in your browser settings')
  }

  const zoom = (delta: number) => update({ hourHeight: Math.min(200, Math.max(40, settings.hourHeight + delta)) })

  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={close} aria-hidden="true" />
          <motion.section
            initial={{ opacity: 0, y: -12, rotate: 1 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: 'spring', stiffness: 520, damping: 32 }}
            className="fixed top-16 right-3 z-50 w-[min(22rem,calc(100vw-1.5rem))] space-y-4 border-[3px] border-line bg-paper p-4 shadow-brutal-lg"
            role="dialog"
            aria-label="Settings"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-black tracking-tight uppercase">Settings</h2>
              <button type="button" className="btn btn-icon" onClick={close} aria-label="Close settings">
                <CloseIcon size={14} />
              </button>
            </div>

            <div>
              <span className="label">Zoom · {settings.hourHeight}px per hour</span>
              <div className="mt-1 flex items-center gap-2">
                <button type="button" className="btn btn-icon" onClick={() => zoom(-20)} aria-label="Zoom out">
                  <MinusIcon size={14} />
                </button>
                <input
                  type="range"
                  min={40}
                  max={200}
                  step={10}
                  value={settings.hourHeight}
                  onChange={(e) => update({ hourHeight: Number(e.target.value) })}
                  className="flex-1 accent-ink"
                  aria-label="Hour height"
                />
                <button type="button" className="btn btn-icon" onClick={() => zoom(20)} aria-label="Zoom in">
                  <PlusIcon size={14} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="label">Day starts</span>
                <select
                  className="field font-mono"
                  value={settings.dayStartHour}
                  onChange={(e) => update({ dayStartHour: Number(e.target.value) })}
                >
                  {HOURS.filter((h) => h < settings.dayEndHour).map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Day ends</span>
                <select
                  className="field font-mono"
                  value={settings.dayEndHour}
                  onChange={(e) => update({ dayEndHour: Number(e.target.value) })}
                >
                  {HOURS.filter((h) => h > settings.dayStartHour).map((h) => (
                    <option key={h} value={h}>
                      {h === 24 ? '24:00' : `${String(h).padStart(2, '0')}:00`}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset>
              <legend className="label mb-1">Time grid</legend>
              <div className="flex gap-1.5">
                {GRID_OPTIONS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className="btn flex-1 font-mono text-sm"
                    aria-pressed={settings.grid === g}
                    onClick={() => update({ grid: g })}
                  >
                    {g} min
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs font-semibold text-muted">Where drags snap. Blocks can be as short as 5 minutes.</p>
            </fieldset>

            <div>
              <span className="label">Tags</span>
              <button
                type="button"
                className="btn mt-1 w-full justify-between"
                onClick={() => {
                  close()
                  useUi.getState().toggleTags(true)
                }}
              >
                <span className="flex min-w-0 items-center gap-1 truncate" aria-hidden="true">
                  {categories.slice(0, 6).map((c) => (
                    <span key={c.id}>{c.emoji}</span>
                  ))}
                </span>
                <span>Manage tags →</span>
              </button>
            </div>

            <fieldset>
              <legend className="label mb-1">Theme</legend>
              <div className="flex gap-1.5">
                {(['system', 'light', 'dark'] as Theme[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="btn flex-1 text-sm capitalize"
                    aria-pressed={settings.theme === t}
                    onClick={() => update({ theme: t })}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </fieldset>

            {notificationsSupported() && (
              <button
                type="button"
                className="btn w-full justify-start"
                aria-pressed={settings.notifications}
                onClick={toggleNotifications}
              >
                {settings.notifications ? <BellIcon size={16} /> : <BellOffIcon size={16} />}
                {settings.notifications ? 'Notifications on' : 'Notify me when blocks end'}
              </button>
            )}

            <p className="text-xs font-semibold text-muted">
              Everything lives in this browser (IndexedDB). No accounts, no servers.
            </p>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  )
}
