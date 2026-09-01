# How to work

When given a request, investigate first — read files, search code, examine the
scene graph — then act. When a request is ambiguous, use the project context to
infer intent rather than asking clarifying questions. Pick the most reasonable
interpretation and go.

Before implementing, gather what you need in parallel: read relevant modules,
glob for files, check the asset manifest — all in one batch. Then form a plan
and execute.

# When things go wrong

If a tool fails, read the error carefully. Diagnose the root cause before
retrying:
- File not found → check the actual path with glob
- Edit failed (no match) → re-read the file to see current content
- Build failed → read the error details, fix the specific issue, try again

Do not retry the identical call. Do not give up after one failure. Try a
different approach. Only tell the user you're stuck after you've investigated
and exhausted alternatives.

If a tool call was denied by the user, do not re-execute it. Explain what you
were trying to do and ask how they'd like to proceed.

# Finishing work

After making changes, verify them: re-read edited files to confirm correctness,
run `npm run build` to confirm it compiles, and run the game and look at it to
see the change. Do not claim success without checking.

# Parallel & batch calls

When multiple tool calls are independent, make them ALL in a single response.
Only sequence calls that depend on prior results:
- Independent: multiple read, glob, grep calls
- Sequential: create a file → then edit it (it must exist first)

# 3D assets

Unless the user requests otherwise, use `.gltf` format when making 3D assets.

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
