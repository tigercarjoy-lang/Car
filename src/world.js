import * as THREE from 'three'
import { canvasTexture, grassCanvas, mulberry32, skyCanvas, windowCanvas } from './utils.js'

export class World {
  constructor(scene, renderer, track, quality) {
    this.scene = scene
    this.renderer = renderer
    this.track = track
    this.quality = quality
    this._buildSky()
    this._buildLights()
    this._buildGround()
    this._buildMountains()
    this._buildCity()
    this._buildTrees()
  }

  _buildSky() {
    const skyTex = canvasTexture(skyCanvas(), { repeat: [1, 1] })
    skyTex.mapping = THREE.EquirectangularReflectionMapping
    skyTex.colorSpace = THREE.SRGBColorSpace
    this.skyTexture = skyTex

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    pmrem.compileEquirectangularShader()
    this.envRT = pmrem.fromEquirectangular(skyTex)
    this.scene.environment = this.envRT.texture
    this.scene.environmentIntensity = 1.25
    this.scene.background = skyTex
    this.scene.backgroundIntensity = 1.0
    this.scene.fog = new THREE.FogExp2(0x3a2f4a, 0.00195)
    pmrem.dispose()

    const az = 0.36 * Math.PI
    const elev = 0.075
    this.sunDir = new THREE.Vector3(
      Math.cos(az) * Math.cos(elev),
      Math.sin(elev),
      Math.sin(az) * Math.cos(elev)
    ).normalize()
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight(0x9ec8ff, 0x3a2a1e, 0.92)
    this.scene.add(hemi)

    const sun = new THREE.DirectionalLight(0xffb27a, 3.0)
    sun.castShadow = true
    sun.shadow.mapSize.set(this.quality.shadowMap, this.quality.shadowMap)
    sun.shadow.camera.left = -95
    sun.shadow.camera.right = 95
    sun.shadow.camera.top = 95
    sun.shadow.camera.bottom = -95
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 420
    sun.shadow.bias = -0.00035
    sun.shadow.normalBias = 0.045
    this.scene.add(sun)
    this.scene.add(sun.target)
    this.sun = sun

    const fill = new THREE.DirectionalLight(0x6c8dff, 0.8)
    fill.position.copy(this.sunDir).multiplyScalar(-140).setY(90)
    this.scene.add(fill)
  }

  _buildGround() {
    const grassTex = canvasTexture(grassCanvas(), { repeat: [110, 110], anisotropy: 4 })
    const geo = new THREE.CircleGeometry(1500, 96)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshStandardMaterial({
      map: grassTex, color: 0xa9b894, roughness: 1, metalness: 0
    })
    const ground = new THREE.Mesh(geo, mat)
    ground.position.y = -0.09
    ground.receiveShadow = true
    this.scene.add(ground)
  }

  _ridge({ radius, minH, maxH, color, seed, segments = 240, warm = 0, jitter = 0.035 }) {
    const positions = []
    const colors = []
    const indices = []
    const base = new THREE.Color(color)
    const top = base.clone().lerp(new THREE.Color(0x7a5372), warm)
    const bottom = base.clone().multiplyScalar(0.65)
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2
      const r = radius * (1 + Math.sin(a * 9 + seed) * jitter + Math.sin(a * 23 + seed * 2) * jitter * 0.5)
      const n = 0.5 + 0.3 * Math.sin(a * 6 + seed) + 0.15 * Math.sin(a * 17 + seed * 2.3) + 0.08 * Math.sin(a * 37 + seed * 3.7)
      const h = minH + (maxH - minH) * Math.max(0.08, Math.min(1, n))
      positions.push(Math.cos(a) * r, -40, Math.sin(a) * r)
      positions.push(Math.cos(a) * r, h, Math.sin(a) * r)
      colors.push(bottom.r, bottom.g, bottom.b)
      colors.push(top.r, top.g, top.b)
    }
    for (let i = 0; i < segments; i++) {
      const a0 = i * 2
      const b0 = a0 + 1
      const a1 = ((i + 1) % segments) * 2
      const b1 = a1 + 1
      indices.push(a0, a1, b0, b0, a1, b1)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    this.scene.add(mesh)
  }

  _buildMountains() {
    this._ridge({ radius: 1180, minH: 130, maxH: 340, color: 0x3a2d55, seed: 11, warm: 0.55 })
    this._ridge({ radius: 920, minH: 90, maxH: 250, color: 0x302544, seed: 37, warm: 0.34 })
    this._ridge({ radius: 640, minH: 45, maxH: 155, color: 0x241d36, seed: 73, warm: 0.16 })
    this._ridge({ radius: 410, minH: 10, maxH: 58, color: 0x1e2a24, seed: 19, warm: 0.0, segments: 180, jitter: 0.05 })
  }

  _trackDistance(x, z) {
    let best = Infinity
    const samples = this.track.samples
    for (let i = 0; i < samples.length; i += 3) {
      const p = samples[i].point
      const dx = x - p.x
      const dz = z - p.z
      const d = dx * dx + dz * dz
      if (d < best) best = d
    }
    return Math.sqrt(best)
  }

  _buildCity() {
    const rng = mulberry32(88)
    const winTex = canvasTexture(windowCanvas(), { repeat: [2, 4] })
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x9aa6c0, map: winTex, emissive: 0xffffff, emissiveMap: winTex,
      emissiveIntensity: 1.0, roughness: 0.62, metalness: 0.25
    })
    const neonColors = [0x19e3ff, 0xff2f7d, 0xb06bff, 0xffc247, 0x35ffa1]
    const boxGeo = new THREE.BoxGeometry(1, 1, 1)
    let placed = 0
    let attempts = 0
    while (placed < this.quality.towers && attempts < 400) {
      attempts++
      const angle = rng() * Math.PI * 2
      const radius = 280 + rng() * 230
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      if (this._trackDistance(x, z) < 55) continue
      const w = 12 + rng() * 22
      const d = 12 + rng() * 22
      const h = 28 + rng() * 70
      const mesh = new THREE.Mesh(boxGeo, baseMat)
      mesh.position.set(x, h / 2 - 2, z)
      mesh.scale.set(w, h, d)
      mesh.rotation.y = rng() * Math.PI
      this.scene.add(mesh)

      const neonMat = new THREE.MeshStandardMaterial({
        color: 0x05080f, emissive: neonColors[(rng() * neonColors.length) | 0], emissiveIntensity: 3.2
      })
      const crown = new THREE.Mesh(boxGeo, neonMat)
      crown.position.set(x, h - 1.5, z)
      crown.scale.set(w * 1.02, 0.5, d * 1.02)
      crown.rotation.y = mesh.rotation.y
      this.scene.add(crown)
      placed++
    }
  }

  _buildTrees() {
    const rng = mulberry32(555)
    const count = this.quality.trees
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3.4, 6)
    trunkGeo.translate(0, 1.7, 0)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a1d16, roughness: 1 })
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count)

    const coneGeo = new THREE.ConeGeometry(2.6, 7.5, 7)
    coneGeo.translate(0, 6.0, 0)
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true, emissive: 0x0c1c12, emissiveIntensity: 0.5 })
    const conifers = new THREE.InstancedMesh(coneGeo, leafMat, count)

    const bushGeo = new THREE.IcosahedronGeometry(2.7, 1)
    bushGeo.translate(0, 5.0, 0)
    const bushes = new THREE.InstancedMesh(bushGeo, leafMat, count)

    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    const palette = [0x2f5538, 0x3b6340, 0x27482f, 0x4a6b44, 0x35543b]
    let n = 0
    let b = 0
    let attempts = 0
    let placed = 0
    while (placed < count && attempts < count * 30) {
      attempts++
      const angle = rng() * Math.PI * 2
      const radius = 42 + rng() * 360
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const dist = this._trackDistance(x, z)
      if (dist < 26 + rng() * 10) continue
      const scale = 0.75 + rng() * 1.05
      dummy.position.set(x, 0, z)
      dummy.rotation.set(0, rng() * Math.PI, 0)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      trunks.setMatrixAt(placed, dummy.matrix)
      let target
      if (rng() > 0.45) {
        target = conifers
        conifers.setMatrixAt(n, dummy.matrix)
        conifers.setColorAt(n, color.setHex(palette[(rng() * palette.length) | 0]))
        n++
      } else {
        target = bushes
        dummy.scale.setScalar(scale * (0.75 + rng() * 0.35))
        dummy.updateMatrix()
        bushes.setMatrixAt(b, dummy.matrix)
        bushes.setColorAt(b, color.setHex(palette[(rng() * palette.length) | 0]))
        b++
      }
      placed++
    }
    conifers.count = n
    bushes.count = b
    trunks.count = placed
    trunks.castShadow = true
    conifers.castShadow = true
    bushes.castShadow = true
    trunks.instanceMatrix.needsUpdate = true
    conifers.instanceMatrix.needsUpdate = true
    bushes.instanceMatrix.needsUpdate = true
    if (conifers.instanceColor) conifers.instanceColor.needsUpdate = true
    if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true
    this.scene.add(trunks, conifers, bushes)
  }

  update(dt, focus) {
    const f = focus || new THREE.Vector3()
    this.sun.position.copy(f).addScaledVector(this.sunDir, 190)
    this.sun.target.position.copy(f)
    this.sun.target.updateMatrixWorld()
  }
}
