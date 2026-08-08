import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      // Regex key: plain '/api' prefix-matches SPA routes like /api-docs,
      // handing them to the backend (blank page). Only proxy /api/*.
      '^/api(/|$)': 'http://127.0.0.1:3000',
      '/scouting': 'http://127.0.0.1:3000',
      '/auth': 'http://127.0.0.1:3000',
    },
  },
});
