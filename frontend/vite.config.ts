/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev, /api goes to `wrangler pages dev` (port 8788), which runs the Pages Function
// and reaches the locally running retro-worker through its service binding.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8788', ws: true },
    },
  },
  test: {
    include: ['server/**/*.test.ts'],
  },
})
