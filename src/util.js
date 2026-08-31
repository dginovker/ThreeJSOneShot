import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// Deterministic layout: decor should land in the same place every reload so a
// composition that looks good stays looking good.
export function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export const damp = (dt, rate) => 1 - Math.exp(-rate * dt);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Models ship at ~2 units per tile; the game works in 1-unit tiles. */
export const MODEL_SCALE = 0.5;

export function prepare(model, { scale = MODEL_SCALE, shadow = true } = {}) {
  model.scale.setScalar(scale);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = shadow;
    o.receiveShadow = shadow;
    // Pack materials are doubleSided; single-sided halves the shadow cost and
    // removes the interior faces that show through at grazing angles.
    o.material = o.material.clone();
    o.material.side = THREE.FrontSide;
  });
  return model;
}

/** Tints every material of a model and gives it emissive punch for the bloom pass. */
export function glow(model, color, intensity) {
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.material.emissive = new THREE.Color(color);
    o.material.emissiveIntensity = intensity;
  });
  return model;
}

/**
 * Object3D.clone() copies a SkinnedMesh by reference to the SOURCE skeleton, so
 * every copy renders wherever the original sits — at the origin, here. Always
 * clone through SkeletonUtils, which rebinds bones to the copy.
 */
export const cloneModel = (model) => skeletonClone(model);
