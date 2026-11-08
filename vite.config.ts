import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `base: './'` keeps every asset URL relative so the same build works on
// GitHub Pages project sites (/reality-quest/), Cloudflare Pages and Vercel.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Single vendor chunk: react-leaflet depends on react, so splitting
        // them into separate manual chunks creates a circular chunk graph.
        manualChunks: {
          vendor: ['react', 'react-dom', 'zustand', 'idb', 'leaflet', 'react-leaflet'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    css: false,
  },
});
