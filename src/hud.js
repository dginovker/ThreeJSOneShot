import * as THREE from 'three';
import { loadModels } from './models.js';
import { prepare, damp } from './util.js';

const MAX_HEARTS = 3;

/**
 * Rendered as a second orthographic pass over the finished frame, so the health
 * pips are the same art as the pickups instead of a separate 2D style.
 */
export async function buildHud() {
  const m = await loadModels(['Heart', 'Heart_Outline']);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
  scene.add(new THREE.AmbientLight(0xffffff, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(1, 2, 3);
  scene.add(key);

  const hearts = [];
  for (let i = 0; i < MAX_HEARTS; i++) {
    const holder = new THREE.Group();
    const full = prepare(m.Heart.clone(), { scale: 1, shadow: false });
    const empty = prepare(m.Heart_Outline.clone(), { scale: 1, shadow: false });
    full.traverse((o) => { if (o.isMesh) { o.material.emissive = new THREE.Color(0xff2f55); o.material.emissiveIntensity = 0.5; } });
    empty.traverse((o) => { if (o.isMesh) { o.material.color.set(0x2b3550); o.material.emissiveIntensity = 0; } });
    empty.position.z = -0.06; // keep the outline behind the fill so they never z-fight
    holder.add(empty, full);
    scene.add(holder);
    hearts.push({ holder, full, pop: 0, wasFull: true });
  }

  const counters = document.createElement('div');
  counters.id = 'counters';
  document.body.appendChild(counters);

  let shownCoins = 0;

  return {
    layout(w, h) {
      // Ortho units == pixels, origin top-left, so the row pins to the corner.
      camera.left = 0; camera.right = w; camera.top = 0; camera.bottom = -h;
      camera.updateProjectionMatrix();
      const size = Math.max(26, Math.min(46, w * 0.032));
      hearts.forEach((x, i) => {
        x.holder.position.set(28 + size * 0.75 + i * size * 1.7, -30 - size * 0.6, 0);
        x.base = size;
      });
    },

    update(dt, t, state) {
      hearts.forEach((x, i) => {
        const isFull = i < state.hearts;
        if (x.wasFull && !isFull) x.pop = 1;
        x.wasFull = isFull;
        x.full.visible = isFull;
        x.pop = Math.max(0, x.pop - dt * 2.5);
        const beat = isFull && i === state.hearts - 1 ? 1 + Math.sin(t * 6) * 0.05 : 1;
        x.holder.scale.setScalar(x.base * beat * (1 + x.pop * 0.6));
        x.holder.rotation.y = Math.sin(t * 1.4 + i) * 0.25;
      });

      shownCoins += (state.coins - shownCoins) * damp(dt, 12);
      const html =
        `<span class="pip coin">●</span>${String(Math.round(shownCoins)).padStart(2, '0')}` +
        `<span class="pip gem">◆</span>${state.gems}/${state.gemsTotal}` +
        (state.hasKey ? `<span class="pip key">⚷</span>` : '');
      if (html !== this.lastHtml) counters.innerHTML = (this.lastHtml = html);
    },

    render(renderer) {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.autoClear = true;
    },
  };
}
