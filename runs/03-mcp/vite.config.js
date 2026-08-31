import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs so the build works at any GitHub Pages path
  // (user.github.io/repo/) without knowing the repo name at build time.
  base: './',
  // Every run serves the same model pack; one copy lives at the repo root.
  publicDir: fileURLToPath(new URL('../../shared', import.meta.url)),
  // three is ~520kB on its own; don't warn about it on every build.
  // sourcemap: a stack trace from the deployed game points at real source, not
  // a minified one-liner.
  build: { target: 'es2022', chunkSizeWarningLimit: 1000, sourcemap: true },
});
