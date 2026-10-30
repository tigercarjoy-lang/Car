import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { clamp, damp, makeCanvas, glowCanvas, canvasTexture, angleDiff, mod } from './utils.js'

const numberCache = new Map()

function numberTexture(number) {
  if (numberCache.has(number)) return numberCache.get(number)
  const canvas = makeCanvas(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, 54, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(245,250,255,0.94)'
    ctx.fill()
    ctx.lineWidth = 6
    ctx.strokeStyle = '#0b1018'
    ctx.stroke()
    ctx.fillStyle = '#0b1018'
    ctx.font = '900 66px Orbitron, Arial Black, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(number), w / 2, h / 2 + 4)
  })
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  numberCache.set(number, tex)
  return tex
}

export class CarModel {
  constructor(config, { isPlayer = false, number = 7, quality } = {}) {
    this.config = config
    this.isPlayer = isPlayer
    this.number = number
    this.root = new THREE.Group()
    this.chassis = new THREE.Group()
    this.root.add(this.chassis)
    this.wheels = []
    this.flames = []
    this.brakeLightMats = []
    this.time = 0
    this._build(quality)
    this.root.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
  }

  _build(quality) {
    const cfg = this.config
    const paint = new THREE.MeshPhysicalMaterial({
      color: cfg.paint,
      metalness: 0.65,
      roughness: 0.36,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.05
    })
    const carbon = new THREE.MeshStandardMaterial({ color: 0x0a0d13, roughness: 0.52, metalness: 0.5 })
    const glass = new THREE.MeshPhysicalMaterial({
      color: cfg.glass || 0x0a1622,
      metalness: 0.9,
      roughness: 0.09,
      envMapIntensity: 1.5,
      clearcoat: 1,
      clearcoatRoughness: 0.04
    })
    const trim = new THREE.MeshStandardMaterial({ color: 0x11151d, roughness: 0.55, metalness: 0.5 })
    const matte = new THREE.MeshStandardMaterial({ color: 0x0a0c11, roughness: 0.82, metalness: 0.18 })
    const accent = new THREE.MeshStandardMaterial({
      color: 0x05080d, emissive: cfg.accent, emissiveIntensity: 0.95, roughness: 0.35
    })

    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(x, y, z)
      mesh.rotation.set(rx, ry, rz)
      this.chassis.add(mesh)
      return mesh
    }

    add(new RoundedBoxGeometry(1.86, 0.34, 4.25, 3, 0.14), carbon, 0, 0.36, 0)
    add(new RoundedBoxGeometry(1.96, 0.5, 4.2, 5, 0.2), paint, 0, 0.66, 0)
    add(new RoundedBoxGeometry(1.8, 0.32, 1.5, 4, 0.14), paint, 0, 0.74, 1.52, -0.09)
    add(new RoundedBoxGeometry(1.9, 0.4, 1.35, 4, 0.16), paint, 0, 0.76, -1.55, 0.04)
    add(new RoundedBoxGeometry(1.5, 0.52, 1.9, 4, 0.18), glass, 0, 1.04, -0.15)
    add(new RoundedBoxGeometry(1.34, 0.08, 1.55, 3, 0.03), paint, 0, 1.31, -0.2)

    add(new THREE.BoxGeometry(2.02, 0.09, 0.68), carbon, 0, 0.3, 2.02)
    add(new THREE.BoxGeometry(1.92, 0.16, 0.58), carbon, 0, 0.32, -2.04)
    add(new THREE.BoxGeometry(0.17, 0.18, 2.65), carbon, 0.97, 0.35, 0)
    add(new THREE.BoxGeometry(0.17, 0.18, 2.65), carbon, -0.97, 0.35, 0)
    add(new THREE.BoxGeometry(0.72, 0.09, 0.55), carbon, 0, 0.92, 1.08)

    add(new THREE.BoxGeometry(1.8, 0.06, 0.44), carbon, 0, 1.18, -1.98)
    add(new THREE.BoxGeometry(0.07, 0.34, 0.22), carbon, 0.72, 1.0, -1.95)
    add(new THREE.BoxGeometry(0.07, 0.34, 0.22), carbon, -0.72, 1.0, -1.95)
    add(new THREE.BoxGeometry(0.05, 0.3, 0.4), matte, 0.92, 1.06, -1.98)
    add(new THREE.BoxGeometry(0.05, 0.3, 0.4), matte, -0.92, 1.06, -1.98)
    add(new THREE.BoxGeometry(0.06, 0.03, 0.32), accent, 0.925, 1.205, -1.98)
    add(new THREE.BoxGeometry(0.06, 0.03, 0.32), accent, -0.925, 1.205, -1.98)
    for (const x of [-0.62, -0.31, 0, 0.31, 0.62]) {
      add(new THREE.BoxGeometry(0.06, 0.2, 0.5), carbon, x, 0.24, -2.08)
    }
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(0.38, 0.05, 0.22), carbon, side * 0.88, 0.54, 1.95, 0, side * 0.12, side * 0.08)
      add(new THREE.BoxGeometry(0.02, 0.26, 0.66), carbon, side * 0.986, 0.66, -0.55)
    }

    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(0.16, 0.1, 0.34), trim, side * 1.02, 1.03, 0.5)
      add(new THREE.BoxGeometry(0.06, 0.18, 0.24), trim, side * 0.94, 1.0, 0.55)
      add(new THREE.BoxGeometry(0.05, 0.32, 0.95), carbon, side * 0.98, 0.5, -0.2)
    }

    const headMat = new THREE.MeshStandardMaterial({
      color: 0x0a1018, emissive: 0xdff4ff, emissiveIntensity: 1.75, roughness: 0.25
    })
    const headGeo = new THREE.BoxGeometry(0.46, 0.1, 0.08)
    add(headGeo, headMat, 0.62, 0.78, 2.29, 0, -0.12)
    add(headGeo, headMat, -0.62, 0.78, 2.29, 0, 0.12)
    add(new THREE.BoxGeometry(0.16, 0.05, 0.1), accent, 0.86, 0.7, 2.29)
    add(new THREE.BoxGeometry(0.16, 0.05, 0.1), accent, -0.86, 0.7, 2.29)

    const tailMat = new THREE.MeshStandardMaterial({
      color: 0x160204, emissive: 0xff1a35, emissiveIntensity: 1.65, roughness: 0.3
    })
    this.brakeLightMats.push(tailMat)
    add(new THREE.BoxGeometry(1.58, 0.09, 0.07), tailMat, 0, 0.83, -2.3)
    add(new THREE.BoxGeometry(0.34, 0.09, 0.07), tailMat, 0.8, 0.83, -2.29)
    add(new THREE.BoxGeometry(0.34, 0.09, 0.07), tailMat, -0.8, 0.83, -2.29)
    add(new THREE.BoxGeometry(0.5, 0.05, 0.06), tailMat, 0, 0.63, -2.29)

    const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, metalness: 1, roughness: 0.25 })
    for (const side of [-1, 1]) {
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.22, 12), exhaustMat)
      ex.rotation.x = Math.PI / 2
      ex.position.set(side * 0.42, 0.45, -2.16)
      this.chassis.add(ex)

      const flameMat = new THREE.MeshBasicMaterial({
        color: cfg.accent, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false
      })
      const flameGeo = new THREE.ConeGeometry(0.13, 0.9, 8, 1, true)
      flameGeo.rotateX(-Math.PI / 2)
      flameGeo.translate(0, 0, -0.45)
      const flame = new THREE.Mesh(flameGeo, flameMat)
      flame.position.set(side * 0.42, 0.45, -2.22)
      flame.visible = false
      this.chassis.add(flame)
      this.flames.push(flame)
    }

    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0d, roughness: 0.92, metalness: 0.02 })
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x9aa6b8, metalness: 1, roughness: 0.32 })
    const brakeMat = new THREE.MeshStandardMaterial({
      color: 0x1a0c0c, emissive: cfg.accent, emissiveIntensity: 0.7, metalness: 0.6, roughness: 0.4
    })

    const tireGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 26)
    tireGeo.rotateZ(Math.PI / 2)
    const rimGeo = new THREE.CylinderGeometry(0.235, 0.235, 0.34, 18)
    rimGeo.rotateZ(Math.PI / 2)
    const spokeGeo = new THREE.BoxGeometry(0.36, 0.07, 0.44)
    const discGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.36, 18)
    discGeo.rotateZ(Math.PI / 2)

    const wheelPositions = [
      [0.96, 0.38, 1.44, true],
      [-0.96, 0.38, 1.44, true],
      [0.98, 0.4, -1.44, false],
      [-0.98, 0.4, -1.44, false]
    ]
    for (const [x, y, z, front] of wheelPositions) {
      const pivot = new THREE.Group()
      pivot.position.set(x, y, z)
      this.chassis.add(pivot)
      const spin = new THREE.Group()
      pivot.add(spin)

      const tire = new THREE.Mesh(tireGeo, tireMat)
      tire.castShadow = true
      spin.add(tire)

      const rim = new THREE.Mesh(rimGeo, rimMat)
      spin.add(rim)
      const disc = new THREE.Mesh(discGeo, brakeMat)
      spin.add(disc)
      for (let i = 0; i < 6; i++) {
        const spoke = new THREE.Mesh(spokeGeo, rimMat)
        spoke.rotation.x = (i / 6) * Math.PI
        spin.add(spoke)
      }
      const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.14), brakeMat)
      caliper.position.set(x > 0 ? 0.02 : -0.02, 0, 0)
      pivot.add(caliper)

      this.wheels.push({ pivot, spin, front, radius: 0.38 })
    }

    const glowTex = canvasTexture(glowCanvas(`${((cfg.accent >> 16) & 255)},${((cfg.accent >> 8) & 255)},${cfg.accent & 255}`), { repeat: [1, 1] })
    const glowGeo = new THREE.PlaneGeometry(4.2, 6.4)
    glowGeo.rotateX(-Math.PI / 2)
    const glowMat = new THREE.MeshBasicMaterial({
      map: glowTex, transparent: true, opacity: 0.27, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false
    })
    const glow = new THREE.Mesh(glowGeo, glowMat)
    glow.position.y = 0.02
    this.root.add(glow)
    this.glow = glow

    if (this.isPlayer && quality?.headlights) {
      const spot = new THREE.SpotLight(0xe6f6ff, 26, 48, 0.52, 0.55, 1.4)
      spot.position.set(0, 0.85, 2.0)
      spot.target.position.set(0, 0.1, 18)
      this.chassis.add(spot, spot.target)
    }

    const numTex = numberTexture(this.number)
    const decalMat = new THREE.MeshBasicMaterial({ map: numTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    this.decalMaterial = decalMat
    for (const side of [-1, 1]) {
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.58), decalMat)
      decal.position.set(side * 0.985, 0.78, -0.25)
      decal.rotation.y = side * Math.PI / 2
      this.chassis.add(decal)
    }

    this.paintMaterial = paint
    this.accentMaterial = accent
  }

  setNumber(n) {
    if (!this.decalMaterial) return
    this.decalMaterial.map = numberTexture(n)
    this.decalMaterial.needsUpdate = true
  }

  updateVisual(dt, speed, steer, yaw, longAccel, nitroActive, brake, time) {
    this.time = time
    this.wheels.forEach(w => {
      w.spin.rotation.x -= (speed / w.radius) * dt
      if (w.front) w.pivot.rotation.y = steer * 0.46
    })
    const targetRoll = clamp(-yaw * speed * 0.0075, -0.12, 0.12)
    const targetPitch = clamp(-longAccel * 0.0032, -0.07, 0.07)
    this.chassis.rotation.z = damp(this.chassis.rotation.z, targetRoll, 7, dt)
    this.chassis.rotation.x = damp(this.chassis.rotation.x, targetPitch, 7, dt)
    this.chassis.position.y = damp(this.chassis.position.y, Math.sin(time * 9) * 0.004 * clamp(speed / 40, 0, 1), 5, dt)

    const flicker = 0.75 + Math.sin(time * 55) * 0.25 + Math.random() * 0.2
    this.flames.forEach(f => {
      f.visible = nitroActive
      f.material.opacity = nitroActive ? 0.75 * flicker : 0
      f.scale.set(1, 1, 0.7 + flicker * 0.6)
    })
    if (this.glow) this.glow.material.opacity = 0.26 + Math.sin(time * 6) * 0.06

    const brakeGlow = brake > 0.35 || nitroActive ? 5.2 : 2.0
    this.brakeLightMats.forEach(m => { m.emissiveIntensity = brakeGlow })
  }

  dispose() {
    this.root.traverse(o => {
      if (o.isMesh) {
        o.geometry?.dispose()
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose())
        else o.material?.dispose()
      }
    })
  }
}

export class CarEntity {
  constructor({ track, config, model, isPlayer = false, name = '' }) {
    this.track = track
    this.config = config
    this.model = model
    this.isPlayer = isPlayer
    this.name = name
    this.pos = new THREE.Vector3()
    this.velocity = new THREE.Vector3()
    this.heading = 0
    this.steer = 0
    this.speed = 0
    this.prevSpeed = 0
    this.longAccel = 0
    this.yawRate = 0
    this.wheelSpin = 0
    this.nitro = 1
    this.nitroActive = false
    this.offroad = false
    this.drifting = false
    this.lap = 0
    this.t = 0
    this.prevT = 0
    this.index = -1
    this.finished = false
    this.finishTime = 0
    this.lapStart = 0
    this.bestLap = Infinity
    this.lastLap = 0
    this.place = 6
    this.raceLaps = 3
    this.wrongWay = false
    this._forward = new THREE.Vector3()
    this._right = new THREE.Vector3()
  }

  reset(pose) {
    this.pos.copy(pose.pos)
    this.velocity.set(0, 0, 0)
    this.heading = pose.heading
    this.steer = 0
    this.speed = 0
    this.prevSpeed = 0
    this.longAccel = 0
    this.yawRate = 0
    this.wheelSpin = 0
    this.nitro = 1
    this.nitroActive = false
    this.lap = 0
    this.t = pose.t
    this.prevT = pose.t
    this.index = -1
    this.finished = false
    this.finishTime = 0
    this.lapStart = 0
    this.bestLap = Infinity
    this.lastLap = 0
    this.wrongWay = false
    this._syncModel(0, 0)
  }

  get totalProgress() {
    return this.lap + this.t
  }

  update(dt, input, raceActive) {
    if (this.finished) {
      input = { throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false }
    }
    const active = raceActive && !this.finished
    const throttle = active ? input.throttle : 0
    const brake = active ? input.brake : 0
    const steerInput = active ? input.steer : 0
    const handbrake = active ? input.handbrake : false
    const wantsNitro = active && input.nitro && this.nitro > 0.02

    this.nitroActive = wantsNitro
    if (wantsNitro) this.nitro = Math.max(0, this.nitro - dt * 0.16)
    else this.nitro = Math.min(1, this.nitro + dt * 0.028)

    const forward = this._forward.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    const right = this._right.set(Math.cos(this.heading), 0, -Math.sin(this.heading))
    let speedForward = this.velocity.dot(forward)
    const maxSpeed = this.config.topSpeed * (this.nitroActive ? 1.13 : 1)
    const engine = this.config.accel * (this.nitroActive ? 1.5 : 1)

    if (throttle > 0) {
      const ratio = clamp(speedForward / maxSpeed, 0, 1)
      this.velocity.addScaledVector(forward, engine * throttle * (1 - ratio * 0.6) * dt)
    }
    if (brake > 0) {
      if (speedForward > 0.6) this.velocity.addScaledVector(forward, -this.config.accel * 2.1 * brake * dt)
      else if (speedForward > -14) this.velocity.addScaledVector(forward, -this.config.accel * 0.5 * brake * dt)
    }

    if (this.offroad) this.velocity.multiplyScalar(1 - 1.35 * dt)

    speedForward = this.velocity.dot(forward)
    const speedAbs = this.velocity.length()
    this.steer = damp(this.steer, steerInput, 10, dt)
    const speedFactor = clamp(Math.abs(speedForward) / 5.5, 0, 1)
    const steerLimit = 1 / (1 + speedAbs * 0.026)
    const yaw = this.steer * 1.72 * this.config.handling * speedFactor * steerLimit * Math.sign(speedForward || 1)
    let extraYaw = 0
    if (handbrake && Math.abs(speedForward) > 6) extraYaw = this.steer * 0.9 * speedFactor
    this.heading += (yaw + extraYaw) * dt
    this.yawRate = yaw + extraYaw

    const lateral = this.velocity.dot(right)
    const grip = this.config.grip * (handbrake ? 0.15 : 1) * (this.offroad ? 0.36 : 1)
    const lateralRemoval = 1 - Math.exp(-grip * dt)
    this.velocity.addScaledVector(right, -lateral * lateralRemoval)
    this.drifting = Math.abs(lateral) > 3.2 && Math.abs(speedForward) > 9

    const drag = 0.32 + 0.00105 * speedForward * speedForward
    if (speedForward > 0) this.velocity.addScaledVector(forward, -Math.min(drag, speedForward / dt) * dt)

    const currentMax = this.config.topSpeed * (this.nitroActive ? 1.13 : 1)
    if (this.velocity.length() > currentMax) this.velocity.setLength(currentMax)

    this.pos.addScaledVector(this.velocity, dt)
    this.pos.y = 0

    const prog = this.track.getProgress(this.pos, this.index)
    this.index = prog.index
    this.t = prog.t
    const absOffset = Math.abs(prog.offset)
    this.offroad = absOffset > this.track.halfWidth + 0.9

    if (absOffset > this.track.barrierOffset - 0.75) {
      const sign = Math.sign(prog.offset)
      const excess = absOffset - (this.track.barrierOffset - 0.75)
      this.pos.addScaledVector(prog.side, -sign * excess)
      const vlat = this.velocity.dot(prog.side)
      if (vlat * sign > 0) this.velocity.addScaledVector(prog.side, -vlat * 1.55)
      this.velocity.multiplyScalar(0.93)
    }

    this.prevSpeed = this.speed
    this.speed = this.velocity.dot(forward)
    this.longAccel = (this.speed - this.prevSpeed) / Math.max(dt, 0.0001)

    if (raceActive && !this.finished) {
      if (this.prevT > 0.8 && this.t < 0.2) this.lap++
      else if (this.prevT < 0.2 && this.t > 0.8) this.lap--
      this.prevT = this.t
      if (this.lap >= this.raceLaps + 1) {
        this.finished = true
      }
    }

    const tangentHeading = prog.heading
    this.wrongWay = Math.abs(angleDiff(this.heading, tangentHeading)) > Math.PI * 0.62 && this.speed > 3

    this._syncModel(dt, brake)
    return { prog, speedForward: this.speed }
  }

  _syncModel(dt, brake) {
    this.model.root.position.copy(this.pos)
    this.model.root.rotation.y = this.heading
    this.model.updateVisual(
      dt,
      Math.abs(this.speed),
      this.steer,
      this.yawRate,
      this.longAccel,
      this.nitroActive,
      brake,
      performance.now() / 1000
    )
  }

  rearWheelWorld() {
    const out = []
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading))
    const side = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading))
    for (const offset of [-1.02, 1.02]) {
      out.push({ pos: this.pos.clone().addScaledVector(fwd, -1.44).addScaledVector(side, offset), side })
    }
    return out
  }

  resetToTrack() {
    const prog = this.track.getProgress(this.pos, -1)
    this.pos.copy(prog.point).setY(0)
    this.heading = prog.heading
    this.velocity.set(0, 0, 0)
    this.speed = 0
    this.index = prog.index
    this.t = prog.t
    this.prevT = prog.t
    this._syncModel(0, 0)
  }
}

export class AIDriver {
  constructor(entity, skill, seed) {
    this.entity = entity
    this.track = entity.track
    this.skill = skill
    this.seed = seed
    this.time = 0
    this.lane = Math.sin(seed * 12.3) * 2.0
    this.nitroTimer = 0
  }

  update(dt, cars, raceActive, time) {
    const e = this.entity
    this.time = time
    const lookahead = (13 + Math.abs(e.speed) * 0.38) / this.track.length
    const tAhead = mod(e.t + lookahead, 1)
    const center = this.track.pointAt(tAhead)
    const side = this.track.sideAt(tAhead)
    const laneWobble = Math.sin(time * 0.35 + this.seed * 9) * 0.9
    const target = center.clone().addScaledVector(side, this.lane + laneWobble)

    let steer = clamp(angleDiff(Math.atan2(target.x - e.pos.x, target.z - e.pos.z), e.heading) * 2.3, -1, 1)

    let throttle = 1
    let brake = 0
    const limit = this.track.speedLimitAt(tAhead) * (0.9 + this.skill * 0.1)
    const speed = Math.abs(e.speed)
    if (speed > limit * 1.04) {
      throttle = 0
      brake = clamp((speed - limit) / 12, 0.15, 1)
    } else if (speed > limit * 0.92) {
      throttle = 0.25
    }

    let nitro = false
    this.nitroTimer += dt
    if (limit > 68 && e.nitro > 0.35 && Math.sin(time * 0.9 + this.seed * 7) > 0.55) nitro = true

    for (const other of cars) {
      if (other === e) continue
      const dx = other.pos.x - e.pos.x
      const dz = other.pos.z - e.pos.z
      const dist = Math.hypot(dx, dz)
      if (dist > 11 || dist < 0.001) continue
      const fx = Math.sin(e.heading), fz = Math.cos(e.heading)
      const ahead = (dx * fx + dz * fz) / dist
      if (ahead > 0.45) {
        const sideDot = dx * Math.cos(e.heading) - dz * Math.sin(e.heading)
        steer -= Math.sign(sideDot) * (1 - dist / 11) * 0.85
        if (dist < 5.5) { throttle *= 0.45; brake = Math.max(brake, 0.25) }
      }
    }

    e.update(dt, {
      throttle,
      brake,
      steer: clamp(steer, -1, 1),
      handbrake: false,
      nitro
    }, raceActive)
  }
}
