# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

iWill is a single-day timeboxing planner with a built-in Pomodoro timer. Blocks on the timeline behave physically: they push each other out of the way. It runs 100% client-side and offline, with no accounts and no server. React 19 + TypeScript + Vite, Zustand for state, Dexie (IndexedDB) for persistence, Motion for animation, Tailwind 4 for styling.

## Commands

```bash
npm run dev                      # Vite dev server, http://localhost:5173
npm test                         # Vitest, single run
npm run test:watch
npx vitest run src/lib/collision.test.ts          # one file
npx vitest run -t "ending a session"              # tests whose name matches
npm run typecheck                # tsc --noEmit (there is no linter)
npm run build                    # typecheck + vite build → dist/
```

Tests run in the `node` environment and only pick up `src/**/*.test.ts`. There is no DOM or React Testing Library, so components aren't unit-tested. Store tests use `fake-indexeddb/auto`, a fresh `IWillDB(name)` per test, `createSoloCoordinator()`, and `effects: false` on the Pomodoro store.

## Architecture

**Pure core, thin stores, gesture-heavy UI.** Scheduling logic lives in pure functions under `src/lib/` that return data and never mutate. The stores apply that data and persist it. Components call the same pure functions to preview a result before committing it.

- **Collision engine (`src/lib/collision.ts`).** `resolveCollisions(blocks, pinned, options)` returns `{ ok, moves }` or a failure reason. It never makes a partial change: if any block would leave the day, or a pinned block lands on a locked or completed one, the whole gesture fails. `computeCap` handles finishing a block early. Two resolvers: `resolvePush` is used for timeline drags (move, resize, group moves and `moveGroup`). It preserves order, so blocks never pass through the dragged one, and the day edges and the now-line act as walls (`out-of-bounds`, which the timeline turns into "stop at the last position that fit"). `resolveCollisions` handles everything else (create, the editor, routines, extend) and the hold-to-slot-in drag mode (`pivot`). The timeline calls the resolver on every pointer move for the live preview and commits that preview's moves on release. `resolveOptionsFor(state)` in `appStore.ts` supplies the day bounds and the `upFloor` that stops future blocks being pushed into the past on today's timeline.
- **App store (`src/store/appStore.ts`).** Built by the factory `createAppStore(db, { sync })`, so tests get isolated instances. Every user action goes through `commit()`, which diffs against the previous blocks by reference and writes only the changed rows, in a single Dexie transaction. Only the currently viewed `date` is held in memory. Other tabs are told to reload over a BroadcastChannel.
- **Pomodoro (`src/lib/pomodoro.ts` + `src/store/pomodoroStore.ts`).** The state machine is pure and wall-clock based: while running, the remaining time comes from `endsAt`, never from counting ticks down. The store is a factory taking dependencies (`database`, `coordinator`, `app`, `effects`). It persists the session every tick, and `recover()` decides on reload whether to carry on or freeze the timer and ask the user. Finished focus sessions go to the `focusLog` table.
- **Cross-tab ownership (`src/lib/tabSync.ts`).** Only one tab runs the timer, enforced with the Web Locks API (`iwill:pomodoro-owner`); state and commands travel over a BroadcastChannel. A tab has `role` `owner` or `viewer`. Viewer actions are sent to the owner as `cmd` messages, so only an owner calls `commit` in the Pomodoro store. When the owning tab closes, a queued viewer takes over (`adopt()`).
- **Time sources.** `src/store/clock.ts` is a shared 1 Hz ticker; select only the slice you need (e.g. the current minute) to limit re-renders. The Pomodoro tick runs separately, from a Web Worker (`ticker.worker.ts`, which isn't throttled in background tabs), plus a `setTimeout` timed to the exact end of the phase. `useActiveBlockTimer` (in `src/hooks/useActiveBlock.ts`) marks blocks complete when they finish and tells the Pomodoro store when a planned block starts.
- **Timeline gestures (`src/components/Timeline.tsx`).** A single pointer-gesture engine handles moving blocks, resizing them from either edge, and creating them by dragging on empty grid (`kind: 'create'`). It attaches pointer listeners to `window` and reads the latest values through refs (`live`, `onMoveRef`, …). On touch, a long-press arms the drag so that a plain swipe still scrolls. Previews are local `DragPreview` state, and only the release commits to the store. `swallowNextClick()` eats the stray click the browser fires after a drag.
- **UI store (`src/store/uiStore.ts`).** Transient state: the editor target, panels, toasts (`notify`), bounce animations, and the `probe` the timeline registers so the routine deck can map a drag point to minutes.

## Conventions and gotchas

- **Breaks past their block** are handled in `pomodoroStore`'s `commit()`, the single place every timer change passes through: it spots a break that just started (or was left early) and uses `findBreakOverflow` in `src/lib/breaks.ts` to push, shorten, or record the cost. A pushed break's inserted block id lives on the session (`breakBlockId`) so leaving early can cap it.
- **Tags = categories.** The UI calls them tags; the code keeps the `Category` type, the `categories` table and `categoryId`. Tag order is the `order` field (seed tags without it fall back to seed order, see `sortCategories`), and the first tag is the default for new blocks. Wherever a tag colour is a background, set the text colour with `inkOn(color)` from `src/lib/color.ts`, not a hard-coded `#111`.
- **Times** are `Minutes` since local midnight (fractional allowed). Snapping uses `settings.grid` (5, 10 or 15; default `DEFAULT_GRID` = 5) via `snap(m, step)`, and the shortest block is `MIN_DURATION` (5). Pure helpers take the step as an argument; components read it from the store. Blocks under `SLIVER_PX` on screen are drawn as slivers, with their text in flags laid out by `layoutFlags` (`src/lib/flags.ts`). Dates are `DateKey` strings (`YYYY-MM-DD`). Use the helpers in `src/lib/time.ts`.
- **Storage split:** blocks, categories, routines, Pomodoro sessions and the focus log live in IndexedDB. Settings, Pomodoro config and the split ratio live in `localStorage` under `iwill:*` keys, with every access wrapped in try/catch. To change the Dexie schema, add a new `this.version(n)` in `src/db/db.ts` instead of editing an existing one.
- **AnimatePresence exits:** a child that is animating out keeps re-rendering with live store state. Don't assume a store value still exists there; `TimerPane` keeps the last non-null session for this reason. `src/main.tsx` wraps the app in an `ErrorBoundary` so a render crash shows a reload card instead of a blank page.
- **User-facing failures** go through `failureMessage(result)` (`src/components/messages.ts`) and `useUi.getState().notify(...)`. Log errors with `console.error('[iwill] …')`.
- **Calendar/timer layout:** the minimum sizes and the side-by-side breakpoint live in `src/lib/layout.ts`, and are mirrored by the `side`/`stacked` variants and the `.timer-dock` rules in `src/index.css`. Change both together.
- **Colours and themes:** never hard-code `#111`, white or black for a surface, text or shadow. Use the tokens in `src/index.css` (`bg-card`, `text-ink`, `border-line`, `bg-chip`/`text-on-chip`, `shadow-brutal*` / `var(--shadow)`), which have Night Shift values in dark mode. Anything in a tag's colour gets `className="tagged"` (or `tag-fill`) plus `style={tagStyle(color)}` from `src/components/tags/tagStyle.ts`: a colour slab by day, a dark tint with a glowing edge at night. The timer pane sets `--*-day` / `--*-night` variables (`phasePalette(...).night`, `nightTone` in `src/lib/color.ts`) and CSS picks one. `#111` is only right as text on something that stays bright in both themes (yellow accent buttons, the red FOCUS badge).
- **Styling:** a brutalist look (`brutal`, `btn` classes, 3–4px black borders, hard offset shadows). Theme colours are CSS variables in `src/index.css`.
- **Dev handle:** in dev builds the stores are exposed on `window.__iwill` (`useStore`, `usePomodoro`) for console poking.
