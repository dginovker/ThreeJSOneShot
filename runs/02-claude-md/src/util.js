import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

/**
 * Always clone loaded models with this. Object3D.clone() leaves the copy's
 * SkinnedMeshes bound to the *original* skeleton, so every copy of an animated
 * model draws on top of the original at the world origin, ignoring wherever
 * you positioned it. Works on static models too.
 */
export const cloneModel = clone;

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

/**
 * Bounds of a model that has not been rendered yet. Box3.setFromObject asks a
 * SkinnedMesh for its bounds, and those come from bone matrices the renderer
 * only fills in on the first frame — so an unrendered animated model measures
 * as garbage unless the skeleton is pushed through by hand first.
 */
function measure(obj) {
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    o.computeBoundingBox();
  });
  return _box.setFromObject(obj);
}

/**
 * Wraps a model in a group whose origin is the model's bottom-centre (or true
 * centre), uniformly scaled so its height/width matches. Quaternius models each
 * come with their own arbitrary pivot; without this every placement is a guess.
 */
export function anchor(obj, { height, width, centered = false } = {}) {
  if (!height && !width) throw new Error('anchor(): pass height and/or width');
  measure(obj);
  _box.getSize(_size);
  if (_size.y === 0 || _size.x === 0) throw new Error('anchor(): model has zero extent');
  // Given both, the model fits inside the box — a squat, wide prop scaled by
  // height alone ends up absurdly wide.
  const s = Math.min(height ? height / _size.y : Infinity, width ? width / _size.x : Infinity);
  obj.scale.multiplyScalar(s);
  _box.getCenter(_center).multiplyScalar(s);
  obj.position.set(-_center.x, centered ? -_center.y : -_box.min.y * s, -_center.z);
  const g = new THREE.Group();
  g.add(obj);
  return g;
}

/** Non-uniform fit into a w×h footprint, anchored at bottom-centre. */
export function fitBox(obj, w, h) {
  measure(obj);
  _box.getSize(_size);
  obj.scale.set(w / _size.x, h / _size.y, Math.min(w / _size.x, h / _size.y));
  _box.getCenter(_center).multiply(obj.scale);
  obj.position.set(-_center.x, -_box.min.y * obj.scale.y, -_center.z);
  const g = new THREE.Group();
  g.add(obj);
  return g;
}

export function shadows(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return obj;
}

/** Makes every material in a subtree glow, so bloom picks it up. */
export function emissive(obj, color, intensity = 0.6) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.emissive = new THREE.Color(color);
    o.material.emissiveIntensity = intensity;
  });
  return obj;
}

export const lerp = (a, b, t) => a + (b - a) * t;
/** Frame-rate independent exponential smoothing. */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
