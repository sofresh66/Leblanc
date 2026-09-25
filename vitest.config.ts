import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'shared/src/**/*.test.ts',
      'frontend/src/**/*.test.{ts,tsx}',
      'scripts/**/*.test.{ts,js,mjs}',
      'worker/src/**/*.test.ts',
    ],
    environment: 'node',
    exclude: ['**/node_modules/**', '**/integration.sql.test.ts'],
  },
});
