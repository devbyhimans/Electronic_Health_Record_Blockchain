import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api/hospital/peer0': {
        target: process.env.VITE_PEER0_API_TARGET || 'http://127.0.0.1:4001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hospital\/peer0/, ''),
      },
      '/api/hospital/peer1': {
        target: process.env.VITE_PEER1_API_TARGET || 'http://127.0.0.1:4002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hospital\/peer1/, ''),
      },
      '/api/hospital/peer2': {
        target: process.env.VITE_PEER2_API_TARGET || 'http://127.0.0.1:4003',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hospital\/peer2/, ''),
      },
      '/api/hospital/ext': {
        target: process.env.VITE_EXTORG_API_TARGET || 'http://127.0.0.1:4004',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hospital\/ext/, ''),
      },
      '/api/ipfs': {
        target: process.env.VITE_IPFS_API_TARGET || 'http://127.0.0.1:4006',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ipfs/, ''),
      },
    },
  },
})

