import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { sitemapPlugin } from './vite-plugins/sitemap';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', ['VITE_', 'SITEMAP_']);
  const siteUrl = env.VITE_SITE_URL?.trim() || 'https://leblanc-et-moi.pages.dev';
  return {
    plugins: [
      react(),
      sitemapPlugin(siteUrl, env.SITEMAP_API_URL || env.VITE_API_URL || ''),
      visualizer({
        filename: '../artifacts/bundle-report.html',
        gzipSize: true,
        brotliSize: true,
        open: false,
      }),
    ],
    build: { manifest: true },
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
  };
});
