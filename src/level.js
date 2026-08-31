import * as THREE from 'three';
import { loadModels, loadGLTFs } from './models.js';
import { prepare, glow, rng, cloneModel, MODEL_SCALE } from './util.js';

// Islands are laid out left to right; `top` is the walkable surface height.
export const ISLANDS = [
  { x0: -4, x1: 8, top: 0, decor: 'lush' },
  { x0: 11.5, x1: 18, top: 1, decor: 'light' },
  { x0: 21, x1: 27, top: 2.5, decor: 'light' },
  { x0: 28, x1: 36, top: 7.5, decor: 'lush' },
  { x0: 40, x1: 49, top: 3.5, decor: 'light' },
  { x0: 55, x1: 66, top: 3.5, decor: 'lush' },
  { x0: 70, x1: 80, top: 3.5, decor: 'lush' },
];

export const SPAN = [ISLANDS[0].x0, ISLANDS.at(-1).x1];
export const START = new THREE.Vector3(-1, 0.2, 0);
export const KILL_Y = -22;

const COINS = [
  ...arc(8.8, 0.9, 10.8, 2.4), ...arc(19, 2.0, 21, 3.6),
  [14, 2.9], [15.5, 2.9], [24.5, 3.7],
  [31, 8.7], [33, 8.7], [35, 8.7],
  [41, 4.7], [43, 5.4], [45, 4.7],
  [50, 5.0], [51.5, 5.4], [53, 5.0],
  [57, 4.7], [58.5, 5.2], [60, 4.7],
  ...arc(66.5, 4.6, 69.5, 6.2),
  [73, 4.7], [75, 4.7],
];

// A shallow lob of coins over a gap reads as "this jump is the intended line".
function arc(x0, y0, x1, y1) {
  const out = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 1.1]);
  }
  return out;
}

const GEMS = [
  { pos: [30.5, 9.2], model: 'Gem_Green', color: 0x4dff9e, value: 5 },
  { pos: [33, 10.2], model: 'Gem_Pink', color: 0xff5ec4, value: 5 },
  { pos: [35.5, 9.2], model: 'Gem_Blue', color: 0x53c9ff, value: 5 },
  { pos: [62.5, 5.6], model: 'Gem_Pink', color: 0xff5ec4, value: 5 },
];

const BOUNCERS = [{ x: 24.5, y: 2.5, power: 20 }];

const SAWS = [
  // Vertical on the starter island: you wait and walk under it. A horizontal
  // sweeper here would have to be jumped, and a full-speed jump carries you off
  // the island's far edge into the gap.
  { from: [5.5, 0.4], to: [5.5, 3.8], period: 3.4 },
  { from: [57.5, 4.3], to: [61.5, 4.3], period: 3.6 },
  { from: [66.6, 2.0], to: [69.4, 2.0], period: 3.0 },
];

// Low enough that a jump from the platform lands feet-first on the bee.
const BEES = [{ x0: 41, x1: 48, y: 4.6 }];

const BRIDGE = { x0: 49, x1: 55, y: 3.5, planks: 6 };
const LEVER = { x: 47.5, y: 3.5 };
const KEY = { x: 33, y: 9.6 };
const DOOR = { x: 63.5, y: 3.5 };
const FLAG = { x: 76, y: 3.5 };

const EARTH = new THREE.Color(0x7a5233);

const NEEDED = [
  'Cube_Grass_1x1End', 'Cube_Grass_1x1Center', 'Cube_Dirt_1x1End', 'Cube_Dirt_1x1Center',
  'Tree', 'Tree_Fruit', 'Bush', 'Bush_Fruit', 'Rock_1', 'Rock_2',
  'Grass_1', 'Grass_2', 'Grass_3', 'Plant_Small', 'Plant_Large',
  'Coin', 'Gem_Blue', 'Gem_Green', 'Gem_Pink', 'Key',
  'Hazard_Saw', 'Bridge_Modular', 'Bridge_Modular_Center',
  'Door', 'Goal_Flag',
];

// These carry the clips the level plays back, so they need the whole gltf.
const ANIMATED = ['Bouncer', 'Lever', 'Bee'];

export async function buildLevel(scene) {
  const m = await loadModels(NEEDED);
  const anim = await loadGLTFs(ANIMATED);
  const r = rng(31337);
  const root = new THREE.Group();
  scene.add(root);

  const solids = [];   // {minX,maxX,minY,maxY} in world space
  const platforms = []; // drifting island groups, each owning one solid

  for (const spec of ISLANDS) platforms.push(makeIsland(root, solids, m, r, spec));

  const coins = COINS.map(([x, y]) => makePickup(root, cloneModel(m.Coin), x, y, 0xffc23d, 1.2, false));
  const gems = GEMS.map((g) => {
    const p = makePickup(root, cloneModel(m[g.model]), g.pos[0], g.pos[1], g.color, 1.6, true);
    p.value = g.value;
    return p;
  });

  const mixers = [];
  // One helper for every prop that ships with clips: clone, rig a mixer, expose
  // play(name) so the level logic never touches AnimationAction bookkeeping.
  const animated = (name, scale = MODEL_SCALE) => {
    const gltf = anim[name];
    const obj = prepare(cloneModel(gltf.scene), { scale });
    const mixer = new THREE.AnimationMixer(obj);
    mixers.push(mixer);
    const actions = Object.fromEntries(gltf.animations.map((c) => [c.name, mixer.clipAction(c)]));
    let current = null;
    const play = (clip, { once = false, fade = 0.2 } = {}) => {
      const next = actions[clip];
      if (!next) throw new Error(`${name} has no clip "${clip}"; got ${Object.keys(actions).join(', ')}`);
      if (current === clip) return;
      if (current) actions[current].fadeOut(fade);
      next.reset();
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
      next.clampWhenFinished = once;
      next.fadeIn(fade).play();
      current = clip;
    };
    root.add(obj);
    return { obj, play, mixer };
  };

  const bouncers = BOUNCERS.map((b) => {
    const a = animated('Bouncer');
    a.obj.position.set(b.x, b.y, 0);
    a.play('Bouncer_Idle');
    return { ...b, ...a, cooldown: 0 };
  });

  const saws = SAWS.map((s) => {
    const obj = prepare(cloneModel(m.Hazard_Saw), { shadow: false });
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.material.color.lerp(new THREE.Color(0xd8443a), 0.28);
      o.material.emissive = new THREE.Color(0x5a1410);
      o.material.emissiveIntensity = 0.5;
    });
    root.add(obj);
    return { ...s, obj, phase: Math.random() * Math.PI * 2 };
  });

  const bees = BEES.map((b) => {
    const a = animated('Bee');
    a.obj.position.set(b.x0, b.y, 0);
    a.play('Flying');
    return { ...b, ...a, dir: 1, dead: 0 };
  });

  const key = makePickup(root, glow(prepare(cloneModel(m.Key), { scale: MODEL_SCALE * 1.3 }), 0xffe27a, 0.7), KEY.x, KEY.y, 0xffe27a, 1.4, true);

  const lever = { ...LEVER, ...animated('Lever', MODEL_SCALE * 1.2), on: false };
  lever.obj.position.set(LEVER.x, LEVER.y, 0);
  lever.play('Lever_Off');

  const bridge = { ...BRIDGE, planks: [], built: 0 };
  for (let i = 0; i < BRIDGE.planks; i++) {
    const src = i === 0 || i === BRIDGE.planks - 1 ? m.Bridge_Modular : m.Bridge_Modular_Center;
    const plank = prepare(cloneModel(src), { scale: MODEL_SCALE * 0.85 });
    // Overhang both ends so the planks visually land on the islands they join.
    const x = BRIDGE.x0 - 0.4 + ((BRIDGE.x1 - BRIDGE.x0 + 0.8) * (i + 0.5)) / BRIDGE.planks;
    plank.position.set(x, BRIDGE.y - 0.05, 0);
    plank.scale.setScalar(0.0001);
    plank.visible = false;
    root.add(plank);
    bridge.planks.push({ obj: plank, x, grow: 0 });
  }
  bridge.solid = { minX: BRIDGE.x0, maxX: BRIDGE.x1, minY: BRIDGE.y - 4.5, maxY: BRIDGE.y, enabled: false };
  solids.push(bridge.solid);

  const door = { ...DOOR, obj: prepare(cloneModel(m.Door), { scale: MODEL_SCALE * 1.1 }), open: 0, locked: true };
  // The door mesh is not centred on its own origin; nudge it onto the collider.
  door.obj.position.set(DOOR.x + 0.17, DOOR.y + 1.19, -0.15);
  root.add(door.obj);
  door.solid = { minX: DOOR.x - 0.35, maxX: DOOR.x + 0.35, minY: DOOR.y, maxY: DOOR.y + 2.6, enabled: true };
  solids.push(door.solid);

  const flag = { ...FLAG, obj: prepare(cloneModel(m.Goal_Flag), { scale: MODEL_SCALE * 2.2 }), raised: 0 };
  flag.obj.position.set(FLAG.x, FLAG.y, -0.6);
  glow(flag.obj, 0xffbb44, 0.35);
  flag.light = new THREE.PointLight(0xffd070, 2.2, 7, 2);
  flag.light.position.set(FLAG.x, FLAG.y + 1.4, 0.4);
  root.add(flag.obj, flag.light);

  return {
    root, solids, platforms, coins, gems, bouncers, saws, bees, key, lever, bridge, door, flag,

    update(dt, t) {
      for (const mx of mixers) mx.update(dt);
      for (const p of platforms) p.update(dt, t);

      for (const c of [...coins, ...gems]) {
        if (c.taken) continue;
        c.obj.rotation.y += dt * (c.isGem ? 1.2 : 3.4);
        const pulse = c.isGem ? 1 + Math.sin(t * 4 + c.phase) * 0.12 : 1;
        c.obj.scale.setScalar(c.baseScale * pulse);
        c.obj.position.y = c.y + Math.sin(t * 2 + c.phase) * 0.12;
        c.light.position.copy(c.obj.position);
      }
      if (!key.taken) {
        key.obj.rotation.y += dt * 1.8;
        key.obj.position.y = key.y + Math.sin(t * 2.2) * 0.18;
        key.light.position.copy(key.obj.position);
      }

      for (const s of saws) {
        const k = 0.5 - 0.5 * Math.cos(((t + s.phase) / s.period) * Math.PI * 2);
        s.obj.position.set(
          s.from[0] + (s.to[0] - s.from[0]) * k,
          s.from[1] + (s.to[1] - s.from[1]) * k,
          0.15
        );
        s.obj.rotation.z -= dt * 11;
      }

      for (const b of bouncers) {
        b.cooldown = Math.max(0, b.cooldown - dt);
        if (b.cooldown === 0) b.play('Bouncer_Idle', { fade: 0.12 });
      }

      for (const b of bees) {
        if (b.dead) {
          if (b.dead < 0.001) b.play('Death', { once: true, fade: 0.08 });
          b.dead += dt;
          b.obj.position.y -= dt * 4;
          b.obj.rotation.z += dt * 6;
          if (b.dead > 1.2) b.obj.visible = false;
          continue;
        }
        b.obj.position.x += b.dir * dt * 2.2;
        if (b.obj.position.x > b.x1) b.dir = -1;
        if (b.obj.position.x < b.x0) b.dir = 1;
        b.obj.position.y = b.y + Math.sin(t * 3) * 0.35;
        b.obj.rotation.y = b.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }

      if (lever.on && bridge.built < bridge.planks.length) {
        bridge.timer = (bridge.timer ?? 0) + dt;
        if (bridge.timer > 0.12) {
          bridge.timer = 0;
          bridge.planks[bridge.built++].obj.visible = true;
        }
      }
      let allGrown = true;
      for (let i = 0; i < bridge.planks.length; i++) {
        const p = bridge.planks[i];
        if (!p.obj.visible) { allGrown = false; continue; }
        p.grow = Math.min(1, p.grow + dt * 4);
        // Overshoot then settle, so planks snap into place instead of easing in.
        const s = p.grow < 1 ? 1.15 * Math.sin((p.grow * Math.PI) / 1.6) : 1;
        p.obj.scale.setScalar(MODEL_SCALE * 0.85 * s);
        if (p.grow < 1) allGrown = false;
      }
      bridge.solid.enabled = bridge.built === bridge.planks.length && allGrown;

      if (!door.locked) {
        door.open = Math.min(1, door.open + dt * 1.4);
        door.obj.position.y = DOOR.y + 1.2 - door.open * 3.2;
        door.solid.enabled = door.open < 0.4;
      }

      flag.obj.rotation.y = Math.sin(t * 1.5) * 0.15;
      if (flag.raised > 0) {
        flag.raised = Math.min(1.6, flag.raised + dt);
        const pop = Math.sin(Math.min(flag.raised, 1) * Math.PI) * 0.5;
        flag.obj.position.y = FLAG.y + pop;
        flag.obj.rotation.y += dt * 7;
        flag.light.intensity = 2.2 + pop * 8;
      }
    },
  };
}

function makeIsland(root, solids, m, r, spec) {
  const g = new THREE.Group();
  const w = Math.round(spec.x1 - spec.x0);
  const cx = (spec.x0 + spec.x1) / 2;
  g.position.set(cx, spec.top, 0);
  root.add(g);

  const place = (model, x, y, rotY = 0, scale = MODEL_SCALE, shadow = true) => {
    const o = prepare(cloneModel(model), { scale, shadow });
    o.position.set(x, y, 0);
    o.rotation.y = rotY;
    g.add(o);
    return o;
  };

  // Grass cap, then dirt rows that inset as they go down: a floating wedge.
  for (let i = 0; i < w; i++) {
    const x = spec.x0 - cx + i + 0.5;
    const edge = i === 0 ? 0 : i === w - 1 ? Math.PI : null;
    place(edge === null ? m.Cube_Grass_1x1Center : m.Cube_Grass_1x1End, x, -0.5, edge ?? 0);
  }
  for (let row = 1; row <= 3; row++) {
    const inset = row - 1;
    if (w - inset * 2 < 1) break;
    for (let i = inset; i < w - inset; i++) {
      const x = spec.x0 - cx + i + 0.5;
      const edge = i === inset ? 0 : i === w - inset - 1 ? Math.PI : null;
      const cube = place(edge === null ? m.Cube_Dirt_1x1Center : m.Cube_Dirt_1x1End, x, -0.5 - row, edge ?? 0);
      // The pack's dirt strata are high-contrast orange; left alone the stack
      // reads as stacked planks rather than the underside of an island.
      cube.traverse((o) => {
        if (!o.isMesh) return;
        o.material.color.lerp(EARTH, 0.62).multiplyScalar(1 - row * 0.12);
      });
    }
  }

  const props = spec.decor === 'lush'
    ? [['Tree', 1.0], ['Tree_Fruit', 0.9], ['Bush', 0.5], ['Bush_Fruit', 0.5], ['Rock_1', 0.6], ['Rock_2', 0.6]]
    : [['Bush', 0.5], ['Rock_1', 0.5], ['Plant_Small', 0.7], ['Plant_Large', 0.7]];
  const count = spec.decor === 'lush' ? 4 : 3;
  for (let i = 0; i < count; i++) {
    const [name, sc] = props[(r() * props.length) | 0];
    const px = spec.x0 - cx + 0.8 + r() * (w - 1.6);
    if (Math.abs(px + cx - FLAG.x) < 2) continue; // don't bury the goal in shrubbery
    const o = place(m[name], px, 0, r() * 6.28, MODEL_SCALE * sc * (0.8 + r() * 0.5));
    o.position.z = -1.9 - r() * 0.9;
  }
  // Foreground grass sits in front of the play plane for a depth-of-field feel.
  for (let i = 0; i < w; i++) {
    if (r() > 0.55) {
      const name = ['Grass_1', 'Grass_2', 'Grass_3'][(r() * 3) | 0];
      // Larger tufts crowded onto the island's front lip: closest thing to the
      // camera that still stands on real ground, so the side-on view gets depth
      // without grass appearing to hover over the void.
      place(m[name], spec.x0 - cx + i + r(), 0, r() > 0.5 ? 0 : Math.PI, MODEL_SCALE * (1.3 + r() * 0.7), false)
        .position.z = 0.34 + r() * 0.18;
    }
    if (r() > 0.6) {
      const name = ['Grass_1', 'Grass_2', 'Grass_3'][(r() * 3) | 0];
      place(m[name], spec.x0 - cx + i + r(), 0, r() * 6.28, MODEL_SCALE * 0.8, false).position.z = -0.5 - r() * 0.4;
    }
  }

  const solid = { minX: spec.x0, maxX: spec.x1, minY: spec.top - 4.5, maxY: spec.top };
  solids.push(solid);

  const amp = 0.06 + r() * 0.07;
  const speed = 0.35 + r() * 0.3;
  const phase = r() * 9;
  return {
    group: g, spec, solid,
    update(dt, t) {
      const y = spec.top + Math.sin(t * speed + phase) * amp;
      g.position.y = y;
      solid.maxY = y;
      solid.minY = y - 4.5;
    },
  };
}

function makePickup(root, model, x, y, color, lightPower, isGem = false) {
  const obj = prepare(model, { shadow: false });
  glow(obj, color, isGem ? 0.9 : 0.55);
  obj.position.set(x, y, 0);
  root.add(obj);
  const light = new THREE.PointLight(color, lightPower, 4.5, 2);
  light.position.copy(obj.position);
  root.add(light);
  return {
    obj, light, x, y, color, taken: false, isGem,
    baseScale: obj.scale.x, phase: Math.random() * 6.28, value: 1,
    take(particles) {
      this.taken = true;
      this.obj.visible = false;
      this.light.intensity = 0;
      particles.burst(this.obj.position, color, {
        count: this.isGem ? 26 : 14,
        speed: this.isGem ? 5 : 3.4,
        ttl: 0.65, size: this.isGem ? 1.3 : 1,
      });
    },
  };
}
