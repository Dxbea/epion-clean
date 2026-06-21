// DEBUT BLOC (remplace tout)
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'node:path'

// Ton backend ecoute sur le port 5175 (cf. server.ts)
const API_PORT = 5175

function validateProductionApiUrl() {
  const rawApiUrl = process.env.VITE_API_URL?.trim()

  if (!rawApiUrl) {
    throw new Error('VITE_API_URL is required when building the frontend for production.')
  }

  const apiUrl = new URL(rawApiUrl)
  if (!['http:', 'https:'].includes(apiUrl.protocol)) {
    throw new Error('VITE_API_URL must use http or https.')
  }

  if (apiUrl.pathname !== '/' || apiUrl.search || apiUrl.hash) {
    throw new Error('VITE_API_URL must be an API origin only, without path, query or hash.')
  }

  if (apiUrl.protocol !== 'https:') {
    throw new Error('VITE_API_URL must use https in production.')
  }

  if (['localhost', '127.0.0.1', '::1'].includes(apiUrl.hostname)) {
    throw new Error('VITE_API_URL must not point to localhost in production.')
  }
}

export default defineConfig(({ command, mode }) => {
  if (command === 'build' && mode === 'production') {
    validateProductionApiUrl()
  }

  return {
    plugins: [react(), tsconfigPaths()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: `http://localhost:${API_PORT}`,
          changeOrigin: true,
        },
      },
    },
  }
})
// FIN BLOC
