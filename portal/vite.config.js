import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Allow phones/devices on the same LAN/WiFi to reach the dev server
    // (needed for MikroTik hotspot redirect testing).
    host: true,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
