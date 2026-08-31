import * as THREE from 'three';
import { spawn, eachMaterial, ownMaterials } from './assets.js';
import { buildIsland, makeRng, fadeIntoDistance } from './island.js';

export const PALETTE = {
  top: 0x1a52a8,
  mid: 0x57a2e2,
  horizon: 0xa6d2ee,
  deep: 0xefb079,
  sun: 0xffeeb8,
  fog: 0x9cc6e6,
};

export const SUN_DIR = new THREE.Vector3(-0.42, 0.72, 0.55).normalize();

function skyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(PALETTE.top) },
      uMid: { value: new THREE.Color(PALETTE.mid) },
      uHorizon: { value: new THREE.Color(PALETTE.horizon) },
      uDeep: { value: new THREE.Color(PALETTE.deep) },
      uSun: { value: new THREE.Color(PALETTE.sun) },
      uSunDir: { value: SUN_DIR.clone() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uTop, uMid, uHorizon, uDeep, uSun, uSunDir;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = mix(uDeep, uHorizon, smoothstep(-0.55, -0.14, h));
        c = mix(c, uMid, smoothstep(-0.16, 0.04, h));
        c = mix(c, uTop, smoothstep(0.04, 0.62, h));
        float d = max(dot(vDir, uSunDir), 0.0);
        c += uSun * (pow(d, 400.0) * 1.4 + pow(d, 24.0) * 0.10);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 20), mat);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  return dome;
}

function cloudSet(rng, { count, xFrom, xTo, yFrom, yTo, z, scale, drift, tint, opacity = 1 }) {
  const group = new THREE.Group();
  const items = [];
  for (let i = 0; i < count; i++) {
    const c = spawn(`Cloud_${1 + ((rng() * 3) | 0)}`, { shadow: false, receive: false });
    const s = scale * (0.7 + rng() * 0.7);
    c.scale.set(s, s * (0.75 + rng() * 0.5), s);
    c.position.set(xFrom + rng() * (xTo - xFrom), yFrom + rng() * (yTo - yFrom), z + (rng() - 0.5) * 26);
    c.rotation.y = rng() * Math.PI * 2;
    ownMaterials(c);
    eachMaterial(c, (m) => {
      m.color.lerp(new THREE.Color(tint), 0.55);
      m.emissive = new THREE.Color(tint);
      m.emissiveIntensity = 0.35;
      m.roughness = 1;
      if (opacity < 1) {
        m.transparent = true;
        m.opacity = opacity;
        m.depthWrite = false;
      }
    });
    group.add(c);
    items.push({ obj: c, speed: drift * (0.55 + rng() * 0.9), bob: rng() * Math.PI * 2, y0: c.position.y });
  }
  return {
    group,
    update(t, dt) {
      for (const it of items) {
        it.obj.position.x += it.speed * dt;
        if (it.obj.position.x > xTo) it.obj.position.x = xFrom;
        it.obj.position.y = it.y0 + Math.sin(t * 0.3 + it.bob) * 0.9;
      }
    },
  };
}

/** Sky, light, clouds, parallax islands and the foreground fringe. */
export class World {
  constructor(scene, { levelSpan }) {
    const rng = makeRng(20250831);
    this.updaters = [];

    scene.fog = new THREE.Fog(PALETTE.fog, 110, 400);
    this.dome = skyDome();
    scene.add(this.dome);

    scene.add(new THREE.HemisphereLight(0xbcdcff, 0xffab63, 0.75));

    this.sun = new THREE.DirectionalLight(0xffeec6, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.blurSamples = 12;
    this.sun.shadow.radius = 3;
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);

    // Cool counter-light so the shadowed side reads as sky-lit, not black.
    const rim = new THREE.DirectionalLight(0x9ec6ff, 0.45);
    rim.position.set(24, 12, -22);
    scene.add(rim);

    const [x0, x1] = [-140, levelSpan + 160];

    for (const layer of [
      { z: -60, count: 16, scale: 2.6, drift: 0.9, y: [14, 52], tint: 0xffffff, op: 1 },
      { z: -130, count: 18, scale: 4.2, drift: 0.6, y: [-6, 60], tint: 0xf3f9ff, op: 1 },
      { z: -230, count: 16, scale: 7, drift: 0.35, y: [-40, 70], tint: 0xe6f2fd, op: 1 },
      // Haze slabs below the islands: the "low fog" that sells the altitude.
      { z: -70, count: 14, scale: 11, drift: 0.5, y: [-56, -26], tint: 0xffffff, op: 0.25, flat: true },
    ]) {
      const set = cloudSet(rng, {
        count: layer.count, xFrom: x0, xTo: x1, yFrom: layer.y[0], yTo: layer.y[1],
        z: layer.z, scale: layer.scale, drift: layer.drift, tint: layer.tint, opacity: layer.op,
      });
      if (layer.flat) set.group.scale.y = 0.32;
      scene.add(set.group);
      this.updaters.push(set.update);
    }

    this.#backdrop(scene, rng, levelSpan);
    this.#foreground(scene, rng, levelSpan);
  }

  #backdrop(scene, rng, levelSpan) {
    for (const layer of [
      { z: -66, scale: 1.5, fade: 0.3, step: 62, y: [-18, 12], trees: 3 },
      { z: -140, scale: 2.6, fade: 0.55, step: 96, y: [-34, 26], trees: 4 },
      { z: -250, scale: 4.4, fade: 0.78, step: 170, y: [-56, 40], trees: 3 },
    ]) {
      for (let x = -160; x < levelSpan + 200; x += layer.step * (0.6 + rng() * 0.8)) {
        const island = buildIsland(3 + ((rng() * 4) | 0), {
          rng, depth: 2, trees: layer.trees, decor: true,
        });
        fadeIntoDistance(island, PALETTE.fog, layer.fade);
        island.scale.setScalar(layer.scale);
        island.position.set(x, layer.y[0] + rng() * (layer.y[1] - layer.y[0]), layer.z + (rng() - 0.5) * 30);
        scene.add(island);
      }
    }
  }

  // Kept at a fixed offset below the camera so the fringe always frames the
  // bottom of the shot, whatever height the player is at.
  #foreground(scene, rng, levelSpan) {
    const group = new THREE.Group();
    const names = ['Grass_2', 'Grass_3', 'Grass_1', 'Grass_2', 'Grass_3', 'Bush'];
    for (let x = -60; x < levelSpan + 90; x += 3.5 + rng() * 6) {
      const name = names[(rng() * names.length) | 0];
      const o = spawn(name, { shadow: false, receive: false });
      const s = (name === 'Bush' ? 0.5 : 1.5) * (0.8 + rng() * 0.8);
      o.scale.set(s, s * (0.9 + rng() * 0.6), s);
      // Grass blades sit a tile above their own origin; offset so the tufts,
      // not the empty space beneath them, are what fringes the frame.
      const originLift = name.startsWith('Grass') ? -0.95 * s : 0;
      o.position.set(x, originLift + (rng() - 0.5) * 1.2, 9 + rng() * 5);
      o.rotation.y = rng() * Math.PI * 2;
      group.add(o);
    }
    ownMaterials(group);
    eachMaterial(group, (m) => {
      m.color.multiplyScalar(0.3);
      m.roughness = 1;
      m.fog = false;
    });
    scene.add(group);
    this.foreground = group;
  }

  update(t, dt, camera) {
    this.dome.position.copy(camera.position);
    this.foreground.position.y = camera.position.y - 9.5;
    for (const u of this.updaters) u(t, dt);
  }

  /** Keep the shadow frustum tight around the action instead of the whole level. */
  followSun(focus) {
    this.sun.position.copy(focus).addScaledVector(SUN_DIR, 70);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();
  }
}
