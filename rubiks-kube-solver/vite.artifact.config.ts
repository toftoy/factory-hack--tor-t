import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Produces a single, self-contained dist-artifact/index.html (used to preview
// the app as a Claude Artifact, or to run it straight from disk with no
// server). Not part of the normal deployable build.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  worker: {
    format: 'iife',
  },
  build: {
    outDir: 'dist-artifact',
  },
});
