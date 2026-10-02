import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { IWillDB } from '../db/db'
import { createSoloCoordinator } from '../lib/tabSync'
import { minutesOfDay, toDateKey } from '../lib/time'
import { createAppStore } from './appStore'
import { createPomodoroStore } from './pomodoroStore'

let n = 0
const flush = () => new Promise((r) => setTimeout(r, 30))
const MIN = 60_000

describe('pomodoro store', () => {
  let database: IWillDB
  let app: ReturnType<typeof createAppStore>
  const make = () => createPomodoroStore({ database, app, coordinator: createSoloCoordinator(), effects: false })

  beforeEach(async () => {
    database = new IWillDB(`pomo-${n++}`)
    app = createAppStore(database)
    await app.getState().hydrate()
  })

  function addBlockNow(minutes = 60) {
    const nowMin = Math.floor(minutesOfDay(new Date()))
    const start = Math.max(0, nowMin - 5)
    return app.getState().addBlock({ title: 'Write', start, end: Math.min(24 * 60, start + minutes) }).id
  }

  it('starts a running session for a block and marks the block in focus', async () => {
    const pomo = make()
    await pomo.getState().hydrate()
    const id = addBlockNow()
    await pomo.getState().startFor(id)
    expect(pomo.getState().session).toMatchObject({ blockId: id, status: 'running', phase: 'focus' })
    expect(app.getState().focusBlockId).toBe(id)
  })

  it('counts a finished focus on the block, logs it, and waits for the user', async () => {
    const pomo = make()
    await pomo.getState().hydrate()
    const id = addBlockNow()
    await pomo.getState().startFor(id)
    pomo.getState().tick(pomo.getState().session!.endsAt!)
    expect(pomo.getState().session).toMatchObject({ status: 'complete', completed: 1 })
    expect(app.getState().blocks.find((b) => b.id === id)?.pomodoros).toBe(1)
    await flush()
    expect(await database.focusLog.where('blockId').equals(id).count()).toBe(1)
    // completing a Pomodoro doesn't complete the block
    expect(app.getState().blocks.find((b) => b.id === id)?.completed).toBe(false)
  })

  it('a focus on a running block ends with the block when it has less than a Pomodoro left', async () => {
    const pomo = make()
    await pomo.getState().hydrate()
    const short = addBlockNow(15) // started 5 min ago, ~10 min left
    await pomo.getState().startFor(short)
    const s = pomo.getState().session!
    const blockEnd = app.getState().blocks.find((b) => b.id === short)!.end
    const leftMs = (blockEnd - minutesOfDay(new Date())) * MIN
    expect(Math.abs(s.durationMs - leftMs)).toBeLessThan(2000)
    expect(s.endsAt! - Date.now()).toBeLessThanOrEqual(s.durationMs)

    // a block with plenty of time left still gets a full Pomodoro
    const long = addBlockNow(120)
    await pomo.getState().startFor(long)
    expect(pomo.getState().session!.durationMs).toBe(pomo.getState().config.focusMin * MIN)
  })

  it('moving or resizing the focused block moves the end of its focus', async () => {
    const pomo = make()
    await pomo.getState().hydrate()
    const id = addBlockNow(15) // ~10 min left: a fitted ~10-minute focus
    await pomo.getState().startFor(id)
    const before = pomo.getState().session!.endsAt!
    const b = () => app.getState().blocks.find((x) => x.id === id)!

    // stretch the block by 5 minutes: the focus ends 5 minutes later
    app.getState().moveBlock(id, b().start, b().end + 5)
    expect(Math.abs(pomo.getState().session!.endsAt! - (before + 5 * MIN))).toBeLessThan(1500)

    // move it away from now: no longer running, so the focus gets its full length back
    const startedAt = pomo.getState().session!.phaseStartedAt!
    const away = minutesOfDay(new Date()) < 12 * 60 ? 120 : -120 // whichever way the day has room
    expect(app.getState().moveBlock(id, b().start + away, b().end + away).ok).toBe(true)
    expect(pomo.getState().session!.durationMs).toBe(pomo.getState().config.focusMin * MIN)
    expect(pomo.getState().session!.endsAt).toBe(startedAt + pomo.getState().config.focusMin * MIN)
  })

  it('auto-starts the break when configured', async () => {
    const pomo = make()
    await pomo.getState().hydrate()
    pomo.getState().updateConfig({ autoStart: true })
    await pomo.getState().startFor(null)
    pomo.getState().tick(pomo.getState().session!.endsAt!)
    expect(pomo.getState().session).toMatchObject({ phase: 'short-break', status: 'running' })
    expect(pomo.getState().flash?.phase).toBe('short-break')
  })

  it('recovers a session after reload, asking to resume when it was away too long', async () => {
    const pomo = make()
    await pomo.getState().hydrate()
    await pomo.getState().startFor(null)
    const s = pomo.getState().session!
    // Simulate the tab dying 5 minutes in, with the last tick recorded then.
    await database.pomodoroSessions.put({ ...s, updatedAt: s.updatedAt - 20 * MIN, endsAt: s.endsAt! - 20 * MIN })
    const reloaded = make()
    await reloaded.getState().hydrate()
    expect(reloaded.getState().session).toMatchObject({ id: s.id, status: 'paused', interrupted: true })
    expect(reloaded.getState().session!.remainingMs).toBe(25 * MIN)
  })

  it('carries straight on after a quick refresh', async () => {
    const pomo = make()
    await pomo.getState().hydrate()
    await pomo.getState().startFor(null)
    await flush()
    const reloaded = make()
    await reloaded.getState().hydrate()
    expect(reloaded.getState().session).toMatchObject({ status: 'running' })
  })

  it('parks a session when switching blocks and resumes it later', async () => {
    const pomo = make()
    await pomo.getState().hydrate()
    const a = addBlockNow(30)
    const b = app.getState().addBlock({ title: 'Other', start: 23 * 60, end: 23 * 60 + 30 }).id
    await pomo.getState().startFor(a)
    const first = pomo.getState().session!.id
    await pomo.getState().startFor(b)
    expect(pomo.getState().session?.blockId).toBe(b)
    expect((await database.pomodoroSessions.get(first))?.status).toBe('paused')
    await pomo.getState().startFor(a)
    expect(pomo.getState().session).toMatchObject({ id: first, status: 'running' })
  })

  it('ending a session releases the block and clears the active pointer', async () => {
    const pomo = make()
    await pomo.getState().hydrate()
    const id = addBlockNow()
    await pomo.getState().startFor(id)
    pomo.getState().end()
    expect(pomo.getState().session).toBeNull()
    expect(app.getState().focusBlockId).toBeNull()
    await flush()
    expect((await database.meta.get('activeSession'))?.value).toBeNull()
    const reloaded = make()
    await reloaded.getState().hydrate()
    expect(reloaded.getState().session).toBeNull()
  })

  it('the calendar stays fully editable while the timer runs', async () => {
    const pomo = make()
    await pomo.getState().hydrate()
    await app.getState().setDate(toDateKey(new Date()))
    const id = addBlockNow(60)
    await pomo.getState().startFor(id)
    const endsAt = pomo.getState().session!.endsAt

    const focused = app.getState().blocks.find((b) => b.id === id)!
    // dropping a block on the focused one pushes it like any other block
    const r = app.getState().addBlock({ title: 'Intruder', start: focused.start, end: focused.start + 15 })
    expect(r.result.ok).toBe(true)
    expect(app.getState().blocks.find((b) => b.id === id)!.start).not.toBe(focused.start)
    // deleting it doesn't touch the timer
    app.getState().deleteBlock(id)
    expect(pomo.getState().session).toMatchObject({ status: 'running', endsAt })
    pomo.getState().tick(endsAt!)
    expect(pomo.getState().session).toMatchObject({ status: 'complete', completed: 1 })
  })
})
