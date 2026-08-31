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

## Models

109 CC0 models from the Ultimate Platformer Pack (Quaternius) are in
`public/models/`, grouped as `character`, `cubes`, `enemies`, `level`,
`nature`, `pickups`, `platforms-2d`, `platforms-3d`,
`platforms-single-height`. Load them by name:

```js
import { loadModel, loadModels, MODEL_NAMES } from './models.js';

const bee = await loadModel('Bee');            // -> THREE.Group
const { Coin, Cube_Bricks } = await loadModels(['Coin', 'Cube_Bricks']);
```

`loadModel` throws on an unknown name and suggests near matches, so a typo
fails at load with a readable message instead of silently rendering nothing.
`MODEL_NAMES` is the full list. `src/models.generated.js` is written by
`scripts/gen-model-manifest.js` — regenerate it after adding assets, don't
hand-edit it.

Reuse a loaded model with `.clone()` rather than loading it again.

## Other assets

The build uses `base: './'` so it works at any Pages URL. That makes
root-absolute paths (`/models/ship.glb`) wrong in production.

- Bundled: put the file in `src/assets/` and `import url from './assets/ship.glb'`.
  Vite hashes it and rewrites the URL.
- Unprocessed: put it in `public/` and build the URL with
  `import.meta.env.BASE_URL + 'ship.glb'`.

Note that Vite does not rewrite paths *inside* a `.gltf`, so a glTF with an
external `.bin` or texture must go in `public/` with its siblings intact.

## Before calling it done

`npm run build` must pass — a failed build means no deploy. Then `npm run dev`
and confirm the game actually renders and plays.

## House rules

No silent fallbacks. If an asset is missing or a config value is absent, throw
with a message that names what was missing. A game that "sort of works" while
hiding a broken load is worse than one that fails loudly on the first frame.
