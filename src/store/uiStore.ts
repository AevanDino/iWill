import { create } from 'zustand'
import type { Minutes } from '../types'

export interface RoutineDrag {
  routineId: string
  x: number
  y: number
}

interface UiState {
  editingId: string | null
  deckOpen: boolean
  settingsOpen: boolean
  /** The tag manager dialog. */
  tagsOpen: boolean
  /** Select mode: taps pick blocks, and dragging a picked block moves them all. */
  selecting: boolean
  selected: ReadonlySet<string>
  toast: { id: number; message: string } | null
  routineDrag: RoutineDrag | null
  /** Blocks that were just shoved by a cascade (e.g. a cap) and should bounce into place. */
  bouncing: ReadonlySet<string>
  /**
   * While a block is dragged on the timeline: where each affected block would
   * land on release. Lets the timer pane and Now strip preview the change.
   */
  landing: Readonly<Record<string, { start: Minutes; end: Minutes }>> | null
  /** Registered by the timeline: maps a viewport point to minutes, or null if outside it. */
  probe: ((x: number, y: number) => Minutes | null) | null

  edit(id: string | null): void
  toggleDeck(open?: boolean): void
  toggleSettings(open?: boolean): void
  toggleTags(open?: boolean): void
  startSelecting(ids?: string[]): void
  toggleSelected(id: string): void
  setSelected(ids: Iterable<string>): void
  stopSelecting(): void
  notify(message: string): void
  setRoutineDrag(drag: RoutineDrag | null): void
  bounce(ids: string[]): void
  setProbe(probe: UiState['probe']): void
  setLanding(landing: UiState['landing']): void
}

let toastId = 0

export const useUi = create<UiState>()((set) => ({
  editingId: null,
  deckOpen: false,
  settingsOpen: false,
  tagsOpen: false,
  selecting: false,
  selected: new Set(),
  toast: null,
  routineDrag: null,
  bouncing: new Set(),
  probe: null,
  landing: null,

  edit: (editingId) => set({ editingId }),
  toggleDeck: (open) => set((s) => ({ deckOpen: open ?? !s.deckOpen })),
  toggleSettings: (open) => set((s) => ({ settingsOpen: open ?? !s.settingsOpen })),
  toggleTags: (open) => set((s) => ({ tagsOpen: open ?? !s.tagsOpen })),
  startSelecting: (ids = []) => set({ selecting: true, selected: new Set(ids), editingId: null }),
  toggleSelected: (id) =>
    set((s) => {
      const selected = new Set(s.selected)
      if (!selected.delete(id)) selected.add(id)
      return { selected }
    }),
  setSelected: (ids) => set({ selected: new Set(ids) }),
  stopSelecting: () => set({ selecting: false, selected: new Set() }),
  notify: (message) => set({ toast: { id: ++toastId, message } }),
  setRoutineDrag: (routineDrag) => set({ routineDrag }),
  bounce(ids) {
    const bouncing = new Set(ids)
    set({ bouncing })
    setTimeout(() => set((s) => (s.bouncing === bouncing ? { bouncing: new Set() } : s)), 1200)
  },
  setProbe: (probe) => set({ probe }),
  setLanding: (landing) => set({ landing }),
}))
