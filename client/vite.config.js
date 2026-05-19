import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/download': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/download-zip': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/sotxt8-dl': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
})
