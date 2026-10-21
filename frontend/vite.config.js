import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: fileURLToPath(new URL('./web', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  plugins: [vue()],
  base: '/',
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    assetsDir: 'static/vue',
  },
})
