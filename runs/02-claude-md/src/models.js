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

/** Full glTF payload — use when you need `.animations` alongside the scene. */
export async function loadGltf(name) {
  return loader.loadAsync(modelUrl(name));
}

/** Resolves to a fresh THREE.Group. Rejects on a bad name or a failed fetch. */
export async function loadModel(name) {
  const gltf = await loadGltf(name);
  return gltf.scene;
}

/** loadModels(['Bee', 'Cube_Bricks']) -> { Bee: Group, Cube_Bricks: Group } */
export async function loadModels(names) {
  const loaded = await Promise.all(names.map(loadModel));
  return Object.fromEntries(names.map((n, i) => [n, loaded[i]]));
}
