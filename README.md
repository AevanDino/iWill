# iWill

Physics-flavoured timeboxing. 100% client-side and offline: no accounts, no servers. Everything lives in IndexedDB.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # collision engine + store tests (Vitest)
npm run build
```

## How it works

| Piece | Where |
| --- | --- |
| Collision engine (pure, deterministic) | `src/lib/collision.ts` |
| Store: Zustand + Dexie, one transaction per gesture | `src/store/appStore.ts` |
| Timeline, gestures, live cascade preview | `src/components/Timeline.tsx` |
| Block, liquid fill, Cap button | `src/components/BlockView.tsx` |
| Routine deck (drag onto timeline) | `src/components/RoutineDeck.tsx` |
| Tags: manager, form, emoji + colour pickers | `src/components/tags/` |
| Timer loop + notifications | `src/hooks/useActiveBlock.ts` |
| Spring tuning | `src/lib/physics.ts` |
| Pomodoro state machine (pure) | `src/lib/pomodoro.ts` |
| Pomodoro store: persistence, recovery, tabs | `src/store/pomodoroStore.ts` |
| Timer pane, split divider, focus prompt | `src/components/focus/` |
| Cross-tab ownership (Web Locks + BroadcastChannel) | `src/lib/tabSync.ts` |

**Collisions.** Blocks are solid. Dragging a block on the timeline pushes everything in its way, and the blocks it pushes keep their order: nothing ever passes through the block you're dragging, however fast you move it (`resolvePush`). A pushed chain stops at the start of the day, the end of the day, or the now-line on today, and the dragged block stops with it. **Hold still for a moment mid-drag to slot in instead**: a bar fills on the time label, the phone gives a tick, and the block then slides through the others, which part at the seam nearest its middle. Hold again to switch back to pushing. Dropped routines, new blocks and edits from the editor use `resolveCollisions`: blocks starting above the drop are pushed up, the rest down, and a routine drop pushes everything down. Locked and completed blocks never move: pushed blocks hop over them, and a drop *onto* one is rejected. If any block would leave the day, the whole gesture is rejected, so there are no partial results. The same function runs on every pointer move to preview the cascade, then once more on release to commit it.

**Cap.** Finishing early sets the block's end to *now* and pulls the following blocks up by the freed time, stopping at the first locked or completed block.

**Gestures.** Mouse: drag a block's body to move it, drag an edge to resize, click to edit. On empty grid, click to add a 30-minute block, or press and drag up or down to size a new one: it snaps to 15-minute slots, previews the cascade, and is created on release. Touch: long-press to lift a block, or long-press empty grid and drag to draw one (a plain swipe scrolls). Keyboard: focus a block, then ↑/↓ moves it, Shift+↑/↓ resizes it, Enter edits, Delete removes.

**Select mode.** Tap the ☑ button in the header (or the one in the block editor) to select several blocks. While selecting, a tap toggles a block and dragging a selected block moves the whole selection, again pushing others and holding still to slot in. The bar at the bottom can add every block touching the selection (**Connected**), nudge the selection up or down 15 minutes, lock it, mark it done or delete it. Escape, **Done**, or changing the day ends select mode.

**Pomodoro.** Start focus from a block's 🍅 button, by double-tapping the block, from the header (a quick focus not tied to any block), or from the prompt that appears when a block starts. The timer docks beside the calendar: on the right in landscape, below it in portrait. The calendar stays fully usable. The split defaults to 70% timer and 30% calendar; drag the divider (or focus it and use the arrow keys) to resize, and double-click it to reset. Press F or the Fullscreen button to hide the calendar, and Esc to bring it back. If the block is already running, the focus is shortened so it ends with the block: a block with 10 minutes left gets a 10-minute focus. It is never longer than your focus length. The timer runs from wall-clock timestamps, so it never drifts. It is saved to IndexedDB every second. After a quick refresh it carries on; after a longer absence it freezes at the last saved second and asks whether to resume. Only one tab keeps time: other tabs can pause or end the session, or move the timer to themselves, and if the owning tab closes, another tab takes over. The focused block gets a red outline but can still be moved, edited or deleted without affecting the timer. When it's about to end, the timer pane offers to extend it (pushing the rest of the day down), cap it, or carry the session on into the next block.

**Tags.** Every block has one tag, which sets its colour and icon. Create, edit and delete tags from the block editor (**＋ New tag**, **Manage tags →**) or from Settings → Tags. Icons are emoji (pick from the grid or paste any). Colours come from a palette or the custom picker, and block text switches between black and white to stay readable. Deleting a tag moves its blocks, on every day, and its routine steps to a tag you choose. The first tag is the default for new blocks.

Settings (zoom, day range, theme, notifications) are kept in `localStorage`. Blocks, categories and routines are kept in IndexedDB.
