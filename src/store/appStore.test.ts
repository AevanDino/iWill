import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { IWillDB } from '../db/db'
import { toDateKey } from '../lib/time'
import { createAppStore } from './appStore'

const h = (hours: number, minutes = 0) => hours * 60 + minutes
let dbCount = 0

/** Wait for fire-and-forget Dexie writes to land. */
const flush = () => new Promise((r) => setTimeout(r, 20))

describe('app store', () => {
  let database: IWillDB
  let store: ReturnType<typeof createAppStore>

  beforeEach(async () => {
    database = new IWillDB(`test-${dbCount++}`)
    store = createAppStore(database)
    await store.getState().hydrate()
    // Pin the timeline to a day that isn't "today" so the up-floor is the day start.
    await store.getState().setDate('2020-01-01')
  })

  it('seeds default categories and routines on first run', () => {
    expect(store.getState().categories.length).toBeGreaterThan(0)
    expect(store.getState().routines.length).toBeGreaterThan(0)
  })

  it('persists collision cascades atomically and rehydrates them', async () => {
    const s = store.getState()
    s.addBlock({ title: 'A', start: h(9), end: h(10) })
    s.addBlock({ title: 'B', start: h(10), end: h(11) })
    const { result } = store.getState().addBlock({ title: 'C', start: h(9), end: h(9, 30) })
    expect(result.ok).toBe(true)
    await flush()

    const fresh = createAppStore(database)
    await fresh.getState().hydrate()
    await fresh.getState().setDate('2020-01-01')
    const byTitle = Object.fromEntries(fresh.getState().blocks.map((b) => [b.title, [b.start, b.end]]))
    expect(byTitle).toEqual({ C: [h(9), h(9, 30)], A: [h(9, 30), h(10, 30)], B: [h(10, 30), h(11, 30)] })
  })

  it('rejects a move onto a locked block without changing anything', () => {
    const s = store.getState()
    const { id: a } = s.addBlock({ title: 'A', start: h(8), end: h(9) })
    const { id: lock } = store.getState().addBlock({ title: 'L', start: h(12), end: h(13) })
    store.getState().toggleLock(lock)
    const before = store.getState().blocks
    expect(store.getState().moveBlock(a, h(12), h(13))).toMatchObject({ ok: false, reason: 'blocked' })
    expect(store.getState().blocks).toBe(before)
  })

  it('caps a block, marks it complete and pulls the next one up', () => {
    const today = toDateKey(new Date())
    return store
      .getState()
      .setDate(today)
      .then(() => {
        const now = new Date()
        now.setHours(10, 35, 0, 0)
        const { id: a } = store.getState().addBlock({ title: 'A', start: h(10), end: h(11) })
        const { id: b } = store.getState().addBlock({ title: 'B', start: h(11), end: h(12) })
        const r = store.getState().capBlock(a, now)
        expect(r).toMatchObject({ ok: true, freed: 25 })
        const blocks = store.getState().blocks
        expect(blocks.find((x) => x.id === a)).toMatchObject({ end: h(10, 35), completed: true })
        expect(blocks.find((x) => x.id === b)).toMatchObject({ start: h(10, 35), end: h(11, 35) })
      })
  })

  it('spawns a routine as sequential blocks and pushes conflicts down', () => {
    const s = store.getState()
    s.addBlock({ title: 'Existing', start: h(9), end: h(10) })
    const routine = store.getState().routines[0]!
    const total = routine.steps.reduce((n, st) => n + st.duration, 0)
    expect(store.getState().spawnRoutine(routine.id, h(9)).ok).toBe(true)
    const blocks = [...store.getState().blocks].sort((x, y) => x.start - y.start)
    expect(blocks.map((b) => b.title)).toEqual([...routine.steps.map((st) => st.title), 'Existing'])
    expect(blocks.at(-1)).toMatchObject({ start: h(9) + total })
  })

  describe('tags', () => {
    it('creates, renames and persists tags in order, rejecting duplicate names', async () => {
      const created = store.getState().saveCategory({ name: '  Client X ', color: '#1f3a93', emoji: '💼' })
      expect(created).toMatchObject({ ok: true, category: { name: 'Client X' } })
      if (!created.ok) return
      expect(store.getState().categories.at(-1)!.id).toBe(created.category.id)

      expect(store.getState().saveCategory({ name: 'client x', color: '#fff' })).toMatchObject({ ok: false })
      expect(store.getState().saveCategory({ name: '   ', color: '#fff' })).toMatchObject({ ok: false })

      const renamed = store.getState().saveCategory({ ...created.category, name: 'Client Y' })
      expect(renamed.ok).toBe(true)
      await flush()

      const fresh = createAppStore(database)
      await fresh.getState().hydrate()
      const tags = fresh.getState().categories
      expect(tags.at(-1)).toMatchObject({ id: created.category.id, name: 'Client Y', emoji: '💼' })
      expect(tags[0]!.id).toBe('focus')
    })

    it('deleting a tag moves its blocks on every day and its routine steps to the replacement', async () => {
      const { id } = store.getState().addBlock({ title: 'Plan', categoryId: 'admin', start: h(9), end: h(10) })
      await database.blocks.put({
        id: 'other-day',
        date: '2020-02-02',
        title: 'Elsewhere',
        categoryId: 'admin',
        start: h(9),
        end: h(10),
        completed: false,
        locked: false,
      })
      await flush()

      expect(await store.getState().deleteCategory('admin', 'focus')).toBe(true)
      const s = store.getState()
      expect(s.categories.some((c) => c.id === 'admin')).toBe(false)
      expect(s.blocks.find((b) => b.id === id)!.categoryId).toBe('focus')
      expect(s.routines.flatMap((r) => r.steps).some((st) => st.categoryId === 'admin')).toBe(false)

      expect((await database.blocks.get('other-day'))!.categoryId).toBe('focus')
      expect(await database.categories.get('admin')).toBeUndefined()
      const routines = await database.routines.toArray()
      expect(routines.flatMap((r) => r.steps).some((st) => st.categoryId === 'admin')).toBe(false)
    })

    it('refuses to delete the last tag or replace a tag with itself', async () => {
      expect(await store.getState().deleteCategory('focus', 'focus')).toBe(false)
      for (const c of store.getState().categories.slice(1)) await store.getState().deleteCategory(c.id, 'focus')
      expect(store.getState().categories.map((c) => c.id)).toEqual(['focus'])
      expect(await store.getState().deleteCategory('focus', 'meeting')).toBe(false)
    })
  })

  describe('groups', () => {
    function chain() {
      const s = store.getState()
      return ['A', 'B', 'C'].map((title, i) => s.addBlock({ title, start: h(9 + i), end: h(10 + i) }).id)
    }

    it('moves a group together, pushing others, and persists it', async () => {
      const [a, b, c] = chain()
      const r = store.getState().moveGroup([a!, b!], 30)
      expect(r.ok).toBe(true)
      const pos = (id: string) => store.getState().blocks.find((x) => x.id === id)!.start
      expect([pos(a!), pos(b!), pos(c!)]).toEqual([h(9, 30), h(10, 30), h(11, 30)])
      await flush()
      expect((await database.blocks.get(c!))!.start).toBe(h(11, 30))
    })

    it('refuses a group move that hits the wall or includes a locked block, changing nothing', () => {
      const [a, b] = chain()
      const before = store.getState().blocks
      expect(store.getState().moveGroup([b!], -(h(10) - h(6)) + 30)).toMatchObject({ ok: false, reason: 'out-of-bounds' })
      store.getState().toggleLock(a!)
      const locked = store.getState().blocks
      expect(store.getState().moveGroup([a!, b!], 15)).toMatchObject({ ok: false, reason: 'locked', blockerId: a })
      expect(store.getState().blocks).toBe(locked)
      expect(before.map((x) => x.start)).toEqual(locked.map((x) => x.start))
    })

    it('locks, completes and deletes several blocks at once', async () => {
      const [a, b, c] = chain()
      store.getState().setMany([a!, b!], { locked: true, completed: true })
      expect(store.getState().blocks.filter((x) => x.locked && x.completed).map((x) => x.id).sort()).toEqual([a, b].sort())
      store.getState().deleteBlocks([a!, c!])
      expect(store.getState().blocks.map((x) => x.id)).toEqual([b])
      await flush()
      expect(await database.blocks.where('date').equals('2020-01-01').primaryKeys()).toEqual([b])
    })
  })
})
