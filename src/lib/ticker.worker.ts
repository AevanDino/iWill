// Runs in a Web Worker so ticks keep coming when the tab is in the
// background (main-thread timers get throttled to ~1/min after a while).
let timer: ReturnType<typeof setInterval> | undefined

self.onmessage = (e: MessageEvent<'start' | 'stop'>) => {
  clearInterval(timer)
  if (e.data === 'start') timer = setInterval(() => self.postMessage(Date.now()), 1000)
}
