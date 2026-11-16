import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // A build stamp shown on the title screen, so you can tell which version is running.
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
  // One bundle file, so the game can be hosted as a single script.
  build: { chunkSizeWarningLimit: 2000, rollupOptions: { output: { inlineDynamicImports: true } } },
});
