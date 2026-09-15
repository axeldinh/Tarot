import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // index.ts is the Cloudflare Worker/Durable Object glue: like the Nearby
      // Capacitor plugin, it is thin on purpose and cannot run outside the
      // Workers runtime, so it is not covered here.
      include: ['src/room.ts'],
      reporter: ['text', 'lcov', 'json-summary'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
