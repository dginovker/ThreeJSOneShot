import * as THREE from 'three';
import { loadModels, instance } from './models.js';

const SLOT = 46;   // px between hearts
const MARGIN = 34;

/**
 * The HUD is a second, orthographic scene drawn over the game with the same
 * renderer, so the hearts and the key are the real pack models rather than
 * flat icons. Text stays in the DOM where it stays crisp.
 */
export async function createUI() {
  const M = await loadModels(['Heart', 'Heart_Outline', 'Key']);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -100, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 2.2));
  const lamp = new THREE.DirectionalLight(0xffffff, 2.4);
  lamp.position.set(1, 2, 3);
  scene.add(lamp);

  const hearts = [];
  for (let i = 0; i < 3; i++) {
    const group = new THREE.Group();
    const full = instance(M.Heart);
    const outline = instance(M.Heart_Outline);
    outline.position.z = 1;
    group.add(full, outline);
    group.position.set(MARGIN + i * SLOT, -MARGIN, 0);
    group.scale.setScalar(24);
    scene.add(group);
    hearts.push({ group, full, beat: 0 });
  }

  const keyIcon = instance(M.Key);
  keyIcon.scale.setScalar(22);
  keyIcon.visible = false;
  scene.add(keyIcon);

  const coinEl = document.getElementById('coins');
  const msgEl = document.getElementById('msg');
  const bannerEl = document.getElementById('banner');
  const hintEl = document.getElementById('hint');
  if (!coinEl || !msgEl || !bannerEl || !hintEl) {
    throw new Error('index.html is missing one of #coins, #msg, #banner, #hint');
  }

  let filled = 3;
  let msgTimer = 0;
  let lastMsg = '';
  let popTimer = 0;
  let time = 0;

  setTimeout(() => hintEl.classList.add('gone'), 6000);

  function resize(w, h) {
    camera.left = 0;
    camera.right = w;
    camera.top = 0;
    camera.bottom = -h;
    camera.updateProjectionMatrix();
    keyIcon.position.set(MARGIN + 3 * SLOT + 14, -MARGIN, 0);
  }

  return {
    resize,
    setHearts(n, max) {
      filled = n;
      for (let i = 0; i < hearts.length; i++) {
        const on = i < n;
        if (hearts[i].full.visible && !on) hearts[i].beat = 1;
        hearts[i].full.visible = on;
        hearts[i].group.visible = i < max;
      }
    },
    setCoins(n, total) {
      coinEl.textContent = `${n} / ${total}`;
    },
    setKey(on) {
      keyIcon.visible = on;
    },
    pop() {
      popTimer = 0.22;
    },
    message(text, ms) {
      if (text === lastMsg && msgTimer > 0) return;
      lastMsg = text;
      msgEl.textContent = text;
      msgEl.classList.add('on');
      msgTimer = ms / 1000;
    },
    win(coins, total) {
      bannerEl.innerHTML =
        `<h1>Summit Reached</h1><p>${coins} of ${total} treasure — ` +
        `${coins === total ? 'every last shard.' : 'the sky keeps the rest.'}</p>` +
        `<p class="sub">Refresh to fly it again</p>`;
      bannerEl.classList.add('on');
    },
    update(dt) {
      time += dt;
      msgTimer -= dt;
      if (msgTimer <= 0) msgEl.classList.remove('on');

      popTimer = Math.max(0, popTimer - dt);
      coinEl.style.transform = `scale(${1 + popTimer * 1.1})`;

      for (let i = 0; i < hearts.length; i++) {
        const h = hearts[i];
        h.beat = Math.max(0, h.beat - dt * 2);
        // The last heart breathes, so being one hit from a checkpoint reset is
        // visible without reading anything.
        const low = filled === 1 && i === 0 ? 1 + Math.sin(time * 7) * 0.09 : 1;
        h.group.scale.setScalar(24 * low * (1 + h.beat * 0.35));
        h.group.rotation.y = Math.sin(time * 1.6 + i) * 0.22;
      }
      keyIcon.rotation.y = time * 2.4;
    },
    render(renderer) {
      renderer.clearDepth();
      renderer.render(scene, camera);
    },
  };
}
