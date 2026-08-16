import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // '' для Vercel/корня; '/telegram-booking/' для GitHub Pages project site
  base: process.env.VITE_BASE || '/',
  resolve: {
    alias: {
      '@shared': path.resolve(repoRoot, 'shared'),
    },
  },
  server: {
    // Нужен для туннелей (ngrok и т.п.), чтобы Telegram мог открыть Mini App
    host: true,
    port: 5173,
    allowedHosts: true,
    fs: {
      allow: [repoRoot],
    },
  },
})
