import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Allow accessing the dev server via this ngrok host
    // Note: restart the dev server after changing this
    allowedHosts: ['fool-sale-match-blake.trycloudflare.com'],
  },
})
