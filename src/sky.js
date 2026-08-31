import * as THREE from 'three';
import { loadModels } from './models.js';
import { prepare, rng, MODEL_SCALE } from './util.js';

export const SKY_TOP = new THREE.Color(0x1f63cf);
export const SKY_MID = new THREE.Color(0x74bdf0);
export const SKY_HORIZON = new THREE.Color(0xffcf94);
export const SKY_BELOW = new THREE.Color(0x74a6d4);
const ROCK_WARM = new THREE.Color(0xa88a6b);

const VERT = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Three stops with a deliberately tight warm band. A wide horizon blend mixes
// warm into blue across the whole visible strip and the sky reads as grey haze.
const FRAG = `
  uniform vec3 uTop, uMid, uHorizon, uBottom;
  varying vec3 vDir;
  void main() {
    float h = vDir.y;
    vec3 c = mix(uHorizon, uMid, smoothstep(-0.02, 0.09, h));
    c = mix(c, uTop, smoothstep(0.05, 0.6, h));
    c = mix(c, uBottom, smoothstep(0.0, -0.5, h));
    gl_FragColor = vec4(c, 1.0);
  }
`;

export function buildSkyDome(scene) {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(600, 32, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: SKY_TOP },
        uMid: { value: SKY_MID },
        uHorizon: { value: SKY_HORIZON },
        uBottom: { value: SKY_BELOW },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    })
  );
  dome.renderOrder = -1;
  scene.add(dome);
  return dome;
}

/**
 * Everything behind the play plane. Depth alone does the parallax — a perspective
 * camera tracking the player already moves far layers less than near ones.
 */
export async function buildBackdrop(scene, levelSpan) {
  const m = await loadModels([
    'RockPlatforms_Large', 'RockPlatforms_Medium', 'RockPlatforms_1', 'RockPlatforms_2',
    'RockPlatform_Tall', 'Tree', 'Tree_Fruit', 'Cloud_1', 'Cloud_2', 'Cloud_3',
  ]);
  const rocks = ['RockPlatforms_Large', 'RockPlatforms_Medium', 'RockPlatforms_1', 'RockPlatforms_2', 'RockPlatform_Tall'];
  const trees = ['Tree', 'Tree_Fruit'];

  const group = new THREE.Group();
  scene.add(group);
  const drifters = [];
  const r = rng(20260830);

  // Three depth bands. Further back = bigger, hazier, lower contrast.
  const LAYERS = [
    // Sunk below the play plane so the backdrop frames the islands from beneath
    // instead of crowding them at eye level.
    { z: -34, count: 5, scale: 1.4, tint: 0.12, yMin: -20, ySpan: 15 },
    { z: -62, count: 8, scale: 3.2, tint: 0.32, yMin: -26, ySpan: 26 },
    { z: -112, count: 9, scale: 5.5, tint: 0.58, yMin: -38, ySpan: 44 },
  ];

  for (const layer of LAYERS) {
    for (let i = 0; i < layer.count; i++) {
      const island = prepare(m[rocks[(r() * rocks.length) | 0]].clone(), {
        scale: MODEL_SCALE * layer.scale * (0.7 + r() * 0.6),
        shadow: false,
      });
      island.position.set(
        (levelSpan[0] - 20) + r() * (levelSpan[1] - levelSpan[0] + 50),
        layer.yMin + r() * layer.ySpan,
        layer.z + (r() - 0.5) * 12
      );
      island.rotation.y = r() * Math.PI * 2;

      // Only the nearest band gets trees; further out they'd be sub-pixel noise.
      if (layer.z > -70) {
        const n = 1 + ((r() * 3) | 0);
        for (let t = 0; t < n; t++) {
          const tree = prepare(m[trees[(r() * 2) | 0]].clone(), { scale: MODEL_SCALE * (0.5 + r() * 0.4), shadow: false });
          tree.position.set((r() - 0.5) * 4, 3.4, (r() - 0.5) * 3);
          island.add(tree);
        }
      }

      // Fade toward the horizon colour so the bands read as distance.
      island.traverse((o) => {
        if (o.isMesh) o.material.color.lerp(ROCK_WARM, 0.35).lerp(SKY_MID, layer.tint);
      });

      group.add(island);
      drifters.push({ obj: island, y0: island.position.y, amp: 0.3 + r() * 0.5, speed: 0.15 + r() * 0.2, phase: r() * 9 });
    }
  }

  const clouds = [];
  const cloudNames = ['Cloud_1', 'Cloud_2', 'Cloud_3'];
  const xMin = levelSpan[0] - 60;
  const xSpan = levelSpan[1] - levelSpan[0] + 140;
  for (let i = 0; i < 26; i++) {
    const cloud = prepare(m[cloudNames[(r() * 3) | 0]].clone(), { scale: MODEL_SCALE * (2 + r() * 5), shadow: false });
    cloud.position.set(xMin + r() * xSpan, -10 + r() * 34, -14 - r() * 90);
    cloud.traverse((o) => {
      if (!o.isMesh) return;
      o.material.color.set(0xffffff).lerp(SKY_MID, 0.1 + r() * 0.25);
      o.material.transparent = true;
      o.material.opacity = 0.55 + r() * 0.4;
      o.material.depthWrite = false;
    });
    group.add(cloud);
    clouds.push({ obj: cloud, speed: 0.25 + r() * 0.7 });
  }

  return {
    update(dt, t) {
      for (const d of drifters) d.obj.position.y = d.y0 + Math.sin(t * d.speed + d.phase) * d.amp;
      for (const c of clouds) {
        c.obj.position.x += c.speed * dt;
        if (c.obj.position.x > xMin + xSpan) c.obj.position.x = xMin;
      }
    },
  };
}
