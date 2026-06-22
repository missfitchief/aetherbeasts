import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // relative base so the built bundle works from any host root or subpath
  base: './',
  plugins: [
    react(),
    // @solana/web3.js + spl-token expect Node's Buffer/process in the browser.
    nodePolyfills({ include: ['buffer', 'process'], globals: { Buffer: true, process: true } }),
  ],
  resolve: {
    alias: {
      '@aether/shared': path.resolve(dir, '../shared/src/index.ts'),
    },
  },
  server: {
    host: true,
    fs: {
      // allow importing the shared workspace TS source directly
      allow: [path.resolve(dir, '..')],
    },
  },
});
