import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Stamps the service worker with a unique build id so each deploy gets its
 * own cache and the previous one is discarded on activate. `public/` files
 * are copied verbatim by Vite, so the replacement happens after the bundle
 * is written.
 */
function stampServiceWorker() {
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    closeBundle() {
      const file = fileURLToPath(new URL('./dist/sw.js', import.meta.url));
      if (!existsSync(file)) return;
      const buildId = Date.now().toString(36);
      writeFileSync(file, readFileSync(file, 'utf8').replace('__BUILD_ID__', buildId));
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // Ensures relative paths so assets load correctly on GitHub Pages
  plugins: [stampServiceWorker()]
});
