export const CARS = [
  {
    id: 'vortex',
    name: 'VORTEX GT',
    klass: 'HYPERCAR',
    paint: 0x19e3ff,
    accent: 0x19e3ff,
    glass: 0x0a1a26,
    topSpeed: 92,
    accel: 26,
    handling: 1.06,
    grip: 9.2,
    nitroPower: 1.0,
    stats: { speed: 0.92, accel: 0.88, handling: 0.82, nitro: 0.8 },
    blurb: 'Balanced aero monster'
  },
  {
    id: 'solaris',
    name: 'SOLARIS RS',
    klass: 'GT',
    paint: 0xff8a1f,
    accent: 0xffc247,
    glass: 0x241405,
    topSpeed: 97,
    accel: 28.5,
    handling: 0.94,
    grip: 8.2,
    nitroPower: 0.86,
    stats: { speed: 0.98, accel: 0.97, handling: 0.72, nitro: 0.7 },
    blurb: 'Brutal straight-line speed'
  },
  {
    id: 'phantom',
    name: 'PHANTOM X',
    klass: 'PROTOTYPE',
    paint: 0xff2f7d,
    accent: 0xb06bff,
    glass: 0x1a0714,
    topSpeed: 89,
    accel: 25,
    handling: 1.2,
    grip: 9.8,
    nitroPower: 1.12,
    stats: { speed: 0.86, accel: 0.84, handling: 0.98, nitro: 0.96 },
    blurb: 'Cornering weapon'
  }
]

export const OPPONENTS = [
  { id: 'nova', name: 'NOVA', paint: 0x35ffa1, accent: 0x35ffa1, glass: 0x07160f, skill: 0.965 },
  { id: 'riptide', name: 'RIPTIDE', paint: 0x4a7bff, accent: 0x4a7bff, glass: 0x08111f, skill: 0.955 },
  { id: 'ember', name: 'EMBER', paint: 0xff4d3d, accent: 0xff9d3d, glass: 0x1a0805, skill: 0.95 },
  { id: 'onyx', name: 'ONYX', paint: 0xa7b3c7, accent: 0x8f7bff, glass: 0x0b0f16, skill: 0.975 },
  { id: 'venom', name: 'VENOM', paint: 0xb6ff2f, accent: 0x6bff8f, glass: 0x0d1605, skill: 0.985 }
]

export const QUALITY = {
  ultra: {
    label: 'ULTRA',
    pixelRatio: 2,
    shadowMap: 4096,
    shadows: true,
    bloom: true,
    bloomStrength: 0.58,
    bloomRadius: 0.5,
    bloomThreshold: 0.92,
    samples: 4,
    particles: 420,
    skidMarks: 900,
    trees: 220,
    towers: 26,
    headlights: true
  },
  high: {
    label: 'HIGH',
    pixelRatio: 1.6,
    shadowMap: 2048,
    shadows: true,
    bloom: true,
    bloomStrength: 0.48,
    bloomRadius: 0.46,
    bloomThreshold: 0.98,
    samples: 4,
    particles: 260,
    skidMarks: 600,
    trees: 150,
    towers: 18,
    headlights: true
  },
  performance: {
    label: 'PERFORMANCE',
    pixelRatio: 1,
    shadowMap: 1024,
    shadows: true,
    bloom: false,
    bloomStrength: 0.4,
    bloomRadius: 0.4,
    bloomThreshold: 0.9,
    samples: 0,
    particles: 120,
    skidMarks: 260,
    trees: 80,
    towers: 10,
    headlights: false
  }
}

export const RACE_LAPS = 3
export const CAR_NAMES = CARS.map(c => c.name)
