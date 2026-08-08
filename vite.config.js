import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // Relative assets let the same release live at les.ovc.me/fg/ and at the
  // dedicated fitout.ovc.me root without producing two different bundles.
  base: './',
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
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        chapterOne: resolve(import.meta.dirname, 'prototypes/fitout-chapter-one.html'),
      },
    },
  },
});
