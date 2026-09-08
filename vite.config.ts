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
          // three and the post-processing chain are the heaviest dependencies
          // and are only needed once the WebGL layer boots — keep them out of
          // the critical entry chunk so the readable fallback stays cheap.
          three: ['three', 'postprocessing'],
        },
      },
    },
  },
});
