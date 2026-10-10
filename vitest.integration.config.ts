import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// La connexion d'intégration provient exclusivement du fichier existant à la racine.
config({ path: '.env', override: true });

export default defineConfig({
  test: {
    include: ['worker/src/__tests__/integration*.sql.test.ts'],
    environment: 'node',
    hookTimeout: 60000,
    testTimeout: 15000,
    fileParallelism: false,
  },
});
