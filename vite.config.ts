import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/tide736': {
        target: 'https://api.tide736.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/tide736/, ''),
      },
    },
  },
})