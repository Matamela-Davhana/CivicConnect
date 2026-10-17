import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The UI always calls relative `/api/...` URLs. The proxy forwards them to the
// Express API, both in `npm run dev` and in `npm run preview` (used by CI).
const api = {
  '/api': { target: process.env.VITE_PROXY_TARGET ?? 'http://127.0.0.1:3000', changeOrigin: true },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy: api },
  preview: { proxy: api },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: false,
  },
})
