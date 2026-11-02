import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base: works on GitHub Pages (/letha-ch/) and any static host.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
});
