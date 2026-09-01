import * as THREE from 'three';
import { loadModels } from './models.js';
import { anchor, cloneModel, damp } from './util.js';

const MAX_HEARTS = 3;

/**
 * Hearts are real models rendered in a second orthographic pass on top of the
 * finished frame, so they light and shade like the rest of the game.
 */
export async function makeHud(renderer) {
  const m = await loadModels(['Heart', 'Heart_Outline']);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 40);
  camera.position.set(0, 0, 12);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x66507a, 2.2));
  const key = new THREE.DirectionalLight(0xfff0d0, 2.4);
  key.position.set(2, 3, 6);
  scene.add(key);

  const hearts = [];
  for (let i = 0; i < MAX_HEARTS; i++) {
    const slot = new THREE.Group();
    const full = anchor(cloneModel(m.Heart), { height: 0.8, centered: true });
    const empty = anchor(cloneModel(m.Heart_Outline), { height: 0.8, centered: true });
    empty.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.color.setHex(0x53324a);
      o.material.emissive = new THREE.Color(0x000000);
    });
    slot.add(full, empty);
    slot.position.x = i * 1.05;
    scene.add(slot);
    hearts.push({ slot, full, empty, shown: 1, pop: 0 });
  }

  let health = MAX_HEARTS;

  function layout() {
    // Pin hearts to the top-left in a 1-unit-per-heart space.
    const aspect = innerWidth / innerHeight;
    const h = 9;
    camera.top = h / 2; camera.bottom = -h / 2;
    camera.left = -h * aspect / 2; camera.right = h * aspect / 2;
    camera.updateProjectionMatrix();
    hearts.forEach((x, i) => x.slot.position.set(camera.left + 1.0 + i * 1.05, camera.top - 2.4, 0));
  }
  layout();
  addEventListener('resize', layout);

  function update(dt, t) {
    hearts.forEach((x, i) => {
      const want = i < health ? 1 : 0;
      if (want === 0 && x.shown > 0.5) x.pop = 1;
      x.shown = damp(x.shown, want, 10, dt);
      x.pop = Math.max(0, x.pop - dt * 2.5);
      const beat = i < health ? 1 + Math.sin(t * 3 + i) * 0.05 : 1;
      x.full.scale.setScalar(Math.max(0.001, x.shown * beat * (1 + x.pop * 0.6)));
      x.full.visible = x.shown > 0.02;
      x.full.rotation.y = Math.sin(t * 1.2 + i * 0.5) * 0.35;
      x.empty.rotation.y = x.full.rotation.y;
      x.empty.scale.setScalar(1 + x.pop * 0.3);
    });
  }

  function render() {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, camera);
    renderer.autoClear = true;
  }

  return {
    update, render,
    get health() { return health; },
    set health(v) { health = Math.max(0, Math.min(MAX_HEARTS, v)); },
    MAX_HEARTS,
  };
}
