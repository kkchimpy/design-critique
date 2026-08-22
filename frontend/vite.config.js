import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy /api/* to the FastAPI backend during local dev.
    // This means VITE_API_BASE can be empty (relative URL) everywhere.
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        // Required for SSE streaming — disable response buffering
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('connection', 'keep-alive');
          });
        },
      },
    },
  },
})
