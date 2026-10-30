export class AudioEngine {
  constructor() {
    this.ctx = null
    this.enabled = true
    this.started = false
    this.speed = 0
    this.gear = 1
  }

  init() {
    if (this.started) {
      if (this.ctx?.state === 'suspended') this.ctx.resume()
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    const ctx = this.ctx

    this.master = ctx.createGain()
    this.master.gain.value = this.enabled ? 0.55 : 0
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.knee.value = 18
    comp.ratio.value = 4
    comp.attack.value = 0.005
    comp.release.value = 0.25
    this.master.connect(comp)
    comp.connect(ctx.destination)

    this.engineGain = ctx.createGain()
    this.engineGain.gain.value = 0.0001
    this.engineFilter = ctx.createBiquadFilter()
    this.engineFilter.type = 'lowpass'
    this.engineFilter.frequency.value = 420
    this.engineFilter.Q.value = 5
    this.engineGain.connect(this.engineFilter)
    this.engineFilter.connect(this.master)

    this.osc1 = ctx.createOscillator()
    this.osc1.type = 'sawtooth'
    this.osc1.frequency.value = 60
    this.osc2 = ctx.createOscillator()
    this.osc2.type = 'square'
    this.osc2.frequency.value = 61
    this.osc2.detune.value = 8
    const oscGain2 = ctx.createGain()
    oscGain2.gain.value = 0.35
    this.osc1.connect(this.engineGain)
    this.osc2.connect(oscGain2)
    oscGain2.connect(this.engineGain)

    this.lfo = ctx.createOscillator()
    this.lfo.type = 'sine'
    this.lfo.frequency.value = 7
    this.lfoGain = ctx.createGain()
    this.lfoGain.gain.value = 4
    this.lfo.connect(this.lfoGain)
    this.lfoGain.connect(this.osc1.frequency)
    this.lfoGain.connect(this.osc2.frequency)

    this.noiseBuffer = this._makeNoise(2.5)
    this.wind = this._loopNoise('bandpass', 900, 0.6)
    this.windGain = this.wind
    this.screech = this._loopNoise('bandpass', 2100, 9)
    this.screechGain = this.screech
    this.nitro = this._loopNoise('highpass', 1200, 0.7)
    this.nitroGain = this.nitro

    this.osc1.start()
    this.osc2.start()
    this.lfo.start()
    this.started = true
  }

  _makeNoise(seconds) {
    const ctx = this.ctx
    const length = Math.floor(ctx.sampleRate * seconds)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    return buffer
  }

  _loopNoise(type, freq, q) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    filter.Q.value = q
    const gain = ctx.createGain()
    gain.gain.value = 0
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    src.start()
    return gain
  }

  setEnabled(on) {
    this.enabled = on
    if (!this.ctx) return
    this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.08)
  }

  toggle() {
    this.setEnabled(!this.enabled)
    return this.enabled
  }

  beep(freq = 660, duration = 0.1, type = 'sine', volume = 0.18) {
    if (!this.ctx || !this.enabled) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(volume, t + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start(t)
    osc.stop(t + duration + 0.05)
  }

  countdown(go) {
    if (go) {
      this.beep(880, 0.5, 'triangle', 0.25)
      this.beep(1320, 0.5, 'sine', 0.12)
    } else {
      this.beep(440, 0.18, 'square', 0.14)
    }
  }

  update(speed, throttle, nitro, drifting, offroad, dt) {
    if (!this.ctx || !this.started || !this.windGain || !this.screechGain || !this.nitroGain) return
    const t = this.ctx.currentTime
    const s = Math.abs(speed)
    this.speed = s
    const gear = Math.min(6, 1 + Math.floor(s / 16))
    if (gear !== this.gear) {
      this.gear = gear
      this.engineFilter.frequency.setTargetAtTime(900, t, 0.02)
    }
    const within = Math.min(1, (s - (gear - 1) * 16) / 16)
    const freq = 46 + within * 128 + gear * 4 + throttle * 14 + (nitro ? 26 : 0)
    this.osc1.frequency.setTargetAtTime(freq, t, 0.05)
    this.osc2.frequency.setTargetAtTime(freq * 1.01, t, 0.05)
    this.lfoGain.gain.setTargetAtTime(2 + throttle * 6, t, 0.1)
    this.engineFilter.frequency.setTargetAtTime(320 + s * 18 + throttle * 500, t, 0.06)
    this.engineGain.gain.setTargetAtTime(0.055 + throttle * 0.11 + Math.min(s, 90) * 0.0012, t, 0.08)

    this.windGain.gain.setTargetAtTime(Math.min(1, s / 90) * 0.12, t, 0.15)
    this.screechGain.gain.setTargetAtTime(drifting && !offroad ? 0.075 : offroad ? 0.035 : 0, t, 0.05)
    this.nitroGain.gain.setTargetAtTime(nitro ? 0.075 : 0, t, 0.08)
  }
}
