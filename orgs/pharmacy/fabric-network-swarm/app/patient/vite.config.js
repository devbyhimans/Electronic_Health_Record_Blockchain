import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

export default defineConfig({
  plugins: [react()],
  build: { cssMinify: false },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api/pharmacy': {
        target: process.env.VITE_PHARMACY_API_TARGET || 'http://p-backend:3000',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/pharmacy/, ''),
      },
    },
  },
})
