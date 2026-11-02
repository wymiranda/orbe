import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  // The Worker owns application and API routing. Vite's SPA fallback would
  // otherwise serve index.html for browser navigations to /api/auth/*.
  appType: 'custom',
  server: {
    host: '0.0.0.0',
  },
  plugins: [react(), cloudflare()],
})
