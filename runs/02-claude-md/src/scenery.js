import * as THREE from 'three';
import { loadModels, instance } from './models.js';

export const HORIZON = 0xe4dfd0;

// Vertical gradient painted into a texture and used as scene.background: the
// sky then fills the frame at any camera angle without a skydome to light or
// keep in front of the far plane.
function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d').createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, '#1f5fa8');
  g.addColorStop(0.35, '#59a8dd');
  g.addColorStop(0.7, '#a9d8ee');
  g.addColorStop(0.86, '#eccb96');
  g.addColorStop(1.0, '#f0a765');
  const ctx = c.getContext('2d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function softSprite(color, opacity) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  return new THREE.SpriteMaterial({ map: tex, color, opacity, transparent: true, depthWrite: false });
}

export function setShadow(obj, cast, receive) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = cast;
    o.receiveShadow = receive;
  });
}

export function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x6b5340, 1.15));

  const sun = new THREE.DirectionalLight(0xffe6bd, 2.6);
  sun.position.set(14, 24, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 3;
  sun.shadow.blurSamples = 12;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.03;
  const s = sun.shadow.camera;
  s.left = -26; s.right = 26; s.top = 26; s.bottom = -26; s.near = 1; s.far = 90;
  s.updateProjectionMatrix();
  scene.add(sun, sun.target);

  // Cool bounce from the sky behind the play plane keeps the shadowed side of
  // every model readable instead of flat black.
  const rim = new THREE.DirectionalLight(0x9fc9ff, 0.9);
  rim.position.set(-18, 6, -14);
  scene.add(rim);

  return sun;
}

const CLOUD_LANES = [
  { z: -22, scale: 1.5, y: 21, speed: 0.5, count: 7 },
  { z: -55, scale: 1.7, y: 31, speed: 0.3, count: 8 },
  { z: -100, scale: 2.6, y: 42, speed: 0.16, count: 7 },
  { z: 14, scale: 2.0, y: -15, speed: 0.7, count: 5 },
];

const SPAN = 190; // x range the drifting/parallax dressing is spread over

export async function buildScenery(scene, sun) {
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(HORIZON, 60, 210);

  const m = await loadModels([
    'Cloud_1', 'Cloud_2', 'Cloud_3', 'Tree', 'Tree_Fruit', 'Bush',
    'RockPlatforms_1', 'RockPlatforms_2', 'RockPlatforms_3',
    'RockPlatforms_Large', 'RockPlatforms_Medium', 'RockPlatform_Tall',
    'Grass_1', 'Grass_2', 'Grass_3', 'Plant_Small', 'Rock_1',
  ]);
  const clouds = [m.Cloud_1, m.Cloud_2, m.Cloud_3];
  const rocks = [m.RockPlatforms_1, m.RockPlatforms_2, m.RockPlatforms_3, m.RockPlatforms_Large];

  const drifting = [];
  for (const lane of CLOUD_LANES) {
    for (let i = 0; i < lane.count; i++) {
      const cloud = instance(clouds[i % clouds.length]);
      cloud.scale.setScalar(lane.scale * (0.75 + Math.random() * 0.5));
      cloud.rotation.y = Math.random() * Math.PI * 2;
      cloud.position.set(
        -SPAN / 2 + (i + Math.random()) * (SPAN / lane.count),
        lane.y + (Math.random() - 0.5) * 8,
        lane.z + (Math.random() - 0.5) * 6
      );
      cloud.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.emissive = new THREE.Color(0xdfefff);
        o.material.emissiveIntensity = 0.35;
        o.material.roughness = 1;
      });
      drifting.push({ obj: cloud, speed: lane.speed * (0.7 + Math.random() * 0.6) });
      scene.add(cloud);
    }
  }

  // Background islands. There is no parallax code: they simply sit further
  // back, and a perspective camera tracking the player does the rest.
  const layers = [
    { z: -52, scale: 1.6, count: 5, y: -34, trees: true },
    { z: -84, scale: 2.5, count: 5, y: -26, trees: true },
    { z: -135, scale: 4.2, count: 4, y: -12, trees: false },
  ];
  for (const layer of layers) {
    for (let i = 0; i < layer.count; i++) {
      const island = new THREE.Group();
      const rock = instance(rocks[(i + layer.count) % rocks.length]);
      island.add(rock);
      if (layer.trees) {
        for (let t = 0; t < 2 + ((i * 3) % 2); t++) {
          const tree = instance(t % 2 ? m.Tree : m.Tree_Fruit);
          tree.position.set((t - 1) * 2.4 + Math.random(), 3.2, (Math.random() - 0.5) * 2);
          tree.scale.setScalar(0.5 + Math.random() * 0.25);
          island.add(tree);
        }
        const bush = instance(m.Bush);
        bush.position.set(2.6, 3.1, 0.6);
        bush.scale.setScalar(0.5);
        island.add(bush);
      }
      island.scale.setScalar(layer.scale);
      island.position.set(
        -SPAN / 3 + (i + Math.random() * 0.4) * (SPAN / layer.count),
        layer.y + (Math.random() - 0.5) * 14,
        layer.z + (Math.random() - 0.5) * 8
      );
      island.rotation.y = Math.random() * Math.PI * 2;
      scene.add(island);
      drifting.push({ obj: island, speed: -0.06 * layer.scale });
    }
  }

  // Low mist: a few huge soft sprites under the islands so the drop reads as
  // depth rather than as an empty void.
  const mistMat = softSprite(0xffffff, 0.26);
  for (let i = 0; i < 14; i++) {
    const mist = new THREE.Sprite(mistMat);
    mist.scale.set(60 + Math.random() * 50, 22 + Math.random() * 14, 1);
    mist.position.set(-SPAN / 2 + Math.random() * SPAN * 1.4, -16 - Math.random() * 22, -20 - Math.random() * 60);
    scene.add(mist);
    drifting.push({ obj: mist, speed: 0.22 + Math.random() * 0.3 });
  }

  const foreground = { grass: [m.Grass_1, m.Grass_2, m.Grass_3], plant: m.Plant_Small, rock: m.Rock_1, bush: m.Bush };

  function update(dt, camX) {
    for (const d of drifting) {
      d.obj.position.x += d.speed * dt;
      const rel = d.obj.position.x - camX;
      if (rel > SPAN / 2) d.obj.position.x -= SPAN;
      if (rel < -SPAN / 2) d.obj.position.x += SPAN;
    }
    sun.position.set(camX + 14, 24, 16);
    sun.target.position.set(camX, 0, 0);
    sun.target.updateMatrixWorld();
  }

  return { update, foreground };
}

/**
 * The foreground band. It hangs off the camera rather than the world so it
 * always frames the bottom of the shot, and slides at its own rate to read as
 * the nearest parallax layer.
 */
export function addForegroundGrass(camera, foreground) {
  const SPACING = 0.85;
  const COUNT = 56;
  const LOOP = SPACING * 2;
  const group = new THREE.Group();
  group.position.set(0, -4.15, -11);
  camera.add(group);

  for (let i = 0; i < COUNT; i++) {
    const r = Math.random();
    const src = r < 0.66
      ? foreground.grass[(Math.random() * 3) | 0]
      : r < 0.86 ? foreground.plant : foreground.rock;
    const tuft = instance(src);
    tuft.position.set((i - COUNT / 2) * SPACING + (Math.random() - 0.5), -Math.random() * 1.4, (Math.random() - 0.5) * 2.5);
    tuft.scale.setScalar(0.65 + Math.random() * 0.6);
    tuft.rotation.y = Math.random() * Math.PI * 2;
    // Darkened to a near-silhouette: the foreground band is there to frame the
    // action, not to compete with it for attention.
    tuft.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.material = o.material.clone();
      o.material.color.multiplyScalar(0.45);
    });
    group.add(tuft);
  }

  return (camX) => {
    // Wrapped so the strip never runs out, while still sliding past the world.
    group.position.x = -(((camX * 0.45) % LOOP) + LOOP) % LOOP;
  };
}
