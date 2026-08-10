import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/static/app/' : '/',
  build: {
    outDir: '../static/app',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/todos': 'http://127.0.0.1:8000',
      '/users': 'http://127.0.0.1:8000',
      '/admin': 'http://127.0.0.1:8000',
      '/healthy': 'http://127.0.0.1:8000',
    },
  },
}))
