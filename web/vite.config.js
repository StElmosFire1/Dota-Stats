import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
      '/scouting': 'http://localhost:5000',
      '/auth': 'http://localhost:5000',
    },
  },
});
