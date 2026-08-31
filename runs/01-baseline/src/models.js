import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MODEL_PATHS } from './models.generated.js';

export const MODEL_NAMES = Object.keys(MODEL_PATHS);

export function modelUrl(name) {
  const path = MODEL_PATHS[name];
  if (!path) {
    const near = MODEL_NAMES.filter((n) => n.toLowerCase().includes(name.toLowerCase()));
    throw new Error(
      `Unknown model "${name}".` +
        (near.length ? ` Did you mean: ${near.slice(0, 5).join(', ')}?` : ` See MODEL_NAMES.`)
    );
  }
  return `${import.meta.env.BASE_URL}models/${path}`;
}

const loader = new GLTFLoader();

/** Resolves to a fresh THREE.Group. Rejects on a bad name or a failed fetch. */
export async function loadModel(name) {
  return (await loadGLTF(name)).scene;
}

/** Same, but keeps the parsed gltf so callers can reach `.animations`. */
export async function loadGLTF(name) {
  return loader.loadAsync(modelUrl(name));
}

/** loadModels(['Bee', 'Cube_Bricks']) -> { Bee: Group, Cube_Bricks: Group } */
export async function loadModels(names) {
  const loaded = await Promise.all(names.map(loadModel));
  return Object.fromEntries(names.map((n, i) => [n, loaded[i]]));
}

/** loadGLTFs(['Bee']) -> { Bee: gltf } — for models whose clips you need. */
export async function loadGLTFs(names) {
  const loaded = await Promise.all(names.map(loadGLTF));
  return Object.fromEntries(names.map((n, i) => [n, loaded[i]]));
}
