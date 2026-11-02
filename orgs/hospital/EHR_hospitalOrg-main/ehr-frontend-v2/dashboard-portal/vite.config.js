import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || (process.env.NODE_ENV === 'production' ? '/dashboard/' : '/'),
  server: {
    host: '0.0.0.0',
    port: 5176,
    proxy: {
      '/api/dashboard': { target: process.env.VITE_DASHBOARD_API_TARGET || 'http://127.0.0.1:4010', ws: true },
      '/api/hospital/peer0': { target: process.env.VITE_PEER0_API_TARGET || 'http://127.0.0.1:4001', rewrite: path => path.replace(/^\/api\/hospital\/peer0/, '') },
    }
  }
})
