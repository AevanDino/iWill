import { Component, type ReactNode } from 'react'

/** Last line of defence: a render error shows a reload card instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[iwill] render crashed', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid h-dvh place-items-center px-4" role="alert">
        <div className="brutal max-w-sm -rotate-1 bg-paper px-4 py-3 text-sm font-bold">
          <div className="mb-1 text-base font-black">Something broke. 💥</div>
          <p className="mb-3">Your day and timer are saved — reloading picks up where you left off.</p>
          <button type="button" className="btn bg-accent! text-[#111]!" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}
