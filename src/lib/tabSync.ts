/**
 * Cross-tab coordination for the Pomodoro timer.
 *
 * Ownership uses the Web Locks API: the tab running the timer holds an
 * exclusive lock, which the browser releases automatically if that tab closes
 * or crashes — so a waiting tab can adopt the session with no heartbeat.
 * State and commands travel over a BroadcastChannel.
 */

export type SyncMessage =
  | { type: 'state'; session: unknown }
  | { type: 'ended' }
  | { type: 'hello' }
  | { type: 'cmd'; action: 'pause' | 'resume' | 'end' }

export interface TimerCoordinator {
  /** Become the owner if nobody else is. Resolves true if this tab owns the timer. */
  claim(): Promise<boolean>
  /** Take ownership even from a live tab (it's told and becomes a viewer). */
  steal(): Promise<void>
  /** Queue up to become owner as soon as the current owner goes away. */
  waitForOwnership(): void
  cancelWait(): void
  release(): void
  broadcast(msg: SyncMessage): void
  /** `onLost` fires if another tab steals ownership; `onAcquired` when a queued wait succeeds. */
  listen(handlers: { message(msg: SyncMessage): void; lost(): void; acquired(): void }): () => void
}

const LOCK = 'iwill:pomodoro-owner'

export function createTabCoordinator(): TimerCoordinator {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('iwill:pomodoro') : null
  let releaseHeld: (() => void) | null = null
  let waitAbort: AbortController | null = null
  let handlers: Parameters<TimerCoordinator['listen']>[0] | null = null

  /** Holds the lock until `release()`; reports theft via `lost`. */
  function hold(): Promise<void> {
    return new Promise<void>((resolve) => {
      releaseHeld = () => {
        releaseHeld = null
        resolve()
      }
    })
  }

  function request(options: LockOptions, onGranted: (granted: boolean) => void) {
    let held = false
    locks!
      .request(LOCK, options, (lock) => {
        if (!lock) {
          onGranted(false)
          return
        }
        held = true
        onGranted(true)
        return hold()
      })
      .catch(() => {
        // Rejects when a wait is aborted (never held — ignore) or when
        // another tab steals the lock from us.
        if (held) {
          releaseHeld = null
          handlers?.lost()
        }
      })
  }

  return {
    claim() {
      if (!locks) return Promise.resolve(true)
      if (releaseHeld) return Promise.resolve(true)
      this.cancelWait()
      return new Promise((resolve) => request({ ifAvailable: true }, resolve))
    },
    steal() {
      if (!locks) return Promise.resolve()
      this.cancelWait()
      return new Promise((resolve) => request({ steal: true }, () => resolve()))
    },
    waitForOwnership() {
      if (!locks || releaseHeld || waitAbort) return
      waitAbort = new AbortController()
      request({ signal: waitAbort.signal }, (granted) => {
        waitAbort = null
        if (granted) handlers?.acquired()
      })
    },
    cancelWait() {
      waitAbort?.abort()
      waitAbort = null
    },
    release() {
      releaseHeld?.()
    },
    broadcast(msg) {
      channel?.postMessage(msg)
    },
    listen(h) {
      handlers = h
      const onMessage = (e: MessageEvent<SyncMessage>) => h.message(e.data)
      channel?.addEventListener('message', onMessage)
      return () => {
        channel?.removeEventListener('message', onMessage)
        handlers = null
      }
    },
  }
}

/** For tests and browsers without Web Locks: this tab always owns the timer. */
export function createSoloCoordinator(): TimerCoordinator {
  return {
    claim: () => Promise.resolve(true),
    steal: () => Promise.resolve(),
    waitForOwnership() {},
    cancelWait() {},
    release() {},
    broadcast() {},
    listen: () => () => {},
  }
}
