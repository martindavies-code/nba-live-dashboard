// -----------------------------------------------------------------------------
// Web Audio API Sound Synthesizer for Hoops Dashboard
// -----------------------------------------------------------------------------

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

/**
 * Play crisp basketball referee whistle (two-tone trill).
 */
export function playWhistleSound(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  const osc1 = ctx.createOscillator()
  const osc2 = ctx.createOscillator()
  const gain = ctx.createGain()

  osc1.type = 'sine'
  osc2.type = 'triangle'
  osc1.frequency.setValueAtTime(2800, now)
  osc1.frequency.linearRampToValueAtTime(3200, now + 0.08)
  osc1.frequency.linearRampToValueAtTime(2900, now + 0.16)

  osc2.frequency.setValueAtTime(2400, now)
  osc2.frequency.linearRampToValueAtTime(2700, now + 0.08)

  gain.gain.setValueAtTime(0.01, now)
  gain.gain.linearRampToValueAtTime(0.18, now + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)

  osc1.connect(gain)
  osc2.connect(gain)
  gain.connect(ctx.destination)

  osc1.start(now)
  osc2.start(now)
  osc1.stop(now + 0.24)
  osc2.stop(now + 0.24)
}

/**
 * Play swish sound (crisp white noise swoosh).
 */
export function playSwishSound(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  const bufferSize = ctx.sampleRate * 0.18
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }

  const noise = ctx.createBufferSource()
  noise.buffer = buffer

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(1400, now)
  filter.frequency.exponentialRampToValueAtTime(600, now + 0.18)
  filter.Q.setValueAtTime(3, now)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.01, now)
  gain.gain.linearRampToValueAtTime(0.2, now + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)

  noise.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)

  noise.start(now)
  noise.stop(now + 0.19)
}

/**
 * Play arena buzzer horn (low frequency saw).
 */
export function playBuzzerSound(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(180, now)

  gain.gain.setValueAtTime(0.01, now)
  gain.gain.linearRampToValueAtTime(0.22, now + 0.04)
  gain.gain.setValueAtTime(0.22, now + 0.4)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + 0.62)
}

/**
 * Play subtle tactile UI click.
 */
export function playTactileClick(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(800, now)
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.04)

  gain.gain.setValueAtTime(0.08, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + 0.05)
}
