/** Tiny synthesized sounds — no audio files, works offline. */
let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Call from a user gesture so later sounds are allowed to play. */
export function unlockAudio() {
  audio()
}

function blip(freq: number, duration: number, volume: number, when = 0, type: OscillatorType = 'square') {
  const a = audio()
  if (!a || volume <= 0) return
  const t = a.currentTime + when
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(volume, t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.connect(gain).connect(a.destination)
  osc.start(t)
  osc.stop(t + duration + 0.02)
}

export function playTick(volume: number) {
  blip(1400, 0.025, volume * 0.12, 0, 'square')
}

export function playChime(volume: number, kind: 'focus-done' | 'break-done') {
  const notes = kind === 'focus-done' ? [523, 659, 784, 1047] : [784, 659, 523]
  notes.forEach((f, i) => blip(f, 0.22, volume * 0.35, i * 0.13, 'triangle'))
}
