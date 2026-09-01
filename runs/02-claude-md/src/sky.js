import * as THREE from 'three';
import { loadModels } from './models.js';
import { anchor, cloneModel, shadows } from './util.js';

export const SKY = {
  zenith: new THREE.Color('#1e56b4'),
  middle: new THREE.Color('#79b3ea'),
  horizon: new THREE.Color('#f6c48a'),
};

/** Inverted sphere with a three-stop vertical gradient. */
export function skyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: SKY.zenith },
      middle: { value: SKY.middle },
      horizon: { value: SKY.horizon },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 zenith, middle, horizon;
      varying vec3 vPos;
      void main() {
        float h = clamp(normalize(vPos).y * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = mix(horizon, middle, smoothstep(0.40, 0.56, h));
        c = mix(c, zenith, smoothstep(0.55, 1.0, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 24), mat);
  dome.frustumCulled = false;
  return dome;
}

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * Background dressing: the dome, two parallax bands of tree-topped islands, a
 * drifting cloud field and a foreground grass fringe.
 */
export async function buildSky(scene, levelLength) {
  const m = await loadModels([
    'Cloud_1', 'Cloud_2', 'Cloud_3',
    'RockPlatforms_Large', 'RockPlatforms_Medium', 'RockPlatforms_1',
    'Tree', 'Tree_Fruit', 'Bush', 'Grass_1', 'Grass_2', 'Grass_3',
  ]);

  scene.add(skyDome());

  const layers = [];
  const addLayer = (z, parallax) => {
    const g = new THREE.Group();
    g.position.z = z;
    scene.add(g);
    layers.push({ group: g, parallax });
    return g;
  };

  // Far band: hazy, big, barely moves. Near band: crisper, moves more.
  // Both bands sit below the play line: looking down on distant land is what
  // sells "you are very high up".
  const bands = [
    { layer: addLayer(-150, 0.70), count: 10, scale: [13, 20], tint: 0.88, y: [-40, -2] },
    { layer: addLayer(-70, 0.42), count: 12, scale: [6, 11], tint: 0.72, y: [-34, -8] },
  ];
  const rocks = ['RockPlatforms_Large', 'RockPlatforms_Medium'];
  const haze = new THREE.Color('#bcd8f5');

  for (const b of bands) {
    for (let i = 0; i < b.count; i++) {
      const island = new THREE.Group();
      const rock = anchor(cloneModel(m[rocks[i % rocks.length]]), { width: rand(...b.scale) });
      island.add(rock);
      const treeCount = Math.random() < 0.75 ? 1 + Math.floor(Math.random() * 2) : 0;
      for (let t = 0; t < treeCount; t++) {
        const tree = anchor(cloneModel(Math.random() < 0.5 ? m.Tree : m.Tree_Fruit), {
          height: rand(0.5, 0.9) * b.scale[0],
        });
        tree.position.set(rand(-1, 1) * b.scale[0] * 0.22, 0, rand(-1, 1));
        island.add(tree);
      }
      island.position.set(rand(-40, levelLength + 40), rand(...b.y), rand(-25, 25));
      island.rotation.y = rand(-0.5, 0.5);
      island.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.color.lerp(haze, b.tint);
        o.material.fog = true;
      });
      b.layer.add(island);
    }
  }

  const clouds = [];
  const cloudModels = [m.Cloud_1, m.Cloud_2, m.Cloud_3];
  const cloudLayer = addLayer(-70, 0.34);
  for (let i = 0; i < 24; i++) {
    const c = anchor(cloneModel(cloudModels[i % 3]), { width: rand(8, 22), centered: true });
    c.position.set(rand(-50, levelLength + 50), rand(-30, 34), rand(-60, 20));
    c.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      // Flat, slightly-under-white so a cloud reads as vapour without
      // tripping the bloom threshold and blowing out the whole frame.
      o.material.color.setHex(0xe8f1ff);
      o.material.transparent = true;
      o.material.opacity = 0.9;
      o.material.roughness = 1;
      o.material.fog = true;
    });
    cloudLayer.add(c);
    clouds.push({ obj: c, speed: rand(0.25, 0.9) });
  }

  // Foreground fringe: sits between the camera and the action, blurred by
  // nothing but its own scale — it sells the depth on every jump.
  const fg = new THREE.Group();
  fg.position.z = 6.0;
  scene.add(fg);
  const tufts = [m.Grass_1, m.Grass_2, m.Grass_3, m.Bush];
  for (let i = 0; i < 70; i++) {
    const t = anchor(cloneModel(tufts[i % tufts.length]), { height: rand(0.9, 1.9) });
    t.position.set(rand(-20, levelLength + 20), rand(-4.2, -2.6), rand(-2, 2.5));
    t.rotation.y = rand(0, Math.PI * 2);
    t.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.color.multiplyScalar(0.42);
      o.material.fog = false;
    });
    shadows(t, false, false);
    fg.add(t);
  }

  const cloudSpan = levelLength + 80;
  return function update(dt, cameraX) {
    for (const c of clouds) {
      c.obj.position.x += c.speed * dt;
      if (c.obj.position.x > levelLength + 40) c.obj.position.x -= cloudSpan;
    }
    for (const l of layers) l.group.position.x = cameraX * l.parallax;
  };
}
