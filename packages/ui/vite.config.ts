import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * `--mode capacitor` builds the bundle that goes inside the Android APK. The
 * only difference is the service worker: Capacitor already serves every asset
 * from inside the package, so a worker would cache a copy of files that are
 * local anyway, and add a second thing that can serve a stale build. The web
 * build keeps it, because there it is what makes the app work offline at all.
 */
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      disable: mode === 'capacitor',
      registerType: 'autoUpdate',
      // Relative paths throughout, so the same build works from a domain root
      // and from a GitHub Pages subdirectory without being rebuilt.
      base: process.env.VITE_BASE ?? './',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'Tarot',
        short_name: 'Tarot',
        description: 'Jeu de tarot a 3, 4 et 5 joueurs. Hors ligne, sans compte et sans publicite.',
        lang: 'fr',
        categories: ['games'],
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0d3a20',
        theme_color: '#14532d',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The whole app is precached: every asset it needs is in the build, so
        // once it has been opened once it never touches the network again.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // There are no runtime fetches to fall back on, so nothing is cached
        // at runtime and nothing is ever fetched from a third party.
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  // Served from a subdirectory on GitHub Pages; set to '/' for Netlify or Pages
  // at a domain root via `VITE_BASE=/`.
  base: process.env.VITE_BASE ?? './',
  // Separate output directories on purpose. If both builds wrote to `dist`, a
  // native build followed by a deploy would put a bundle with no service worker
  // on the web, and the app would quietly stop working offline.
  build: { target: 'es2022', outDir: mode === 'capacitor' ? 'dist-native' : 'dist' },
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
}));
