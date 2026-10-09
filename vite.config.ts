/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // The backend answers CORS preflights with `Access-Control-Allow-Headers: *`, which browsers do not accept for
  // the Authorization header. In development the browser talks to this server (same origin) and /backend is
  // forwarded to the API, so VITE_API_URL=/backend works without any CORS involved.
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.BACKEND_PROXY_TARGET || 'http://localhost'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      proxy: {
        '/backend': {
          target: backend,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/backend/, ''),
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  }
})
