import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // One bundle file, so the game can be hosted as a single script.
  build: { chunkSizeWarningLimit: 2000, rollupOptions: { output: { inlineDynamicImports: true } } },
});
