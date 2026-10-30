import * as THREE from 'three'
import { smokeCanvas } from './utils.js'

export class ParticleSystem {
  constructor(scene, max = 260) {
    this.max = max
    this.pointer = 0
    this.pool = []
    this.positions = new Float32Array(max * 3)
    this.sizes = new Float32Array(max)
    this.alphas = new Float32Array(max)
    this.colors = new Float32Array(max * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1))
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3))

    const tex = new THREE.CanvasTexture(smokeCanvas())
    tex.colorSpace = THREE.SRGBColorSpace

    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex } },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vAlpha = aAlpha;
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (260.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor, t.a * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    scene.add(this.points)
    this.geo = geo

    for (let i = 0; i < max; i++) {
      this.pool.push({
        life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, size: 1, grow: 1,
        r: 1, g: 1, b: 1, x: 0, y: -100, z: 0
      })
      this.alphas[i] = 0
      this.positions[i * 3 + 1] = -100
    }
  }

  spawn(x, y, z, vx, vy, vz, size, life, color) {
    const p = this.pool[this.pointer]
    this.pointer = (this.pointer + 1) % this.max
    p.x = x; p.y = y; p.z = z
    p.vx = vx; p.vy = vy; p.vz = vz
    p.size = size
    p.grow = 0.6 + Math.random() * 1.6
    p.life = life
    p.maxLife = life
    p.r = color.r; p.g = color.g; p.b = color.b
  }

  emitDrift(wheel, intensity = 1, offroad = false) {
    const color = offroad
      ? { r: 0.55, g: 0.45, b: 0.32 }
      : { r: 0.78, g: 0.82, b: 0.9 }
    const count = offroad ? 2 : 2
    for (let i = 0; i < count; i++) {
      this.spawn(
        wheel.pos.x + (Math.random() - 0.5) * 0.5,
        0.18 + Math.random() * 0.2,
        wheel.pos.z + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 2.2,
        0.6 + Math.random() * 1.2,
        (Math.random() - 0.5) * 2.2,
        0.8 + Math.random() * 1.1,
        (0.5 + Math.random() * 0.6) * (0.7 + intensity * 0.4),
        color
      )
    }
  }

  update(dt) {
    const pos = this.positions
    for (let i = 0; i < this.max; i++) {
      const p = this.pool[i]
      if (p.life > 0) {
        p.life -= dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.z += p.vz * dt
        p.vx *= 1 - 1.4 * dt
        p.vz *= 1 - 1.4 * dt
        p.vy += 0.3 * dt
        p.size += p.grow * dt
        const k = Math.max(0, p.life / p.maxLife)
        this.alphas[i] = k * 0.55
        this.sizes[i] = p.size
      } else {
        this.alphas[i] = 0
      }
      pos[i * 3] = p.x
      pos[i * 3 + 1] = p.y
      pos[i * 3 + 2] = p.z
      this.colors[i * 3] = p.r
      this.colors[i * 3 + 1] = p.g
      this.colors[i * 3 + 2] = p.b
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.aSize.needsUpdate = true
    this.geo.attributes.aAlpha.needsUpdate = true
    this.geo.attributes.aColor.needsUpdate = true
  }
}

export class SkidMarks {
  constructor(scene, max = 600) {
    this.max = max
    this.pointer = 0
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x05070b,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4
    })
    this.mesh = new THREE.InstancedMesh(geo, mat, max)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
    this.dummy = new THREE.Object3D()
    for (let i = 0; i < max; i++) {
      this.dummy.position.set(0, -100, 0)
      this.dummy.scale.set(0, 0, 0)
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    scene.add(this.mesh)
  }

  add(x, z, heading, width = 0.32, length = 0.7) {
    this.dummy.position.set(x, 0.017, z)
    this.dummy.rotation.set(0, heading, 0)
    this.dummy.scale.set(width, 1, length)
    this.dummy.updateMatrix()
    this.mesh.setMatrixAt(this.pointer, this.dummy.matrix)
    this.pointer = (this.pointer + 1) % this.max
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
