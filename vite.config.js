import { defineConfig } from 'vite'

export default defineConfig({
  base: '/llave-maestra/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
  }
})
