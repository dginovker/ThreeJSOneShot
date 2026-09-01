import * as THREE from 'three';
import { loadGltf, loadModels } from './models.js';
import { anchor, cloneModel, fitBox, shadows, emissive } from './util.js';

// y is the walkable surface; the rock hangs below it. Gaps are sized to be
// clearable with a full jump (peak 2.4 units, ~6 units of travel).
const PLATFORMS = [
  { x: 4, y: 0, w: 14, deco: 'start' },
  { x: 17, y: 1.2, w: 6 },
  { x: 25, y: 2.6, w: 6 },
  { x: 34, y: 1.0, w: 7, deco: 'tree' },
  { x: 45, y: 1.0, w: 8, deco: 'rocks' },
  { x: 56, y: 1.0, w: 8 },
  { x: 68, y: 2.0, w: 9, deco: 'tree' },
  { x: 79, y: 2.0, w: 7 },
  { x: 97, y: 2.0, w: 10, deco: 'rocks' },
  { x: 99, y: 7.5, w: 6 },
  { x: 112, y: 2.0, w: 20, deco: 'garden' },
];

const COINS = [
  [13, 2.4], [14.5, 3.0], [16, 2.6],
  [21.5, 3.2], [23, 4.0],
  [29, 4.6], [31, 4.2],
  [38.5, 3.2], [40, 3.6], [41.5, 3.2],
  [45, 5.6], [46.5, 6.2], [48, 5.6],
  [50.5, 3.0], [52, 3.4],
  [61.5, 3.0], [63, 3.6],
  [66, 4.2], [68, 4.6], [70, 4.2],
  [74, 4.0], [76, 4.4],
  [85, 4.2], [87, 4.6], [89, 4.2],
  [93.5, 6.5], [93.5, 8.5],
  [107, 3.6], [109, 4.2], [111, 3.6],
];

const GEMS = [
  { x: 25, y: 4.2, model: 'Gem_Green', color: '#6cff9e' },
  { x: 56, y: 2.9, model: 'Gem_Blue', color: '#7fd0ff' },
  { x: 99, y: 9.0, model: 'Gem_Pink', color: '#ff8fd8' },
];

const BRIDGE = { x0: 82.5, x1: 92, y: 2.0, planks: 7 };
const LEVER = { x: 81, y: 2.0 };
const DOOR = { x: 104, y: 2.0 };
const KEY = { x: 99, y: 8.6 };
const FLAG = { x: 119, y: 2.0 };
const BOUNCERS = [{ x: 9.5, y: 0 }, { x: 51.5, y: 1.0 }, { x: 93.5, y: 2.0 }];
const SAWS = [
  { x: 45, y: 1.85, span: 3.2, speed: 0.7 },
  { x: 56, y: 1.85, span: 3.2, speed: 0.95, phase: 1.6 },
];
const BEES = [
  { x: 68, y: 4.8, span: 4.0, speed: 0.5 },
  { x: 110, y: 4.6, span: 5.0, speed: 0.7, phase: 2.1 },
];

export const LEVEL_LENGTH = 128;
export const SPAWN = new THREE.Vector3(3, 1.2, 0);
/** Reached from the left, each checkpoint becomes the respawn point. */
export const CHECKPOINTS = [
  { x: 0, pos: new THREE.Vector3(3, 1.2, 0) },
  { x: 42, pos: new THREE.Vector3(43, 2.2, 0) },
  { x: 64, pos: new THREE.Vector3(65, 3.2, 0) },
  { x: 93, pos: new THREE.Vector3(94, 3.2, 0) },
  { x: 105, pos: new THREE.Vector3(106, 3.2, 0) },
];

const rand = (a, b) => a + Math.random() * (b - a);

function solid(x, y, w, h) {
  return { x, y, w, h, active: true, minX: x - w / 2, maxX: x + w / 2, minY: y - h, maxY: y };
}
function syncSolid(s) {
  s.minX = s.x - s.w / 2;
  s.maxX = s.x + s.w / 2;
  s.minY = s.y - s.h;
  s.maxY = s.y;
}

export async function buildLevel(scene) {
  const [m, beeGltf] = await Promise.all([loadModels([
    'RockPlatforms_Large', 'RockPlatforms_Medium', 'RockPlatforms_2', 'RockPlatform_Tall',
    'Coin', 'Gem_Green', 'Gem_Blue', 'Gem_Pink', 'Key', 'Heart',
    'Bouncer', 'Lever', 'Bridge_Modular', 'Door', 'Goal_Flag',
    'Hazard_Saw', 'Tree', 'Bush', 'Grass_1', 'Grass_2', 'Rock_1', 'Rock_2', 'Fence_1',
  ]), loadGltf('Bee')]);

  const root = new THREE.Group();
  scene.add(root);
  const solids = [];
  const bobs = [];

  // --- platforms -----------------------------------------------------------
  // One rock shape for every platform: the multi-boulder models read as
  // several separate rocks and hide where the walkable surface actually is.
  const rockFor = () => m.RockPlatforms_Large;
  for (const p of PLATFORMS) {
    const thickness = 2.4 + p.w * 0.12;
    const g = new THREE.Group();
    const rock = fitBox(cloneModel(rockFor()), p.w, thickness);
    rock.position.y = -thickness;
    g.add(rock);
    g.position.set(p.x, p.y, 0);
    shadows(g);
    root.add(g);

    const s = solid(p.x, p.y, p.w, thickness);
    solids.push(s);
    bobs.push({ obj: g, solid: s, y0: p.y, amp: rand(0.07, 0.16), speed: rand(0.28, 0.5), phase: rand(0, 6.28) });

    decorate(g, p, m);
  }

  // --- pickups -------------------------------------------------------------
  const coinProto = emissive(anchor(m.Coin, { height: 0.85, centered: true }), '#ffa219', 0.85);
  shadows(coinProto, true, false);
  const coins = COINS.map(([x, y]) => {
    const obj = cloneModel(coinProto);
    obj.position.set(x, y, 0);
    root.add(obj);
    return { obj, x, y, taken: false, phase: x * 0.7 };
  });

  const gems = GEMS.map((g) => {
    const obj = emissive(anchor(m[g.model], { height: 1.0, centered: true }), g.color, 1.4);
    obj.position.set(g.x, g.y, 0);
    shadows(obj, true, false);
    const light = new THREE.PointLight(new THREE.Color(g.color), 4, 7, 2);
    obj.add(light);
    root.add(obj);
    return { obj, light, x: g.x, y: g.y, taken: false, phase: g.x };
  });

  const key = {
    obj: emissive(anchor(m.Key, { height: 0.7, centered: true }), '#ffdf6b', 1.1),
    x: KEY.x, y: KEY.y, taken: false,
  };
  key.obj.position.set(KEY.x, KEY.y, 0);
  shadows(key.obj, true, false);
  root.add(key.obj);

  // --- bouncers ------------------------------------------------------------
  const bouncers = BOUNCERS.map((b) => {
    const obj = anchor(cloneModel(m.Bouncer), { height: 1.1 });
    obj.position.set(b.x, b.y, 0);
    shadows(obj);
    root.add(obj);
    return { obj, x: b.x, y: b.y, squash: 0 };
  });

  // --- lever + bridge ------------------------------------------------------
  const lever = {
    obj: anchor(m.Lever, { height: 1.3 }),
    x: LEVER.x, y: LEVER.y, on: false,
  };
  lever.obj.position.set(LEVER.x, LEVER.y, 0);
  lever.obj.rotation.y = Math.PI;
  shadows(lever.obj);
  root.add(lever.obj);

  const plankW = (BRIDGE.x1 - BRIDGE.x0) / BRIDGE.planks;
  const bridge = { planks: [], solid: solid((BRIDGE.x0 + BRIDGE.x1) / 2, BRIDGE.y, BRIDGE.x1 - BRIDGE.x0, 0.6), t: 0, built: false };
  bridge.solid.active = false;
  solids.push(bridge.solid);
  for (let i = 0; i < BRIDGE.planks; i++) {
    const obj = fitBox(cloneModel(m.Bridge_Modular), plankW * 1.02, 0.7);
    obj.position.set(BRIDGE.x0 + plankW * (i + 0.5), BRIDGE.y, 0);
    obj.scale.setScalar(0.001);
    obj.visible = false;
    shadows(obj);
    root.add(obj);
    bridge.planks.push(obj);
  }

  // --- locked door ---------------------------------------------------------
  const door = { obj: anchor(m.Door, { height: 4.2 }), x: DOOR.x, y: DOOR.y, open: false, t: 0 };
  door.obj.position.set(DOOR.x, DOOR.y, 0);
  shadows(door.obj);
  root.add(door.obj);
  door.solid = solid(DOOR.x, DOOR.y + 4.2, 1.4, 4.2);
  solids.push(door.solid);

  // --- hazards -------------------------------------------------------------
  const saws = SAWS.map((s) => {
    const obj = anchor(cloneModel(m.Hazard_Saw), { height: 1.7, centered: true });
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.metalness = 0.6;
      o.material.roughness = 0.35;
      o.material.color.lerp(new THREE.Color('#e2e9f2'), 0.75);
    });
    shadows(obj, true, false);
    root.add(obj);
    return { obj, ...s, phase: s.phase ?? 0, r: 0.75 };
  });

  const flying = THREE.AnimationClip.findByName(beeGltf.animations, 'Flying');
  if (!flying) throw new Error('Bee is missing the "Flying" animation clip');
  const bees = BEES.map((b) => {
    const rig = cloneModel(beeGltf.scene);
    const obj = anchor(rig, { height: 1.1 });
    const mixer = new THREE.AnimationMixer(rig);
    mixer.clipAction(flying).play();
    shadows(obj, true, false);
    root.add(obj);
    return { obj, mixer, ...b, phase: b.phase ?? 0, alive: true, dieT: 0, r: 0.75 };
  });

  // --- goal ----------------------------------------------------------------
  const flag = { obj: anchor(m.Goal_Flag, { height: 3.4 }), x: FLAG.x, y: FLAG.y, raised: false };
  flag.obj.position.set(FLAG.x, FLAG.y, 0);
  emissive(flag.obj, '#ffb43c', 0.5);
  const flagGlow = new THREE.PointLight(0xffc457, 6, 12, 2);
  flagGlow.position.set(0, 2.6, 0);
  flag.obj.add(flagGlow);
  shadows(flag.obj);
  root.add(flag.obj);

  function update(dt, t) {
    for (const b of bobs) {
      b.obj.position.y = b.y0 + Math.sin(t * b.speed + b.phase) * b.amp;
      b.solid.y = b.obj.position.y;
      syncSolid(b.solid);
    }
    for (const c of coins) {
      if (c.taken) continue;
      c.obj.rotation.y = t * 3 + c.phase;
      c.obj.position.y = c.y + Math.sin(t * 2.4 + c.phase) * 0.12;
    }
    for (const g of gems) {
      if (g.taken) continue;
      const pulse = 0.85 + Math.sin(t * 3 + g.phase) * 0.15;
      g.obj.scale.setScalar(pulse);
      g.obj.rotation.y = t * 1.2;
      g.obj.position.y = g.y + Math.sin(t * 1.8 + g.phase) * 0.18;
      g.light.intensity = 3 + Math.sin(t * 3 + g.phase) * 1.8;
    }
    if (!key.taken) {
      key.obj.rotation.y = t * 2;
      key.obj.position.y = key.y + Math.sin(t * 2.2) * 0.15;
    }
    for (const b of bouncers) {
      b.squash = Math.max(0, b.squash - dt * 4);
      const s = 1 + b.squash * 0.5;
      b.obj.scale.set(1 + b.squash * 0.3, 1 / s, 1 + b.squash * 0.3);
    }
    for (const s of saws) {
      const sweep = Math.sin(t * s.speed + s.phase);
      s.obj.position.set(s.x + sweep * s.span, s.y + Math.abs(sweep) * 0.25, 0);
      s.obj.rotation.z = -t * 9;
    }
    for (const b of bees) {
      b.mixer.update(dt);
      if (!b.alive) {
        b.dieT += dt;
        b.obj.position.y -= dt * 6;
        b.obj.rotation.z += dt * 8;
        b.obj.visible = b.dieT < 1.2;
        continue;
      }
      const sweep = Math.sin(t * b.speed + b.phase);
      b.obj.position.set(b.x + sweep * b.span, b.y + Math.sin(t * 2 + b.phase) * 0.35, 0);
      b.obj.rotation.y = sweep > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    if (lever.on) lever.obj.rotation.z = THREE.MathUtils.lerp(lever.obj.rotation.z, -0.9, dt * 8);
    if (bridge.built && bridge.t < 1) {
      bridge.t = Math.min(1, bridge.t + dt * 0.9);
      bridge.planks.forEach((p, i) => {
        const local = THREE.MathUtils.clamp(bridge.t * bridge.planks.length - i, 0, 1);
        p.visible = local > 0;
        // Overshoot on arrival: each plank slams into place instead of easing in.
        const e = local < 1 ? 1.25 * local : 1 + Math.sin((local - 1) * 8) * 0;
        p.scale.setScalar(Math.max(0.001, e));
        p.position.y = BRIDGE.y + (1 - local) * 3;
      });
      if (bridge.t >= 1) bridge.planks.forEach((p) => p.scale.setScalar(1));
    }
    if (door.open && door.t < 1) {
      door.t = Math.min(1, door.t + dt * 0.8);
      door.obj.position.y = DOOR.y - door.t * 4.4;
      door.obj.rotation.y = door.t * 0.5;
      if (door.t > 0.05) door.solid.active = false;
    }
    flagGlow.intensity = 5 + Math.sin(t * 2.5) * 2;
    if (flag.raised) {
      flag.obj.rotation.y += dt * 3;
      flag.obj.position.y = FLAG.y + Math.abs(Math.sin(t * 4)) * 0.4;
    }
  }

  function openBridge() {
    if (bridge.built) return false;
    bridge.built = true;
    bridge.solid.active = true;
    lever.on = true;
    return true;
  }

  return { root, solids, coins, gems, key, bouncers, lever, bridge, door, saws, bees, flag, update, openBridge };
}

function decorate(parent, p, m) {
  const props = [];
  if (p.deco === 'start') props.push('Fence_1', 'Grass_1', 'Bush', 'Grass_2');
  if (p.deco === 'tree') props.push('Tree', 'Grass_1', 'Bush');
  if (p.deco === 'rocks') props.push('Rock_1', 'Rock_2', 'Grass_2');
  if (p.deco === 'garden') props.push('Tree', 'Bush', 'Grass_1', 'Grass_2', 'Rock_1');
  const tufts = ['Grass_1', 'Grass_2'];
  for (let i = 0; i < Math.round(p.w / 2.5); i++) props.push(tufts[i % 2]);

  for (const name of props) {
    const big = name === 'Tree';
    const h = big ? rand(3.4, 4.4) : rand(0.5, 1.1);
    const o = anchor(cloneModel(m[name]), { height: h, width: h * 1.5 });
    o.position.set(rand(-0.42, 0.42) * p.w, 0, rand(-1.6, -0.6));
    o.rotation.y = rand(0, Math.PI * 2);
    shadows(o, true, false);
    parent.add(o);
  }
}
