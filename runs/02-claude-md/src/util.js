import * as THREE from 'three';

/** Frame-rate independent exponential smoothing. k is "how fast", in 1/seconds. */
export const damp = (current, target, k, dt) => current + (target - current) * (1 - Math.exp(-k * dt));

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Deterministic RNG so the level's scatter looks the same on every load. */
export function makeRng(seed) {
  let s = seed >>> 0;
  return (lo = 0, hi = 1) => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return lo + (s / 4294967296) * (hi - lo);
  };
}

export const pick = (rng, arr) => arr[Math.floor(rng(0, arr.length)) % arr.length];

const _box = new THREE.Box3();
export const boxOf = (obj) => _box.setFromObject(obj).clone();

/**
 * Highest point of `obj` that a raycast from above actually hits, sampled across
 * its footprint. Bounding boxes lie about these rock islands (jagged spires on
 * the underside, a bevelled rim on top), so the standing height comes from the
 * geometry itself.
 */
export function measureTopY(obj, samples = 5) {
  obj.updateMatrixWorld(true);
  const box = boxOf(obj);
  const ray = new THREE.Raycaster();
  ray.far = 1000;
  let top = -Infinity;
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      const x = lerp(box.min.x, box.max.x, (i + 0.5) / samples);
      const z = lerp(box.min.z, box.max.z, (j + 0.5) / samples);
      ray.set(new THREE.Vector3(x, box.max.y + 10, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(obj, true)[0];
      if (hit) top = Math.max(top, hit.point.y);
    }
  }
  if (top === -Infinity) {
    throw new Error(`measureTopY hit nothing on "${obj.name || 'model'}" — is it empty geometry?`);
  }
  return top;
}

/** Surface height of `obj` directly above one point, in the object's own space. */
export function topAt(obj, x, z) {
  obj.updateMatrixWorld(true);
  const box = boxOf(obj);
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x, box.max.y + 10, z),
    new THREE.Vector3(0, -1, 0)
  );
  const hit = ray.intersectObject(obj, true)[0];
  if (!hit) throw new Error(`topAt(${x}, ${z}) missed "${obj.name || 'model'}" entirely.`);
  return hit.point.y;
}

/** Shadows + a touch of extra roughness, applied once to a loaded prototype. */
export function prepare(root, { cast = true, receive = true } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = cast;
    o.receiveShadow = receive;
  });
  return root;
}

/** Per-instance material edits need their own copy; clones share by default. */
export function cloneMaterials(root, edit) {
  const seen = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.material;
    let copy = seen.get(src);
    if (!copy) {
      copy = src.clone();
      edit(copy);
      seen.set(src, copy);
    }
    o.material = copy;
  });
  return root;
}

/** Axis-aligned overlap test in the XY plane the whole game lives in. */
export const overlaps = (a, b) =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
