import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base keeps the build portable: works at a domain root and at a
  // GitHub Pages project subpath (/port/) without a rebuild.
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    cssTarget: 'chrome90',
    assetsInlineLimit: 2048,
    rollupOptions: {
      output: {
        manualChunks: {
          // three is the heaviest dependency and is only needed once the
          // WebGL layer boots — keep it out of the critical entry chunk.
          three: ['three'],
        },
      },
    },
  },
});
