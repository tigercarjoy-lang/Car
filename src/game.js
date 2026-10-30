import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { Track } from './track.js'
import { World } from './world.js'
import { CarModel, CarEntity, AIDriver } from './car.js'
import { ParticleSystem, SkidMarks } from './particles.js'
import { AudioEngine } from './audio.js'
import { CARS, OPPONENTS, QUALITY, RACE_LAPS } from './config.js'
import { clamp, damp, angleDiff, mod } from './utils.js'

const $ = id => document.getElementById(id)

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.62 },
    aberration: { value: 0.0009 },
    grain: { value: 0.008 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float vignette;
    uniform float aberration;
    uniform float grain;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      float ab = aberration * (0.7 + r2 * 2.2);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + d * ab).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - d * ab).b;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 1.07);
      float vig = smoothstep(0.92, 0.22, length(d) * 1.28);
      col *= mix(1.0, vig, vignette);
      float n = fract(sin(dot(vUv * vec2(1024.0, 768.0) + time * 41.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * grain;
      gl_FragColor = vec4(col, 1.0);
    }
  `
}

function pad(n, len) {
  return String(n).padStart(len, '0')
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds <= 0) return '--:--.---'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`
}

function colorCss(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`
}

export class Game {
  constructor() {
    this.state = 'loading'
    this.time = 0
    this.accum = 0
    this.step = 1 / 120
    this.selectedCar = 0
    this.qualityKey = 'high'
    this.quality = QUALITY.high
    this.cameraMode = 'chase'
    this.laps = RACE_LAPS
    this.raceElapsed = 0
    this.countdownTimer = 3
    this.lastCountdown = ''
    this.lastSeenLap = new Map()
    this.finishDelay = 0
    this.resultsShown = false
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false }
    this.touch = new Set()
    this.keys = new Set()
    this.fpsFrames = 0
    this.fpsTime = 0
    this.fps = 60
    this.lowFpsTime = 0
    this.minimapTime = 0
    this.skidTime = 0
    this.smokeTime = 0
    this.cameraPos = new THREE.Vector3()
    this.cameraLook = new THREE.Vector3()
    this.cameraInitialized = false
    this.audio = new AudioEngine()
    this.cars = []
    this.aiDrivers = []
    this.player = null
  }

  async init() {
    this._cacheDom()
    this._setupRenderer()

    const progress = async (value, label) => {
      $('loading-fill').style.width = `${value}%`
      $('loading-status').textContent = label
      await new Promise(r => setTimeout(r, 24))
    }

    await progress(12, 'Building the coast…')
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.2, 1800)
    this.camera.position.set(0, 6, 12)

    await progress(30, 'Painting the sky…')
    this.track = new Track(this.scene, this.renderer, this.quality)
    await progress(48, 'Laying rubber on the coast…')
    this.world = new World(this.scene, this.renderer, this.track, this.quality)
    await progress(66, 'Warming up six supercars…')
    this._setupCars()
    this._setupParticles()
    this._setupPost()
    await progress(82, 'Calibrating the grid…')

    this._setupUI()
    this._setupInput()
    this._positionCars()
    this._selectCar()
    this.state = 'menu'
    this.cameraMode = 'chase'

    await progress(94, 'Almost ready…')
    try { this.composer?.render() } catch (err) { console.warn('Warm-up render failed', err) }
    if (!this.composer) this.renderer.render(this.scene, this.camera)
    this._updateCamera(0.016)

    await progress(100, 'Lights out.')
    setTimeout(() => $('loading').classList.add('done'), 250)
    this.last = performance.now()
    this._animate = this._animate.bind(this)
    requestAnimationFrame(this._animate)
  }

  _cacheDom() {
    this.dom = {
      hud: $('hud'),
      menu: $('menu'),
      pause: $('pause'),
      results: $('results'),
      countdown: $('countdown'),
      toast: $('toast'),
      wrongway: $('wrongway'),
      lap: $('hud-lap'),
      pos: $('hud-pos'),
      clock: $('hud-clock'),
      best: $('hud-best'),
      last: $('hud-last'),
      fps: $('hud-fps'),
      speed: $('hud-speed'),
      gear: $('hud-gear'),
      nitro: $('nitro-fill'),
      nitroPct: $('nitro-pct'),
      lapTotal: $('hud-lap-total'),
      arc: $('speedo-arc'),
      carList: $('car-list'),
      stats: $('car-stats'),
      selClass: $('sel-class'),
      quality: $('quality'),
      camera: $('camera-mode'),
      start: $('start'),
      resume: $('resume'),
      restart: $('restart'),
      quit: $('quit'),
      again: $('again'),
      garage: $('garage'),
      sound: $('btn-sound'),
      camBtn: $('btn-camera'),
      pauseBtn: $('btn-pause'),
      resultsTitle: $('results-title'),
      resultsSub: $('results-sub'),
      resultsTable: $('results-table'),
      minimap: $('minimap'),
      touch: $('touch')
    }
    this.minimapCtx = this.dom.minimap.getContext('2d')
  }

  _setupRenderer() {
    const canvas = $('scene')
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false
      })
    } catch (err) {
      $('fatal').classList.remove('hidden')
      throw err
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio))
    this.renderer.setSize(window.innerWidth, window.innerHeight, false)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.14
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = this.quality.shadows
    this.renderer.shadowMap.type = THREE.PCFShadowMap
  }

  _setupCars() {
    const grid = []
    OPPONENTS.forEach((op, i) => {
      const config = {
        ...CARS[i % CARS.length],
        paint: op.paint,
        accent: op.accent,
        glass: op.glass,
        topSpeed: 88 + op.skill * 8,
        accel: 24 + op.skill * 4,
        handling: 1.0 + (i % 3) * 0.05,
        grip: 8.8,
        nitroPower: 1
      }
      const model = new CarModel(config, { number: [3, 11, 23, 44, 88][i], quality: this.quality })
      this.scene.add(model.root)
      const entity = new CarEntity({ track: this.track, config, model, isPlayer: false, name: op.name })
      entity.number = [3, 11, 23, 44, 88][i]
      grid.push(entity)
      const driver = new AIDriver(entity, op.skill, i + 1)
      driver.lane = (i % 2 === 0 ? -1 : 1) * (1.2 + (i % 3) * 0.6)
      this.aiDrivers.push(driver)
    })

    this.playerModels = CARS.map((cfg, i) => {
      const model = new CarModel(cfg, { isPlayer: true, number: 7, quality: this.quality })
      model.root.visible = false
      this.scene.add(model.root)
      return model
    })

    this.player = new CarEntity({
      track: this.track,
      config: CARS[this.selectedCar],
      model: this.playerModels[this.selectedCar],
      isPlayer: true,
      name: CARS[this.selectedCar].name
    })
    this.player.number = 7
    this.cars = [...grid, this.player]
  }

  _setupParticles() {
    this.particles = new ParticleSystem(this.scene, this.quality.particles)
    this.skids = new SkidMarks(this.scene, this.quality.skidMarks)
  }

  _setupPost() {
    if (this.composer) {
      try { this.composer.dispose() } catch {}
      this.composer = null
    }
    if (!this.quality.bloom) return
    try {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2())
      const target = new THREE.WebGLRenderTarget(size.x, size.y, {
        type: THREE.HalfFloatType,
        samples: this.quality.samples,
        colorSpace: THREE.LinearSRGBColorSpace
      })
      this.composer = new EffectComposer(this.renderer, target)
      this.renderPass = new RenderPass(this.scene, this.camera)
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(size.x, size.y),
        this.quality.bloomStrength,
        this.quality.bloomRadius,
        this.quality.bloomThreshold
      )
      this.gradePass = new ShaderPass(GradeShader)
      this.outputPass = new OutputPass()
      this.composer.addPass(this.renderPass)
      this.composer.addPass(this.bloomPass)
      this.composer.addPass(this.gradePass)
      this.composer.addPass(this.outputPass)
    } catch (err) {
      console.warn('Post-processing unavailable, falling back to direct render', err)
      this.composer = null
    }
  }

  _setupUI() {
    this.dom.carList.innerHTML = CARS.map((car, i) => `
      <button class="car-card${i === this.selectedCar ? ' selected' : ''}" data-car="${i}" aria-label="Select ${car.name}">
        <span class="car-card__swatch" style="--swatch:${colorCss(car.paint)}"></span>
        <span class="car-card__name"><b>${car.name}</b><span>${car.klass} · ${car.blurb}</span></span>
        <span class="car-card__tag">${(0.99 + car.stats.speed).toFixed(2)}</span>
      </button>
    `).join('')
    this.dom.carList.querySelectorAll('.car-card').forEach(card => {
      card.addEventListener('click', () => {
        this.selectedCar = Number(card.dataset.car)
        this._selectCar()
        this.audio.beep(720, 0.07, 'sine', 0.1)
      })
    })

    this.dom.quality.addEventListener('change', () => {
      this.qualityKey = this.dom.quality.value
      this.quality = QUALITY[this.qualityKey]
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio))
      this.renderer.setSize(window.innerWidth, window.innerHeight, false)
      this.renderer.shadowMap.enabled = this.quality.shadows
      this.world.sun.shadow.mapSize.set(this.quality.shadowMap, this.quality.shadowMap)
      if (this.world.sun.shadow.map) {
        this.world.sun.shadow.map.dispose()
        this.world.sun.shadow.map = null
      }
      this._setupPost()
      this._onResize()
    })

    this.dom.camera.addEventListener('change', () => {
      this.cameraMode = this.dom.camera.value
    })

    const lapsSelect = $('race-laps')
    if (lapsSelect) {
      lapsSelect.addEventListener('change', () => {
        this.laps = Number(lapsSelect.value) || 3
      })
    }

    this.dom.start.addEventListener('click', () => {
      this.audio.init()
      this._beginRace()
    })
    this.dom.resume.addEventListener('click', () => this._togglePause(false))
    this.dom.restart.addEventListener('click', () => {
      this.dom.pause.classList.add('hidden')
      this._beginRace()
    })
    this.dom.quit.addEventListener('click', () => this._quitToMenu())
    this.dom.again.addEventListener('click', () => {
      this.dom.results.classList.add('hidden')
      this._beginRace()
    })
    this.dom.garage.addEventListener('click', () => this._quitToMenu())
    this.dom.sound.addEventListener('click', () => {
      if (!this.audio.ctx) this.audio.init()
      const on = this.audio.toggle()
      this.dom.sound.textContent = on ? '◉' : '○'
    })
    this.dom.camBtn.addEventListener('click', () => this._cycleCamera())
    this.dom.pauseBtn.addEventListener('click', () => this._togglePause())

    this.dom.touch.querySelectorAll('[data-touch]').forEach(btn => {
      const key = btn.dataset.touch
      const down = e => {
        e.preventDefault()
        this.touch.add(key)
        btn.setPointerCapture?.(e.pointerId)
      }
      const up = e => {
        e.preventDefault()
        this.touch.delete(key)
      }
      btn.addEventListener('pointerdown', down)
      btn.addEventListener('pointerup', up)
      btn.addEventListener('pointercancel', up)
      btn.addEventListener('lostpointercapture', up)
    })

    this._selectCar()
  }

  _selectCar() {
    this.dom.carList.querySelectorAll('.car-card').forEach((card, i) => {
      card.classList.toggle('selected', i === this.selectedCar)
    })
    const car = CARS[this.selectedCar]
    this.dom.selClass.textContent = car.klass
    this.dom.stats.querySelectorAll('[data-stat]').forEach(el => {
      el.style.width = `${Math.round(car.stats[el.dataset.stat] * 100)}%`
    })
    if (this.player && this.playerModels) {
      this.playerModels.forEach((m, i) => { m.root.visible = i === this.selectedCar })
      this.player.model = this.playerModels[this.selectedCar]
      this.player.config = car
      this.player.name = car.name
    }
  }

  _setupInput() {
    const block = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'])
    window.addEventListener('keydown', e => {
      if (block.has(e.code)) e.preventDefault()
      if (e.repeat) return
      this.keys.add(e.code)
      if (e.code === 'Enter' && this.state === 'menu') {
        this.audio.init()
        this._beginRace()
      }
      if (e.code === 'KeyC' && (this.state === 'racing' || this.state === 'countdown')) this._cycleCamera()
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (this.state === 'racing') this._togglePause(true)
        else if (this.state === 'paused') this._togglePause(false)
      }
      if (e.code === 'F3') {
        this.dom.fps.parentElement.classList.toggle('show')
      }
      if (e.code === 'KeyR' && this.state === 'racing') {
        this.player.resetToTrack()
        this._showToast('RESET TO TRACK')
      }
    })
    window.addEventListener('keyup', e => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())
    window.addEventListener('resize', () => this._onResize())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'racing') this._togglePause(true)
    })
  }

  _onResize() {
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio))
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (this.composer) {
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio))
      this.composer.setSize(w, h)
    }
  }

  _positionCars() {
    const order = [...this.cars.filter(c => !c.isPlayer), this.player]
    order.forEach((car, slot) => {
      const pose = this.track.getStartPose(slot, order.length)
      car.reset(pose)
    })
    this.playerModels.forEach((m, i) => { m.root.visible = i === this.selectedCar })
    this.player.model.root.position.copy(this.player.pos)
    this.player.model.root.rotation.y = this.player.heading
  }

  _beginRace() {
    this.dom.menu.classList.add('leaving')
    this.dom.results.classList.add('hidden')
    this.dom.pause.classList.add('hidden')
    this.dom.hud.classList.add('active')
    this.dom.hud.setAttribute('aria-hidden', 'false')
    this._positionCars()
    this.state = 'countdown'
    this.countdownTimer = 3.0
    this.lastCountdown = ''
    this.raceElapsed = 0
    this.finishDelay = 0
    this.resultsShown = false
    this.lastSeenLap.clear()
    this.cars.forEach(c => {
      c.raceLaps = this.laps
      c.lapStart = 0
      c.bestLap = Infinity
      c.lastLap = 0
      this.lastSeenLap.set(c, 0)
    })
    this.track.setStartLights(0, false)
    this.cameraMode = this.dom.camera.value
    this.cameraInitialized = false
    this._toastTimer = 0
    this._showToast('NEON COAST GRAND PRIX')
    this.dom.wrongway.classList.remove('show')
    this._updateHUD(0)
    this.audio.init()
    this._updateCamera(0.016)
  }

  _togglePause(show) {
    if (show === undefined) show = this.state === 'racing'
    if (show && this.state === 'racing') {
      this.state = 'paused'
      this.dom.pause.classList.remove('hidden')
      this.dom.hud.classList.remove('active')
    } else if (!show && this.state === 'paused') {
      this.state = 'racing'
      this.dom.pause.classList.add('hidden')
      this.dom.hud.classList.add('active')
      this.last = performance.now()
    }
  }

  _quitToMenu() {
    this.state = 'menu'
    this.dom.pause.classList.add('hidden')
    this.dom.results.classList.add('hidden')
    this.dom.hud.classList.remove('active')
    this.dom.hud.setAttribute('aria-hidden', 'true')
    this.dom.menu.classList.remove('leaving')
    this.dom.wrongway.classList.remove('show')
    this._positionCars()
    this.cameraInitialized = false
    $('loading').classList.add('done')
  }

  _cycleCamera() {
    const modes = ['chase', 'hood', 'far']
    const i = modes.indexOf(this.cameraMode)
    this.cameraMode = modes[(i + 1) % modes.length]
    if (this.dom.camera) this.dom.camera.value = this.cameraMode
    this._showToast(`${this.cameraMode.toUpperCase()} CAMERA`)
  }

  _showToast(text) {
    this.dom.toast.textContent = text
    this.dom.toast.classList.add('show')
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => this.dom.toast.classList.remove('show'), 1700)
  }

  _getInput() {
    const k = this.keys
    const t = this.touch
    let throttle = k.has('KeyW') || k.has('ArrowUp') || t.has('gas') ? 1 : 0
    let brake = k.has('KeyS') || k.has('ArrowDown') || t.has('brake') ? 1 : 0
    let steer = (k.has('KeyA') || k.has('ArrowLeft') || t.has('left') ? -1 : 0) +
      (k.has('KeyD') || k.has('ArrowRight') || t.has('right') ? 1 : 0)
    let handbrake = k.has('Space')
    let nitro = k.has('ShiftLeft') || k.has('ShiftRight') || t.has('boost')

    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    const pad = pads && pads[0]
    if (pad) {
      const axis = pad.axes[0] || 0
      if (Math.abs(axis) > 0.15) steer += axis
      if (pad.buttons[7]?.value > 0.1 || pad.buttons[0]?.pressed) throttle = 1
      if (pad.buttons[6]?.value > 0.1 || pad.buttons[1]?.pressed) brake = 1
      if (pad.buttons[2]?.pressed) nitro = true
      if (pad.buttons[3]?.pressed) handbrake = true
    }

    return {
      throttle,
      brake,
      steer: clamp(steer, -1, 1),
      handbrake,
      nitro
    }
  }

  _simulate(dt) {
    if (this.state === 'countdown') {
      this.countdownTimer -= dt
      const remaining = this.countdownTimer
      if (remaining > 2) this._showCountdown('3', false)
      else if (remaining > 1) this._showCountdown('2', false)
      else if (remaining > 0) this._showCountdown('1', false)
      else {
        this._showCountdown('GO', true)
        this.state = 'racing'
        this.raceElapsed = 0
        this.track.setStartLights(5, true)
        this.audio.countdown(true)
      }
      const lit = remaining > 2 ? 1 : remaining > 1 ? 2 : remaining > 0 ? 3 : 5
      this.track.setStartLights(lit, remaining <= 0)
      this.cars.forEach(c => c.update(dt, { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false }, false))
      return
    }

    if (this.state === 'racing') {
      this.raceElapsed += dt
      this.input = this._getInput()
      this.player.update(dt, this.input, true)
      this.aiDrivers.forEach(d => d.update(dt, this.cars, true, this.time + this.raceElapsed))
      this._resolveCollisions()
      this._handleLapEvents()
      this._rankCars()
      this.audio.update(this.player.speed, this.input.throttle, this.player.nitroActive, this.player.drifting, this.player.offroad, dt)
      return
    }

    if (this.state === 'finished') {
      this.finishDelay -= dt
      this.cars.forEach(c => {
        c.update(dt, { throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false }, false)
      })
      if (!this.resultsShown && this.finishDelay <= 0) this._showResults()
    }
  }

  _resolveCollisions() {
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i]
        const b = this.cars[j]
        const dx = b.pos.x - a.pos.x
        const dz = b.pos.z - a.pos.z
        const dist = Math.hypot(dx, dz)
        if (dist > 2.45 || dist < 0.0001) continue
        const nx = dx / dist
        const nz = dz / dist
        const push = (2.45 - dist) * 0.5
        a.pos.x -= nx * push
        a.pos.z -= nz * push
        b.pos.x += nx * push
        b.pos.z += nz * push
        const rel = (b.velocity.x - a.velocity.x) * nx + (b.velocity.z - a.velocity.z) * nz
        if (rel < 0) {
          const impulse = -rel * 0.42
          a.velocity.x -= nx * impulse
          a.velocity.z -= nz * impulse
          b.velocity.x += nx * impulse
          b.velocity.z += nz * impulse
        }
        a.velocity.multiplyScalar(0.985)
        b.velocity.multiplyScalar(0.985)
      }
    }
  }

  _handleLapEvents() {
    for (const car of this.cars) {
      const seen = this.lastSeenLap.get(car) ?? 0
      if (car.lap > seen) {
        const newLap = car.lap
        if (newLap === 1) {
          car.lapStart = this.raceElapsed
        } else if (newLap <= car.raceLaps + 1) {
          const lapTime = this.raceElapsed - car.lapStart
          car.lastLap = lapTime
          if (lapTime > 1) car.bestLap = Math.min(car.bestLap, lapTime)
          car.lapStart = this.raceElapsed
        }
        this.lastSeenLap.set(car, newLap)
        if (car.finished && car.finishTime === 0) car.finishTime = this.raceElapsed
        if (car.isPlayer) {
          if (newLap === 1) this._showToast('LAP 1 · GO')
          else if (newLap <= car.raceLaps) this._showToast(`LAP ${newLap - 1} · ${formatTime(car.lastLap)}`)
          else if (newLap === car.raceLaps + 1) {
            this._showToast('RACE COMPLETE')
            this._finishRace()
          }
        }
        this.audio.beep(newLap > car.raceLaps ? 1040 : 780, 0.09, 'triangle', 0.1)
      } else if (car.lap < seen) {
        this.lastSeenLap.set(car, car.lap)
      }
    }
  }

  _rankCars() {
    const sorted = [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime
      if (a.finished) return -1
      if (b.finished) return 1
      return b.totalProgress - a.totalProgress
    })
    sorted.forEach((car, i) => { car.place = i + 1 })
    this.player.place = sorted.findIndex(c => c.isPlayer) + 1
  }

  _finishRace() {
    this.state = 'finished'
    this.finishDelay = 1.5
    this.player.finished = true
    this.player.finishTime = this.raceElapsed
    this.track.setStartLights(5, false)
    this._rankCars()
    this._showToast('RACE COMPLETE')
    this.audio.beep(660, 0.2, 'triangle', 0.16)
    setTimeout(() => this.audio.beep(990, 0.35, 'triangle', 0.14), 160)
    this.dom.wrongway.classList.remove('show')
  }

  _showResults() {
    this.resultsShown = true
    const sorted = [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime
      if (a.finished) return -1
      if (b.finished) return 1
      return b.totalProgress - a.totalProgress
    })
    const meIndex = sorted.findIndex(c => c.isPlayer)
    const me = sorted[meIndex]
    const place = meIndex + 1
    this.dom.resultsTitle.textContent = place === 1 ? 'VICTORY' : place <= 3 ? 'PODIUM' : 'RACE COMPLETE'
    this.dom.resultsSub.textContent = `You finished P${place} · Best lap ${formatTime(me.bestLap)}`

    const rows = ['<div class="results-row head"><span>POS</span><span>DRIVER</span><span>TIME / GAP</span><span>BEST</span></div>']
    sorted.forEach((car, i) => {
      let time
      if (car.finished) time = formatTime(car.finishTime)
      else {
        const leader = sorted[0]
        const diff = Math.max(0, leader.totalProgress - car.totalProgress)
        time = `+${(diff * this.track.length / 42).toFixed(2)}s`
      }
      rows.push(`<div class="results-row${car.isPlayer ? ' me' : ''}">
        <span class="pos">P${i + 1}</span>
        <span>${car.name}</span>
        <span class="tm">${time}</span>
        <span class="tm">${formatTime(car.bestLap)}</span>
      </div>`)
    })
    this.dom.resultsTable.innerHTML = rows.join('')
    this.dom.results.classList.remove('hidden')
    this.dom.hud.classList.remove('active')
    this.state = 'results'
    this.audio.beep(place === 1 ? 1320 : 880, 0.4, 'sine', 0.16)
  }

  _showCountdown(text, go) {
    if (this.lastCountdown === text) return
    const first = this.lastCountdown === ''
    this.lastCountdown = text
    const el = this.dom.countdown
    el.textContent = text
    el.classList.remove('show', 'go')
    void el.offsetWidth
    el.classList.add('show')
    if (go) {
      el.classList.add('go')
      setTimeout(() => { if (this.state !== 'countdown') el.classList.remove('show') }, 1100)
    }
    this.audio.countdown(go)
    if (first && text === '3') this.dom.wrongway.classList.remove('show')
  }

  _updateCamera(dt) {
    const car = this.player
    if (!car) return
    const speedF = clamp(Math.abs(car.speed) / 92, 0, 1)
    const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading))
    const right = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading))
    const desiredPos = new THREE.Vector3()
    const desiredLook = new THREE.Vector3()

    if (this.state === 'menu') {
      const center = car.pos.clone().add(new THREE.Vector3(0, 0.7, 0))
      const sway = Math.sin(this.time * 0.22) * 0.7
      desiredPos.copy(center)
        .addScaledVector(forward, 6.5 + sway)
        .addScaledVector(right, 8.6)
        .add(new THREE.Vector3(0, 3.5 + Math.sin(this.time * 0.4) * 0.18, 0))
      desiredLook.copy(center).addScaledVector(forward, 0.4).addScaledVector(right, 2.0)
      this.camera.position.copy(desiredPos)
      this.camera.lookAt(desiredLook)
      this.camera.fov = damp(this.camera.fov, 58, 4, dt)
      this.camera.updateProjectionMatrix()
      return
    }

    const shake = (this.player.nitroActive ? 0.05 : 0) + (this.player.offroad ? 0.04 : 0)
    const sx = (Math.random() - 0.5) * shake
    const sy = (Math.random() - 0.5) * shake

    if (this.cameraMode === 'hood') {
      desiredPos.copy(car.pos).addScaledVector(forward, 0.35).add(new THREE.Vector3(0, 1.22, 0))
      desiredLook.copy(car.pos).addScaledVector(forward, 22).add(new THREE.Vector3(0, 1.0, 0))
    } else if (this.cameraMode === 'far') {
      desiredPos.copy(car.pos).addScaledVector(forward, -13 - speedF * 2).add(new THREE.Vector3(0, 5.4, 0)).addScaledVector(right, -1.8)
      desiredLook.copy(car.pos).addScaledVector(forward, 8).add(new THREE.Vector3(0, 1.2, 0))
    } else {
      const dist = 7.4 + speedF * 3.1 + (this.player.nitroActive ? 0.9 : 0)
      const height = 2.95 + speedF * 0.35
      desiredPos.copy(car.pos).addScaledVector(forward, -dist).add(new THREE.Vector3(0, height, 0)).addScaledVector(right, -car.steer * 0.55)
      desiredLook.copy(car.pos).addScaledVector(forward, 9 + speedF * 11).add(new THREE.Vector3(0, 1.05, 0))
    }
    desiredPos.x += sx
    desiredPos.y += sy
    desiredLook.x += sx * 0.6
    desiredLook.y += sy * 0.6

    if (!this.cameraInitialized) {
      this.camera.position.copy(desiredPos)
      this.cameraLook.copy(desiredLook)
      this.cameraInitialized = true
    } else {
      const lambda = this.cameraMode === 'hood' ? 18 : 6.5
      this.camera.position.x = damp(this.camera.position.x, desiredPos.x, lambda, dt)
      this.camera.position.y = damp(this.camera.position.y, desiredPos.y, lambda, dt)
      this.camera.position.z = damp(this.camera.position.z, desiredPos.z, lambda, dt)
      this.cameraLook.x = damp(this.cameraLook.x, desiredLook.x, 9, dt)
      this.cameraLook.y = damp(this.cameraLook.y, desiredLook.y, 9, dt)
      this.cameraLook.z = damp(this.cameraLook.z, desiredLook.z, 9, dt)
    }
    this.camera.lookAt(this.cameraLook)
    const targetFov = this.cameraMode === 'hood' ? 74 : this.cameraMode === 'far' ? 55 : 62 + speedF * 15 + (this.player.nitroActive ? 4 : 0)
    this.camera.fov = damp(this.camera.fov, targetFov, 4, dt)
    this.camera.updateProjectionMatrix()
  }

  _updateHUD(dt) {
    const car = this.player
    if (!car) return
    const speedKmh = Math.round(Math.abs(car.speed) * 3.6)
    const lap = clamp(Math.max(car.lap, 1), 1, this.laps)
    const gear = Math.min(7, 1 + Math.floor(Math.abs(car.speed) / 13))

    this.dom.lap.textContent = lap
    this.dom.lapTotal.textContent = this.laps
    this.dom.pos.textContent = car.place
    this.dom.clock.textContent = formatTime(this.raceElapsed)
    this.dom.best.textContent = formatTime(car.bestLap)
    this.dom.last.textContent = formatTime(car.lastLap)
    this.dom.speed.textContent = speedKmh
    this.dom.gear.textContent = gear
    const dash = clamp(speedKmh / 360, 0, 1) * 415
    this.dom.arc.style.strokeDasharray = `${dash} 553`
    this.dom.nitro.style.width = `${Math.round(car.nitro * 100)}%`
    this.dom.nitroPct.textContent = `${Math.round(car.nitro * 100)}%`
    this.dom.wrongway.classList.toggle('show', this.state === 'racing' && car.wrongWay)
  }

  _drawMinimap() {
    const ctx = this.minimapCtx
    const w = this.dom.minimap.width
    const h = this.dom.minimap.height
    if (!this._mapBounds) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
      for (const s of this.track.samples) {
        minX = Math.min(minX, s.point.x)
        maxX = Math.max(maxX, s.point.x)
        minZ = Math.min(minZ, s.point.z)
        maxZ = Math.max(maxZ, s.point.z)
      }
      const pad = 22
      const scale = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxZ - minZ))
      const ox = (w - (maxX - minX) * scale) / 2 - minX * scale
      const oz = (h - (maxZ - minZ) * scale) / 2 - minZ * scale
      this._mapBounds = { scale, ox, oz }
    }
    const { scale, ox, oz } = this._mapBounds
    const map = (x, z) => [x * scale + ox, z * scale + oz]

    ctx.clearRect(0, 0, w, h)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let i = 0; i <= this.track.segments; i += 6) {
      const s = this.track.samples[i % this.track.segments]
      const [x, y] = map(s.point.x, s.point.z)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.strokeStyle = 'rgba(18, 34, 55, 0.95)'
    ctx.lineWidth = 10
    ctx.stroke()
    ctx.strokeStyle = 'rgba(74, 130, 180, 0.85)'
    ctx.lineWidth = 4
    ctx.stroke()

    const start = this.track.samples[0].point
    const [sx, sy] = map(start.x, start.z)
    ctx.fillStyle = '#f2f8ff'
    ctx.beginPath()
    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2)
    ctx.fill()

    for (const car of this.cars) {
      if (car.isPlayer) continue
      const [x, y] = map(car.pos.x, car.pos.z)
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fillStyle = colorCss(car.config.paint)
      ctx.fill()
    }

    const [px, py] = map(this.player.pos.x, this.player.pos.z)
    const angle = this.player.heading
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(-angle + Math.PI)
    ctx.beginPath()
    ctx.moveTo(0, -6)
    ctx.lineTo(4.5, 5)
    ctx.lineTo(0, 2.5)
    ctx.lineTo(-4.5, 5)
    ctx.closePath()
    ctx.fillStyle = '#19e3ff'
    ctx.shadowColor = '#19e3ff'
    ctx.shadowBlur = 10
    ctx.fill()
    ctx.restore()
  }

  _animate(now) {
    requestAnimationFrame(this._animate)
    const raw = (now - this.last) / 1000
    this.last = now
    const dt = clamp(raw, 0, 0.05)
    this.time += dt

    if (this.state === 'menu' || this.state === 'loading') {
      this._updateCamera(dt)
    } else if (this.state === 'paused') {
      // hold frame
    } else {
      this.accum += dt
      let steps = 0
      while (this.accum >= this.step && steps < 10) {
        this._simulate(this.step)
        this.accum -= this.step
        steps++
      }
      if (steps === 10) this.accum = 0
      this._updateCamera(dt)
      this._emitEffects(dt)
    }

    this.particles.update(dt)
    if (this.state === 'menu' || this.state === 'countdown' || this.state === 'racing' ||
      this.state === 'finished' || this.state === 'paused') {
      this.world.update(dt, this.player.pos)
    }

    if (this.gradePass) this.gradePass.uniforms.time.value = this.time
    if (this.state !== 'menu') {
      this._updateHUD(dt)
      this.minimapTime += dt
      if (this.minimapTime > 0.08) {
        this.minimapTime = 0
        this._drawMinimap()
      }
    }

    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)

    this._updateFps(raw)
  }

  _emitEffects(dt) {
    if (this.state !== 'racing') return
    const car = this.player
    const speed = Math.abs(car.speed)
    if (speed < 6) return
    const wheels = car.rearWheelWorld()
    const drifting = car.drifting || ((car.offroad && speed > 9))
    if (!drifting) return
    this.smokeTime += dt
    this.skidTime += dt
    if (this.smokeTime > 0.018) {
      this.smokeTime = 0
      const intensity = clamp(speed / 60, 0.4, 1.4)
      for (const wheel of wheels) this.particles.emitDrift(wheel, intensity, car.offroad)
    }
    if (!car.offroad && this.skidTime > 0.028) {
      this.skidTime = 0
      for (const wheel of wheels) this.skids.add(wheel.pos.x, wheel.pos.z, car.heading, 0.3, 0.85)
    }
  }

  _updateFps(raw) {
    this.fpsFrames++
    this.fpsTime += raw
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime)
      this.fpsFrames = 0
      this.fpsTime = 0
      this.dom.fps.textContent = this.fps
      const target = 120
      if (this.state === 'racing') {
        if (this.fps < target * 0.78) {
          this.lowFpsTime += 0.5
          if (this.lowFpsTime >= 2 && this.renderer.getPixelRatio() > 0.85) {
            this.lowFpsTime = 0
            const pr = Math.max(0.8, this.renderer.getPixelRatio() - 0.2)
            this.renderer.setPixelRatio(pr)
            if (this.composer) this.composer.setPixelRatio(pr)
            this._onResize()
          }
        } else {
          this.lowFpsTime = 0
        }
      }
    }
  }
}
