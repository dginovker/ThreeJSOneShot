# ThreeJS one-shot game

Static Three.js game, built by Vite, deployed to GitHub Pages by
`.github/workflows/deploy.yml` on every push to `main`.

## Writing the game

- Entry point is `src/main.js` (loaded by `index.html`). Replace it. Add more
  modules under `src/` and import them.
- `import * as THREE from 'three'` and addons from `three/addons/...`
  (e.g. `three/addons/controls/OrbitControls.js`). Both resolve from the npm
  package — never load Three from a CDN or an import map.
- Keep the frame loop wrapped: `renderer.setAnimationLoop(guardFrame(() => ...))`
  from `./fatal.js`. It puts the first thrown error on screen and stops the loop
  instead of leaving a black canvas.
- Everything runs client-side. There is no server, no build-time secrets, and
  no persistence beyond `localStorage`.

## Assets

The build uses `base: './'` so it works at any Pages URL. That makes
root-absolute paths (`/models/ship.glb`) wrong in production.

- Bundled: put the file in `src/assets/` and `import url from './assets/ship.glb'`.
  Vite hashes it and rewrites the URL.
- Unprocessed: put it in `public/` and build the URL with
  `import.meta.env.BASE_URL + 'ship.glb'`.

## Before calling it done

`npm run build` must pass — a failed build means no deploy. Then `npm run dev`
and confirm the game actually renders and plays.

## House rules

No silent fallbacks. If an asset is missing or a config value is absent, throw
with a message that names what was missing. A game that "sort of works" while
hiding a broken load is worse than one that fails loudly on the first frame.
