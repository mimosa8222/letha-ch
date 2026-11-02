import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site at /<repo>/, so the base path follows the repo name.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/letha-ch/' : '/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
});
