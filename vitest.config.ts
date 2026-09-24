import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'shared/src/**/*.test.ts',
      'frontend/src/**/*.test.ts',
      'scripts/**/*.test.{ts,js,mjs}',
    ],
    environment: 'node',
  },
});
