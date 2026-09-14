import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Served from a subdirectory on GitHub Pages; set to '/' for Netlify or Pages
  // at a domain root via `VITE_BASE=/`.
  base: process.env.VITE_BASE ?? './',
  build: { target: 'es2022', outDir: 'dist' },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['test/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx'],
      reporter: ['text', 'lcov', 'json-summary'],
      thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
    },
  },
});
