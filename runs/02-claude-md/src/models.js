import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
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

/** Resolves to the whole glTF, so callers can reach `.animations`. */
export async function loadGltf(name) {
  return loader.loadAsync(modelUrl(name));
}

/** Resolves to a fresh THREE.Group. Rejects on a bad name or a failed fetch. */
export async function loadModel(name) {
  return (await loadGltf(name)).scene;
}

/** loadModels(['Bee', 'Cube_Bricks']) -> { Bee: Group, Cube_Bricks: Group } */
export async function loadModels(names) {
  const loaded = await Promise.all(names.map(loadModel));
  return Object.fromEntries(names.map((n, i) => [n, loaded[i]]));
}

/** loadGltfs(['Bee']) -> { Bee: gltf } */
export async function loadGltfs(names) {
  const loaded = await Promise.all(names.map(loadGltf));
  return Object.fromEntries(names.map((n, i) => [n, loaded[i]]));
}

/**
 * Copy of a loaded model that is safe to place in the scene. Skinned meshes
 * need SkeletonUtils; Object3D.clone() would leave every copy bound to the
 * first skeleton and they would all animate as one.
 */
export function instance(model) {
  let skinned = false;
  model.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
  return skinned ? cloneSkinned(model) : model.clone();
}
