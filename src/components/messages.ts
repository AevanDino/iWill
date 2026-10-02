import type { ResolveFailure } from '../lib/collision'
import { useStore } from '../store/appStore'

export function failureMessage(f: ResolveFailure | { ok: false; reason: string }): string {
  const blockerId = 'blockerId' in f ? f.blockerId : undefined
  const blocker = blockerId ? useStore.getState().blocks.find((b) => b.id === blockerId) : undefined
  switch (f.reason) {
    case 'blocked':
      if (blocker && !blocker.locked && !blocker.completed) return `🧱 No room left for “${blocker.title}” in between`
      return blocker
        ? `🔒 “${blocker.title}” is ${blocker.locked ? 'locked' : 'done'} — can't land on it`
        : "🔒 Can't land on a locked block"
    case 'locked':
      return blocker ? `🔒 Unlock “${blocker.title}” to move it` : '🔒 Unlock it to move it'
    case 'out-of-bounds':
      return '🧱 Not enough room to push blocks that far'
    default:
      return "🙅 Can't do that"
  }
}
