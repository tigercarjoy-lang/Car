import * as THREE from 'three'
import {
  asphaltCanvas, canvasTexture, checkerCanvas, curbCanvas, grassCanvas,
  signCanvas, windowCanvas, clamp, mod, mulberry32
} from './utils.js'

const TRACK_POINTS = [
  [-60, -160], [40, -155], [140, -140], [200, -100], [215, -30],
  [205, 40], [170, 90], [120, 110], [100, 160], [50, 190],
  [-20, 195], [-90, 185], [-140, 160], [-180, 120], [-205, 60],
  [-215, -10], [-205, -80], [-180, -130], [-140, -152]
]

export class Track {
  constructor(scene, renderer, quality) {
    this.scene = scene
    this.renderer = renderer
    this.quality = quality
    this.width = 15
    this.halfWidth = this.width / 2
    this.barrierOffset = this.halfWidth + 3.4
    this.segments = 720

    this.curve = new THREE.CatmullRomCurve3(
      TRACK_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      'catmullrom',
      0.5
    )
    this.curve.arcLengthDivisions = 4000
    this.length = this.curve.getLength()
    this.samples = []
    this._buildSamples()
    this._buildSpeedProfile()
    this._buildMeshes()
    this._buildBarriers()
    this._buildGantry()
    this._buildStands()
    this._buildBillboards()
    this._buildFloodlights()
  }

  _buildSamples() {
    const pts = this.curve.getSpacedPoints(this.segments)
    for (let i = 0; i < this.segments; i++) {
      const t = i / this.segments
      const point = pts[i]
      const tangent = this.curve.getTangentAt(t).setY(0).normalize()
      const side = new THREE.Vector3(tangent.z, 0, -tangent.x)
      this.samples.push({ point, tangent, side, t })
    }
  }

  _buildSpeedProfile() {
    const n = this.segments
    const spacing = this.length / n
    const curvature = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const a = this.samples[i].tangent
      const b = this.samples[(i + 4) % n].tangent
      const angle = Math.acos(clamp(a.dot(b), -1, 1))
      curvature[i] = angle / (spacing * 4)
    }
    const profile = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      let maxCurv = 0
      for (let k = 0; k < 34; k++) maxCurv = Math.max(maxCurv, curvature[(i + k) % n])
      const radius = 1 / Math.max(maxCurv, 0.00018)
      const limit = Math.sqrt(23 * radius)
      profile[i] = clamp(limit, 26, 96)
    }
    for (let pass = 0; pass < 30; pass++) {
      for (let i = 0; i < n; i++) {
        const next = profile[(i + 1) % n]
        profile[i] = Math.min(profile[i], Math.sqrt(next * next + 2 * 20 * spacing))
      }
    }
    this.curvature = curvature
    this.speedProfile = profile
    this.profileSpacing = spacing
  }

  pointAt(t) { return this.curve.getPointAt(mod(t, 1)) }
  tangentAt(t) { return this.curve.getTangentAt(mod(t, 1)).setY(0).normalize() }
  headingAt(t) {
    const tan = this.tangentAt(t)
    return Math.atan2(tan.x, tan.z)
  }
  sideAt(t) { const tan = this.tangentAt(t); return new THREE.Vector3(tan.z, 0, -tan.x) }

  speedLimitAt(t) {
    const i = Math.floor(mod(t, 1) * this.segments) % this.segments
    return this.speedProfile[i]
  }

  _ribbon({ offset = 0, width = 2, y = 0.02, uRepeat = 1, vRepeat = 1, material, receiveShadow = true }) {
    const n = this.segments
    const positions = []
    const uvs = []
    const indices = []
    const half = width / 2
    for (let i = 0; i <= n; i++) {
      const s = this.samples[i % n]
      const cx = s.point.x + s.side.x * offset
      const cz = s.point.z + s.side.z * offset
      positions.push(cx - s.side.x * half, y, cz - s.side.z * half)
      positions.push(cx + s.side.x * half, y, cz + s.side.z * half)
      const v = (i / n) * vRepeat
      uvs.push(0, v, uRepeat, v)
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3
      indices.push(a, c, b, b, c, d)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, material)
    mesh.receiveShadow = receiveShadow
    this.scene.add(mesh)
    return mesh
  }

  _buildMeshes() {
    const asphalt = canvasTexture(asphaltCanvas(), { repeat: [1, 1] })
    asphalt.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())

    const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: 0.96, metalness: 0.02 })
    this._ribbon({ width: this.width + 6.4, y: -0.02, material: shoulderMat, receiveShadow: true })

    const roadMat = new THREE.MeshStandardMaterial({
      map: asphalt, color: 0xdbe2ee, roughness: 0.86, metalness: 0.05
    })
    this._ribbon({ width: this.width, y: 0, uRepeat: 2, vRepeat: this.length / 9, material: roadMat })

    const lineMat = new THREE.MeshStandardMaterial({ color: 0xe8f0ff, roughness: 0.5, metalness: 0.05, emissive: 0x1b2a3a, emissiveIntensity: 0.35 })
    this._ribbon({ offset: this.halfWidth - 0.38, width: 0.16, y: 0.025, material: lineMat })
    this._ribbon({ offset: -this.halfWidth + 0.38, width: 0.16, y: 0.025, material: lineMat })

    const curbTex = canvasTexture(curbCanvas(), { repeat: [1, 1], anisotropy: 8 })
    const curbMat = new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.62, metalness: 0.02 })
    this._ribbon({ offset: this.halfWidth + 0.62, width: 1.3, y: 0.03, vRepeat: this.length / 4, material: curbMat })
    this._ribbon({ offset: -this.halfWidth - 0.62, width: 1.3, y: 0.03, vRepeat: this.length / 4, material: curbMat })

    const start = this.samples[0]
    const startTex = canvasTexture(checkerCanvas(), { repeat: [1, 1] })
    const startMat = new THREE.MeshStandardMaterial({ map: startTex, roughness: 0.55, metalness: 0.05 })
    const lineGeo = new THREE.PlaneGeometry(this.width - 0.5, 2.6)
    lineGeo.rotateX(-Math.PI / 2)
    const startLine = new THREE.Mesh(lineGeo, startMat)
    startLine.position.copy(start.point).setY(0.035)
    startLine.rotation.y = Math.atan2(start.tangent.x, start.tangent.z)
    startLine.receiveShadow = true
    this.scene.add(startLine)

    const gridTex = canvasTexture(checkerCanvas(), { repeat: [1, 1] })
    const gridMat = new THREE.MeshStandardMaterial({ map: gridTex, roughness: 0.7 })
    const gridGeo = new THREE.PlaneGeometry(this.width - 2.4, 1.1)
    gridGeo.rotateX(-Math.PI / 2)
    const gridLine = new THREE.Mesh(gridGeo, gridMat)
    gridLine.position.copy(this.pointAt(-5 / this.length)).setY(0.03)
    gridLine.rotation.y = this.headingAt(-5 / this.length)
    this.scene.add(gridLine)
  }

  _buildBarriers() {
    const count = Math.floor(this.length / 4.6)
    const spacing = this.length / count
    const bodyGeo = new THREE.BoxGeometry(0.42, 0.92, spacing * 0.98)
    const railGeo = new THREE.BoxGeometry(0.16, 0.12, spacing * 0.98)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.16 })
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x0a1520, emissive: 0x27d8ff, emissiveIntensity: 1.55, roughness: 0.4
    })
    const body = new THREE.InstancedMesh(bodyGeo, bodyMat, count * 2)
    const rail = new THREE.InstancedMesh(railGeo, railMat, count * 2)
    body.castShadow = true
    body.receiveShadow = true
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    const n = this.segments
    let k = 0
    for (let i = 0; i < count; i++) {
      const t = (i * spacing) / this.length
      const idx = Math.floor(t * n) % n
      const s = this.samples[idx]
      const heading = Math.atan2(s.tangent.x, s.tangent.z)
      for (const sign of [1, -1]) {
        const px = s.point.x + s.side.x * this.barrierOffset * sign
        const pz = s.point.z + s.side.z * this.barrierOffset * sign
        dummy.position.set(px, 0.46, pz)
        dummy.rotation.set(0, heading, 0)
        dummy.updateMatrix()
        body.setMatrixAt(k, dummy.matrix)
        color.setHex(i % 2 === 0 ? 0xeef4ff : 0xe0283f)
        body.setColorAt(k, color)
        dummy.position.y = 0.98
        dummy.updateMatrix()
        rail.setMatrixAt(k, dummy.matrix)
        rail.setColorAt(k, color.setHex(i % 2 === 0 ? 0x2ce4ff : 0xff2f7d))
        k++
      }
    }
    body.instanceMatrix.needsUpdate = true
    rail.instanceMatrix.needsUpdate = true
    if (body.instanceColor) body.instanceColor.needsUpdate = true
    if (rail.instanceColor) rail.instanceColor.needsUpdate = true
    this.scene.add(body, rail)
  }

  _buildGantry() {
    const s = this.samples[0]
    const heading = Math.atan2(s.tangent.x, s.tangent.z)
    const group = new THREE.Group()
    group.position.copy(s.point)
    group.rotation.y = heading
    this.scene.add(group)

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: 0.5, metalness: 0.7 })
    const pillarGeo = new THREE.BoxGeometry(0.8, 9, 0.8)
    for (const sign of [1, -1]) {
      const p = new THREE.Mesh(pillarGeo, pillarMat)
      p.position.set(sign * (this.halfWidth + 2.3), 4.5, 0)
      p.castShadow = true
      group.add(p)
      const foot = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.6), pillarMat)
      foot.position.set(sign * (this.halfWidth + 2.3), 0.2, 0)
      group.add(foot)
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(this.width + 6, 0.65, 0.9), pillarMat)
    beam.position.y = 8.9
    beam.castShadow = true
    group.add(beam)

    const signTex = canvasTexture(signCanvas('APEX RUSH', 'NEON COAST', '#19e3ff', '#060a13'), { repeat: [1, 1] })
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 1.35, roughness: 0.45
    })
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(15.5, 3.9), signMat)
    sign.position.set(0, 7.1, -0.22)
    sign.rotation.y = Math.PI
    group.add(sign)

    const backMat = new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.7, metalness: 0.4 })
    const back = new THREE.Mesh(new THREE.BoxGeometry(15.8, 4.1, 0.25), backMat)
    back.position.set(0, 7.1, -0.04)
    group.add(back)

    this.startLights = []
    const lightGeo = new THREE.SphereGeometry(0.27, 16, 12)
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x200305, emissive: 0xff1c30, emissiveIntensity: 0.08, roughness: 0.3
      })
      const light = new THREE.Mesh(lightGeo, mat)
      light.position.set((i - 2) * 1.15, 4.62, -0.44)
      group.add(light)
      this.startLights.push(mat)
    }
    const lightBar = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.95, 0.4), pillarMat)
    lightBar.position.set(0, 4.62, -0.24)
    group.add(lightBar)
    const lightCap = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.08, 0.5), pillarMat)
    lightCap.position.set(0, 5.14, -0.24)
    group.add(lightCap)
  }

  setStartLights(count, go = false) {
    this.startLights.forEach((mat, i) => {
      const active = go || i < count
      mat.emissive.setHex(go ? 0x3dff88 : 0xff1c30)
      mat.emissiveIntensity = active ? 3.4 : 0.08
    })
  }

  _buildStands() {
    const rng = mulberry32(42)
    const standMat = new THREE.MeshStandardMaterial({ color: 0x18233a, roughness: 0.7, metalness: 0.3 })
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x24324f, roughness: 0.9 })
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x0e1726, roughness: 0.4, metalness: 0.6 })
    const stripMat = new THREE.MeshStandardMaterial({ color: 0x05121a, emissive: 0x19e3ff, emissiveIntensity: 1.8 })
    const crowdGeo = new THREE.BoxGeometry(0.5, 0.7, 0.5)
    const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 })
    const colors = [0xff5a7a, 0xffd166, 0x19e3ff, 0x9b7bff, 0xe8f0ff, 0x62ffb0]

    const places = [
      { t: 0.001, side: 1, len: 64 },
      { t: 0.028, side: 1, len: 46 },
      { t: 0.004, side: -1, len: 52 }
    ]
    places.forEach((place, pi) => {
      const p = this.pointAt(place.t)
      const side = this.sideAt(place.t)
      const heading = this.headingAt(place.t)
      const group = new THREE.Group()
      group.position.copy(p).addScaledVector(side, place.side * (this.halfWidth + 14))
      group.rotation.y = heading - Math.PI / 2
      this.scene.add(group)

      const base = new THREE.Mesh(new THREE.BoxGeometry(place.len, 1.2, 15), standMat)
      base.position.y = 0.6
      base.castShadow = true
      base.receiveShadow = true
      group.add(base)

      const rows = 7
      for (let r = 0; r < rows; r++) {
        const tier = new THREE.Mesh(new THREE.BoxGeometry(place.len, 1.05, 1.9), r % 2 ? seatMat : standMat)
        tier.position.set(0, 1.6 + r * 1.05, -4.4 + r * 1.65)
        tier.castShadow = true
        tier.receiveShadow = true
        group.add(tier)
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(place.len + 3, 0.5, 15), roofMat)
      roof.position.set(0, 10.2, -0.5)
      roof.rotation.x = -0.08
      roof.castShadow = true
      group.add(roof)
      const strip = new THREE.Mesh(new THREE.BoxGeometry(place.len + 3, 0.16, 0.16), stripMat)
      strip.position.set(0, 9.9, 7.1)
      group.add(strip)
      for (let s = -1; s <= 1; s += 2) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 9.6, 8), standMat)
        post.position.set(s * (place.len / 2 - 0.6), 5.1, -6.6)
        group.add(post)
      }

      const crowdCount = 200
      const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, crowdCount)
      const dummy = new THREE.Object3D()
      const color = new THREE.Color()
      for (let c = 0; c < crowdCount; c++) {
        const row = (rng() * rows) | 0
        dummy.position.set((rng() - 0.5) * (place.len - 3), 2.2 + row * 1.05, -4.4 + row * 1.65 + (rng() - 0.5) * 0.8)
        dummy.rotation.y = (rng() - 0.5) * 0.4
        dummy.scale.setScalar(0.8 + rng() * 0.5)
        dummy.updateMatrix()
        crowd.setMatrixAt(c, dummy.matrix)
        crowd.setColorAt(c, color.setHex(colors[(rng() * colors.length) | 0]))
      }
      crowd.instanceMatrix.needsUpdate = true
      if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true
      group.add(crowd)
    })

    const pitP = this.pointAt(0.012)
    const pitSide = this.sideAt(0.012)
    const pitHeading = this.headingAt(0.012)
    const pit = new THREE.Group()
    pit.position.copy(pitP).addScaledVector(pitSide, -(this.halfWidth + 33))
    pit.rotation.y = pitHeading
    this.scene.add(pit)

    const winTex = canvasTexture(windowCanvas(), { repeat: [7, 2] })
    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0x141b2a, map: winTex, emissive: 0xffffff, emissiveMap: winTex,
      emissiveIntensity: 0.55, roughness: 0.55, metalness: 0.35
    })
    const building = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 76), buildingMat)
    building.position.y = 3.5
    building.castShadow = true
    building.receiveShadow = true
    pit.add(building)
    const pitRoof = new THREE.Mesh(new THREE.BoxGeometry(19, 0.5, 80), roofMat)
    pitRoof.position.y = 7.3
    pit.add(pitRoof)
    const pitSignTex = canvasTexture(signCanvas('PIT LANE', 'APEX RACING', '#ff2f7d', '#070b14'), { repeat: [1, 1] })
    const pitSign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshStandardMaterial({
      map: pitSignTex, emissive: 0xffffff, emissiveMap: pitSignTex, emissiveIntensity: 1.2, roughness: 0.5
    }))
    pitSign.position.set(-8.1, 5.4, 0)
    pitSign.rotation.y = -Math.PI / 2
    pit.add(pitSign)
  }

  _buildBillboards() {
    const boards = [
      { t: 0.045, side: 1, text: 'NITRO', sub: 'FUEL THE FEAR', accent: '#ff2f7d' },
      { t: 0.085, side: -1, text: 'APEX', sub: 'RACING SERIES', accent: '#19e3ff' },
      { t: 0.25, side: 1, text: 'VELOCITY', sub: 'COAST TO COAST', accent: '#b06bff' },
      { t: 0.42, side: -1, text: 'TURBO', sub: 'BOOST TECHNOLOGY', accent: '#ffc247' },
      { t: 0.62, side: 1, text: 'NEON', sub: 'NEVER SLEEP', accent: '#35ffa1' },
      { t: 0.82, side: -1, text: 'APEX', sub: 'CHASE THE LINE', accent: '#19e3ff' }
    ]
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: 0.6, metalness: 0.6 })
    for (const b of boards) {
      const p = this.pointAt(b.t)
      const side = this.sideAt(b.t)
      const tangent = this.tangentAt(b.t)
      const pos = p.clone().addScaledVector(side, b.side * (this.halfWidth + 7.5))
      const tex = canvasTexture(signCanvas(b.text, b.sub, b.accent, '#060a13'), { repeat: [1, 1] })
      const mat = new THREE.MeshStandardMaterial({
        map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.15, roughness: 0.5
      })
      const board = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.9), mat)
      board.position.copy(pos).setY(4.4)
      board.lookAt(p.clone().setY(4.4))
      this.scene.add(board)
      for (const o of [-3.6, 3.6]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 4.5, 8), poleMat)
        pole.position.copy(pos).addScaledVector(tangent, o).setY(2.25)
        this.scene.add(pole)
      }
    }
  }

  _buildFloodlights() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x222c3d, roughness: 0.5, metalness: 0.7 })
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x0a1420, emissive: 0xbfe9ff, emissiveIntensity: 2.6 })
    const spots = [0.12, 0.28, 0.44, 0.6, 0.76, 0.9]
    for (const t of spots) {
      for (const sign of [1, -1]) {
        const p = this.pointAt(t).addScaledVector(this.sideAt(t), sign * (this.halfWidth + 8.6))
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 13, 8), poleMat)
        pole.position.copy(p).setY(6.5)
        pole.castShadow = true
        this.scene.add(pole)
        const head = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.32, 0.7), poleMat)
        head.position.copy(p).setY(13.1)
        head.rotation.y = this.headingAt(t)
        this.scene.add(head)
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.1, 0.5), lampMat)
        lamp.position.copy(p).setY(12.9)
        lamp.rotation.y = this.headingAt(t)
        this.scene.add(lamp)
      }
    }
  }

  getStartPose(slot, total = 6) {
    const row = Math.floor(slot / 2)
    const col = slot % 2
    const back = (row * 8 + 4) / this.length
    const t = mod(1 - back, 1)
    const point = this.pointAt(t)
    const side = this.sideAt(t)
    const pos = point.clone().addScaledVector(side, col === 0 ? -2.9 : 2.9)
    return { pos, heading: this.headingAt(t), t }
  }

  getProgress(position, hintIndex = -1) {
    let best = -1
    let bestDist = Infinity
    const n = this.segments
    const limit = hintIndex >= 0 ? 46 : n
    for (let k = 0; k < limit; k++) {
      const i = hintIndex >= 0 ? mod(hintIndex + k - 23, n) : k
      const p = this.samples[i].point
      const dx = position.x - p.x
      const dz = position.z - p.z
      const d = dx * dx + dz * dz
      if (d < bestDist) { bestDist = d; best = i }
    }
    const s = this.samples[best]
    return {
      index: best,
      t: best / n,
      offset: (position.x - s.point.x) * s.side.x + (position.z - s.point.z) * s.side.z,
      point: s.point,
      tangent: s.tangent,
      side: s.side,
      heading: Math.atan2(s.tangent.x, s.tangent.z),
      speedLimit: this.speedProfile[best]
    }
  }

}
