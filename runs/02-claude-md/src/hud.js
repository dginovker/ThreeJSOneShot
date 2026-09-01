import * as THREE from 'three';
import { damp } from './util.js';

const SLOTS = 3;
const SCALE = 0.115;

/**
 * The hearts are real models rendered in their own orthographic overlay pass,
 * so they catch the same warm key light as the level instead of looking pasted on.
 */
export class Hud {
  constructor(assets) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a5a70, 2.2));
    const key = new THREE.DirectionalLight(0xffe9c9, 2.4);
    key.position.set(-1, 2, 3);
    this.scene.add(key);

    this.slots = [];
    for (let i = 0; i < SLOTS; i++) {
      const group = new THREE.Group();
      const outline = assets.Heart_Outline.clone();
      const fill = assets.Heart.clone();
      outline.scale.setScalar(1.12);
      group.add(outline, fill);
      group.rotation.z = (i % 2 ? 1 : -1) * 0.07;
      this.scene.add(group);
      this.slots.push({ group, fill, pop: 0 });
    }

    this.health = SLOTS;
    this.layout(1);
  }

  layout(aspect) {
    this.camera.left = -aspect;
    this.camera.right = aspect;
    this.camera.updateProjectionMatrix();
    this.slots.forEach(({ group }, i) => {
      group.position.set(-aspect + 0.17 + i * 0.21, 0.83, 0);
    });
  }

  setHealth(n) {
    for (let i = n; i < this.health; i++) this.slots[i].pop = 1;
    for (let i = this.health; i < n; i++) this.slots[i].pop = 1;
    this.health = n;
  }

  update(dt, t) {
    this.slots.forEach((slot, i) => {
      const filled = i < this.health;
      slot.fill.visible = filled;
      slot.pop = damp(slot.pop, 0, 9, dt);
      const beat = filled ? 1 + Math.sin(t * 3 + i * 0.5) * 0.03 : 0.92;
      slot.group.scale.setScalar(SCALE * beat * (1 + slot.pop * 0.55));
    });
  }

  render(renderer) {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }
}
