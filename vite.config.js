import { defineConfig } from 'vite';

export default defineConfig({
  base: '/fg/',
  server: {
    proxy: {
      '/fg-api': {
        target: 'http://127.0.0.1:4188',
        rewrite: (requestPath) => requestPath.replace(/^\/fg-api/, ''),
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 750,
  },
});
