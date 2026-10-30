import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600
  },
  server: {
    port: 3002,
    host: '0.0.0.0'
  }
})
