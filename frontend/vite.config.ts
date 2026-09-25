import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Lit le .env racine. Une URL complète VITE_API_URL doit inclure /api
  // (ex. https://api.example.com/api) ; seuls les noms VITE_ vont au client.
  envDir: '..',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
