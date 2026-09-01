import * as THREE from 'three';
import { damp, makeRng, pick, cloneMaterials, measureTopY } from './util.js';

export const SKY = {
  zenith: new THREE.Color(0x1c5fc4),
  mid: new THREE.Color(0x74c2ec),
  horizon: new THREE.Color(0xffcd93),
  haze: new THREE.Color(0xcfe0ec),
};

/**
 * An inside-out sphere big enough that the level never reaches it, so the sky
 * reads as unbounded no matter how far the player falls.
 */
export function makeSkyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: SKY.zenith },
      mid: { value: SKY.mid },
      horizon: { value: SKY.horizon },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 zenith, mid, horizon;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        // The camera only ever sees roughly h in [-0.35, 0.35], so the whole
        // gradient is packed into that band; spread out it reads as flat cream.
        vec3 c = mix(horizon, mid, smoothstep(-0.10, 0.07, h));
        c = mix(c, zenith, smoothstep(0.05, 0.30, h));
        c = mix(c, vec3(0.62, 0.40, 0.28), smoothstep(-0.02, -0.34, h));
        // A warm flare just above the horizon, where the sun sits.
        c += vec3(0.20, 0.12, 0.02) * exp(-abs(h - 0.01) * 22.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), mat);
  dome.frustumCulled = false;
  return dome;
}

export function makeLights(scene) {
  scene.add(new THREE.HemisphereLight(0xbfe0ff, 0xffcf9a, 1.15));

  const sun = new THREE.DirectionalLight(0xffe6bd, 2.6);
  sun.position.set(-24, 34, 26);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.06;
  sun.shadow.radius = 3.5;
  const c = sun.shadow.camera;
  c.left = -26; c.right = 26; c.top = 26; c.bottom = -26; c.near = 1; c.far = 130;
  scene.add(sun, sun.target);

  // A dim cool bounce from the sky below the islands keeps undersides readable.
  const bounce = new THREE.DirectionalLight(0x8fb6ff, 0.5);
  bounce.position.set(14, -18, 10);
  scene.add(bounce);

  return sun;
}

/**
 * Distant islands. Each layer sits at its own z and is pushed back toward the
 * haze colour, so depth comes from atmosphere as well as from parallax.
 */
export function makeParallax(scene, assets) {
  const rng = makeRng(0xb00b5);
  const layers = [];

  const specs = [
    { z: -100, count: 8, scale: 1.9, tint: 0.32, y: [-26, -2], trees: 2 },
    { z: -175, count: 8, scale: 2.9, tint: 0.54, y: [-38, 6], trees: 2 },
    { z: -290, count: 7, scale: 4.4, tint: 0.74, y: [-52, 14], trees: 1 },
  ];

  const rocks = ['RockPlatforms_Large', 'RockPlatforms_2', 'RockPlatforms_3', 'RockPlatforms_Medium'];

  for (const spec of specs) {
    const group = new THREE.Group();
    group.position.z = spec.z;
    for (let i = 0; i < spec.count; i++) {
      const island = new THREE.Group();
      const rock = assets[pick(rng, rocks)].clone();
      const top = measureTopY(rock);
      rock.position.y = -top;
      island.add(rock);

      for (let t = 0; t < spec.trees; t++) {
        const tree = assets[rng() < 0.35 ? 'Tree_Fruit' : 'Tree'].clone();
        tree.position.set(rng(-2.4, 2.4), 0, rng(-1.5, 1.5));
        tree.scale.setScalar(rng(0.5, 0.8));
        tree.rotation.y = rng(0, 6.28);
        island.add(tree);
      }
      island.position.set(rng(-40, 440), rng(spec.y[0], spec.y[1]), rng(-14, 14));
      island.scale.setScalar(spec.scale * rng(0.75, 1.15));
      island.userData.bob = { phase: rng(0, 6.28), amp: rng(0.5, 1.4) * spec.scale, baseY: island.position.y };
      group.add(island);
    }
    cloneMaterials(group, (m) => {
      m.color.lerp(SKY.haze, spec.tint);
      m.roughness = 1;
      m.metalness = 0;
      if (m.emissive) m.emissive.setHex(0x000000);
    });
    group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    scene.add(group);
    // 0 = locked to the camera (infinitely far), 1 = moves with the world.
    layers.push({ group, factor: 1 - spec.z / -380 });
  }
  return layers;
}

export function makeClouds(scene, assets) {
  const rng = makeRng(0x51dee);
  const group = new THREE.Group();

  const add = (spec) => {
    const cloud = cloneMaterials(assets[pick(rng, spec.kinds)].clone(), (m) => {
      m.color.set(0xffffff);
      m.emissive?.setHex(0x8fb0cc);
      m.emissiveIntensity = 0.12;
      m.transparent = true;
      m.opacity = spec.opacity;
      m.roughness = 1;
      m.depthWrite = false;
    });
    cloud.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    cloud.userData.drift = rng(spec.drift[0], spec.drift[1]);
    group.add(cloud);
    return cloud;
  };

  for (let i = 0; i < 26; i++) {
    const c = add({ kinds: ['Cloud_1', 'Cloud_2', 'Cloud_3'], opacity: 0.9, drift: [0.5, 2.2] });
    c.position.set(rng(-60, 460), rng(-32, 30), rng(-185, -34));
    c.scale.setScalar(rng(1.6, 5.2));
  }
  // A thin bank sliding through the gaps between islands, close enough to read
  // as mist rather than sky, so the drop always looks like a long way down.
  for (let i = 0; i < 11; i++) {
    const c = add({ kinds: ['Cloud_2', 'Cloud_3'], opacity: 0.5, drift: [1.4, 3.2] });
    c.position.set(rng(-60, 460), rng(-17, 0), rng(-34, -15));
    c.scale.set(rng(3, 5.5), rng(1, 1.8), rng(2, 4));
  }
  scene.add(group);
  return group;
}

/**
 * Grass and plants between the camera and the level. It rides along with the
 * camera in y so the frame always has a soft bottom edge, and gets its depth
 * from simply being closer than everything else.
 */
export function makeForeground(scene, assets) {
  const rng = makeRng(0xf0f0f0);
  const group = new THREE.Group();
  const kinds = ['Grass_1', 'Grass_2', 'Grass_3', 'Plant_Large', 'Plant_Small'];
  for (let i = 0; i < 300; i++) {
    const blade = assets[pick(rng, kinds)].clone();
    const z = rng(9, 17);
    blade.position.set(rng(-80, 480), -1.8 - (z - 9) * 0.4 + rng(-0.5, 0.5), z);
    blade.scale.setScalar(rng(0.8, 1.5));
    blade.rotation.y = rng(0, 6.28);
    blade.userData.sway = rng(0, 6.28);
    group.add(blade);
  }
  cloneMaterials(group, (m) => {
    m.color.multiplyScalar(0.66).lerp(new THREE.Color(0x35506e), 0.34);
    m.roughness = 1;
    m.metalness = 0;
  });
  group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  scene.add(group);
  return group;
}

export function updateBackdrop(t, dt, { layers, clouds, foreground, camX, camY }) {
  for (const { group, factor } of layers) {
    group.position.x = camX * (1 - factor);
    for (const island of group.children) {
      const b = island.userData.bob;
      island.position.y = b.baseY + Math.sin(t * 0.28 + b.phase) * b.amp;
      island.rotation.y = Math.sin(t * 0.06 + b.phase) * 0.08;
    }
  }
  for (const cloud of clouds.children) {
    cloud.position.x += cloud.userData.drift * dt;
    if (cloud.position.x > 480) cloud.position.x = -80;
  }
  foreground.position.y = damp(foreground.position.y, camY, 3, dt);
  for (const blade of foreground.children) {
    blade.rotation.z = Math.sin(t * 1.3 + blade.userData.sway) * 0.06;
  }
}
