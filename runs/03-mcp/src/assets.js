import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { loadGltf } from './models.js';

const cache = new Map();

export async function preload(names) {
  const unique = [...new Set(names)];
  const gltfs = await Promise.all(unique.map(loadGltf));
  unique.forEach((name, i) => {
    const gltf = gltfs[i];
    // The pack ships flat-colour PBR with no maps; nudging every material once
    // here keeps the whole level reading as one lit set.
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.material.roughness = Math.min(o.material.roughness ?? 1, 0.85);
      o.material.flatShading = false;
    });
    cache.set(name, gltf);
  });
}

function gltfOf(name) {
  const gltf = cache.get(name);
  if (!gltf) throw new Error(`Model "${name}" is not preloaded. Add it to PRELOAD in src/assets.js.`);
  return gltf;
}

/** A fresh instance. Skinned hierarchies are cloned with their skeleton intact. */
export function spawn(name, { shadow = true, receive = true } = {}) {
  const obj = skeletonClone(gltfOf(name).scene);
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = shadow;
    o.receiveShadow = receive;
  });
  return obj;
}

export function clips(name) {
  return gltfOf(name).animations;
}

export function clip(name, clipName) {
  const found = clips(name).find((c) => c.name === clipName);
  if (!found) {
    throw new Error(
      `Model "${name}" has no clip "${clipName}". Available: ${clips(name).map((c) => c.name).join(', ')}`
    );
  }
  return found;
}

/** Detach an instance's materials so it can be tinted without hitting siblings. */
export function ownMaterials(obj) {
  const seen = new Map();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const copy = seen.get(o.material) ?? o.material.clone();
    seen.set(o.material, copy);
    o.material = copy;
  });
  return [...seen.values()];
}

export function eachMaterial(obj, fn) {
  const seen = new Set();
  obj.traverse((o) => {
    if (!o.isMesh || seen.has(o.material)) return;
    seen.add(o.material);
    fn(o.material, o);
  });
}
