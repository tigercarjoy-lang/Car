import * as THREE from 'three'

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, t) => a + (b - a) * t
export const invLerp = (a, b, v) => (v - a) / (b - a)
export const smoothstep = t => t * t * (3 - 2 * t)
export const mod = (n, m) => ((n % m) + m) % m

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt))
}

export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeCanvas(w, h, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  draw(ctx, w, h)
  return canvas
}

export function canvasTexture(canvas, { repeat = [1, 1], colorSpace = THREE.SRGBColorSpace, anisotropy = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat[0], repeat[1])
  tex.colorSpace = colorSpace
  tex.anisotropy = anisotropy
  tex.needsUpdate = true
  return tex
}

function speckle(ctx, w, h, count, rng, palette, size = 1.4) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = palette[(rng() * palette.length) | 0]
    const s = size * (0.4 + rng() * 1.6)
    ctx.fillRect(rng() * w, rng() * h, s, s)
  }
}

export function asphaltCanvas() {
  return makeCanvas(512, 512, (ctx, w, h) => {
    const rng = mulberry32(7)
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#262a31')
    g.addColorStop(0.5, '#1f232a')
    g.addColorStop(1, '#2a2e36')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    speckle(ctx, w, h, 9000, rng, ['#3a3f48', '#15181d', '#4a505a', '#2f333b', '#0f1115'], 1.6)
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = `rgba(10,12,16,${0.2 + rng() * 0.35})`
      ctx.lineWidth = 0.8 + rng() * 1.6
      ctx.beginPath()
      let x = rng() * w
      let y = rng() * h
      ctx.moveTo(x, y)
      for (let k = 0; k < 4; k++) {
        x += (rng() - 0.5) * 60
        y += (rng() - 0.5) * 60
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  })
}

export function grassCanvas() {
  return makeCanvas(512, 512, (ctx, w, h) => {
    const rng = mulberry32(21)
    ctx.fillStyle = '#2b3a24'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${30 + rng() * 40}, ${50 + rng() * 55}, ${25 + rng() * 30}, ${0.25 + rng() * 0.5})`
      ctx.beginPath()
      ctx.arc(rng() * w, rng() * h, 4 + rng() * 26, 0, Math.PI * 2)
      ctx.fill()
    }
    speckle(ctx, w, h, 6000, rng, ['#3c512f', '#24301d', '#556b3d', '#1a2416', '#6b7f4b'], 1.4)
  })
}

export function curbCanvas() {
  return makeCanvas(64, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e9eef5'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#e0283f'
    ctx.fillRect(0, 0, w, h / 2)
    ctx.fillStyle = 'rgba(0,0,0,0.16)'
    for (let i = 0; i < 60; i++) {
      ctx.fillRect((i * 37) % w, (i * 91) % h, 2, 2)
    }
  })
}

export function checkerCanvas() {
  return makeCanvas(512, 128, (ctx, w, h) => {
    const cols = 16
    const rows = 4
    const cw = w / cols
    const ch = h / rows
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#f2f6ff' : '#0a0c11'
        ctx.fillRect(x * cw, y * ch, cw, ch)
      }
    }
  })
}

export function windowCanvas() {
  return makeCanvas(256, 512, (ctx, w, h) => {
    const rng = mulberry32(99)
    ctx.fillStyle = '#0b1020'
    ctx.fillRect(0, 0, w, h)
    for (let y = 8; y < h - 8; y += 16) {
      for (let x = 8; x < w - 8; x += 14) {
        const lit = rng()
        if (lit > 0.42) {
          const warm = rng() > 0.45
          ctx.fillStyle = warm
            ? `rgba(255, ${150 + rng() * 80}, ${60 + rng() * 60}, ${0.5 + rng() * 0.5})`
            : `rgba(${60 + rng() * 50}, ${190 + rng() * 60}, 255, ${0.4 + rng() * 0.55})`
          ctx.fillRect(x, y, 7, 7)
        } else {
          ctx.fillStyle = 'rgba(30, 45, 70, 0.55)'
          ctx.fillRect(x, y, 7, 7)
        }
      }
    }
    ctx.fillStyle = 'rgba(10,16,30,0.85)'
    ctx.fillRect(0, 0, w, 6)
    ctx.fillRect(0, h - 6, w, 6)
  })
}

export function glowCanvas(color = '255,255,255') {
  return makeCanvas(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, `rgba(${color},1)`)
    g.addColorStop(0.28, `rgba(${color},0.55)`)
    g.addColorStop(1, `rgba(${color},0)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
}

export function smokeCanvas() {
  return makeCanvas(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, 'rgba(255,255,255,0.9)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.32)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
}

export function signCanvas(text, sub = '', accent = '#19e3ff', bg = '#070b14') {
  return makeCanvas(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    const g = ctx.createLinearGradient(0, 0, w, 0)
    g.addColorStop(0, accent)
    g.addColorStop(0.55, '#7c5cff')
    g.addColorStop(1, '#ff2f7d')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, 10)
    ctx.fillRect(0, h - 10, w, 10)
    ctx.font = '900 118px Orbitron, Arial Black, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = accent
    ctx.shadowBlur = 42
    ctx.fillStyle = '#f2f8ff'
    ctx.fillText(text, w / 2, sub ? h / 2 - 18 : h / 2)
    if (sub) {
      ctx.shadowBlur = 18
      ctx.font = '600 42px Rajdhani, Arial, sans-serif'
      ctx.fillStyle = accent
      ctx.fillText(sub, w / 2, h / 2 + 78)
    }
  })
}

export function skyCanvas() {
  return makeCanvas(2048, 1024, (ctx, w, h) => {
    const rng = mulberry32(5)
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#040714')
    g.addColorStop(0.26, '#101a3d')
    g.addColorStop(0.4, '#3a2a63')
    g.addColorStop(0.475, '#a34a63')
    g.addColorStop(0.5, '#ff8a5c')
    g.addColorStop(0.515, '#3a2a52')
    g.addColorStop(0.62, '#101626')
    g.addColorStop(1, '#05070d')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    const sunX = w * 0.68
    const sunY = h * 0.475
    const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 260)
    sun.addColorStop(0, 'rgba(255,246,214,1)')
    sun.addColorStop(0.12, 'rgba(255,214,140,0.95)')
    sun.addColorStop(0.35, 'rgba(255,140,80,0.35)')
    sun.addColorStop(1, 'rgba(255,100,80,0)')
    ctx.fillStyle = sun
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(255,250,230,1)'
    ctx.beginPath()
    ctx.arc(sunX, sunY, 42, 0, Math.PI * 2)
    ctx.fill()

    for (let i = 0; i < 1300; i++) {
      if (rng() > 0.55) continue
      const x = rng() * w
      const y = rng() * h * 0.44
      const a = (1 - y / (h * 0.44)) * rng() * 0.8
      ctx.fillStyle = `rgba(${180 + rng() * 70}, ${205 + rng() * 50}, 255, ${a})`
      ctx.fillRect(x, y, rng() > 0.9 ? 2 : 1, rng() > 0.9 ? 2 : 1)
    }

    const bands = [
      { y: 0.34, h: 0.03, color: '255,140,150', a: 0.2 },
      { y: 0.42, h: 0.028, color: '255,180,140', a: 0.18 },
      { y: 0.47, h: 0.05, color: '210,140,220', a: 0.16 },
      { y: 0.26, h: 0.022, color: '150,150,255', a: 0.12 }
    ]
    for (const band of bands) {
      for (let i = 0; i < 90; i++) {
        const x = rng() * w
        const y = h * band.y + (rng() - 0.5) * h * band.h * 2
        const rx = 30 + rng() * 190
        const ry = 3 + rng() * 15
        const cg = ctx.createRadialGradient(x, y, 0, x, y, rx)
        cg.addColorStop(0, `rgba(${band.color},${band.a * (0.4 + rng() * 0.6)})`)
        cg.addColorStop(1, `rgba(${band.color},0)`)
        ctx.save()
        ctx.translate(x, y)
        ctx.scale(1, ry / rx)
        ctx.translate(-x, -y)
        ctx.fillStyle = cg
        ctx.beginPath()
        ctx.arc(x, y, rx, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }

    const haze = ctx.createLinearGradient(0, h * 0.44, 0, h * 0.56)
    haze.addColorStop(0, 'rgba(255,140,110,0.18)')
    haze.addColorStop(1, 'rgba(255,140,110,0)')
    ctx.fillStyle = haze
    ctx.fillRect(0, h * 0.44, w, h * 0.12)
  })
}
