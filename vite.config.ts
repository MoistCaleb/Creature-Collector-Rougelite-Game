import { defineConfig } from 'vite';

/** A build stamp shown on the title screen, so you can tell which version is running. */
const BUILD = new Date().toISOString().slice(0, 16).replace('T', ' ');

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [
    {
      // version.json: the installed app checks it to offer "New version available".
      name: 'version-file',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) });
      },
    },
  ],
  // One bundle file, so the game can be hosted as a single script.
  build: { chunkSizeWarningLimit: 2000, rollupOptions: { output: { inlineDynamicImports: true } } },
});
