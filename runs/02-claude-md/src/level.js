import * as THREE from 'three';
import { makeRng, pick, measureTopY, boxOf, prepare } from './util.js';

export const PHYS = {
  gravity: 62,
  runSpeed: 14,
  accel: 95,
  airAccel: 55,
  friction: 14,
  jumpVelocity: 24,
  bounceVelocity: 44,
  stompVelocity: 25,
  coyote: 0.11,
  jumpBuffer: 0.13,
  cutGravity: 2.4,
  halfWidth: 0.78,
  height: 3.35,
  killY: -22,
  // Physics runs on this fixed step so jump height doesn't drift with frame rate.
  step: 1 / 120,
};

/** Solid ground, left to right. Colliders and rockwork are both derived from this. */
export const PLATFORMS = [
  { x0: -8, x1: 26, y: 0, style: 'wide' },
  { x0: 32, x1: 45, y: 2 },
  { x0: 51, x1: 63, y: 4 },
  { x0: 69, x1: 83, y: 5.5 },
  { x0: 89, x1: 98, y: 3 },
  { x0: 104, x1: 120, y: 15, style: 'sky' },
  { x0: 126, x1: 140, y: 7 },
  { x0: 154, x1: 168, y: 7 },
  { x0: 174, x1: 186, y: 9 },
  { x0: 191, x1: 208, y: 12, style: 'wide' },
];

export const SPAWN = { x: 4, y: 0.2 };

export const COINS = [
  ...row(11, 22, 2.2, 4),
  ...arc(27, 32, 2.4, 5),
  ...row(35, 43, 3.6, 4),
  ...arc(46, 51, 4.6, 5),
  ...row(54, 61, 5.6, 4),
  ...arc(64, 69, 7.2, 5),
  ...row(72, 81, 7.2, 5),
  ...arc(84, 88, 6.4, 4),
  ...row(90, 97, 4.6, 3),
  // Strung along the bouncer's actual launch arc, not a straight line.
  { x: 96.3, y: 10 }, { x: 98.4, y: 14 }, { x: 100.5, y: 16.6 }, { x: 102.6, y: 18 },
  ...row(106, 118, 17, 5),
  ...arc(121, 125, 12.5, 4),
  ...row(128, 138, 8.6, 5),
  ...row(142, 152, 9.2, 5),
  ...row(156, 166, 8.6, 4),
  ...arc(169, 173, 11, 4),
  ...row(176, 184, 10.6, 4),
  ...arc(187, 191, 13.6, 4),
  ...row(194, 200, 13.6, 3),
];

export const GEMS = [
  { x: 107, y: 17.4, kind: 'Gem_Green' },
  { x: 112, y: 18.4, kind: 'Gem_Pink' },
  { x: 117, y: 17.4, kind: 'Gem_Blue' },
];

// Saws sweep over solid ground, never across a mandatory jump: being knocked
// out of the air mid-gap costs a heart and the landing, which reads as unfair.
export const SAWS = [
  { a: [57, 5.2], b: [57, 11.2], period: 2.6, phase: 0 },
  { a: [80.5, 6.7], b: [80.5, 12.6], period: 3.1, phase: 0.5 },
  { a: [176, 10.1], b: [184.5, 10.1], period: 3.4, phase: 0 },
  { a: [184.5, 10.1], b: [176, 10.1], period: 3.4, phase: 0.5 },
];

export const BEES = [
  { x0: 70.5, x1: 78, y: 9.3, period: 4.6 },
  { x0: 127, x1: 139, y: 10.9, period: 4.4 },
];

export const BOUNCERS = [{ x: 93.5, y: 3 }];
export const KEY = { x: 112, y: 18.6 };
export const LEVER = { x: 134, y: 7 };
export const BRIDGE = { x0: 140.2, span: 14, deck: 7 };
export const DOOR = { x: 160, y: 7 };
export const FLAG = { x: 201, y: 12 };

function row(x0, x1, y, n) {
  return Array.from({ length: n }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / (n - 1), y }));
}
/** A jump-shaped run of coins across a gap — the classic "this way" signpost. */
function arc(x0, x1, y, n) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: x0 + (x1 - x0) * t, y: y + Math.sin(t * Math.PI) * 2.6 };
  });
}

export function colliders() {
  return PLATFORMS.map((p) => ({ x0: p.x0, x1: p.x1, y0: p.y - 12, y1: p.y, platform: p }));
}

// Only RockPlatforms_Large and _Medium have a genuinely flat top; the numbered
// ones are spire clusters, and they get flipped upside down into the undersides.
const ROCKS = ['RockPlatforms_Large', 'RockPlatforms_Medium'];
const SPIRES = ['RockPlatforms_1', 'RockPlatforms_2', 'RockPlatforms_3'];

/** Builds the visible rock islands and scatters nature props over their tops. */
export function buildTerrain(scene, assets) {
  const rng = makeRng(0x1eaf);
  const protos = new Map();
  const protoOf = (name) => {
    if (!protos.has(name)) {
      const obj = assets[name];
      protos.set(name, { obj, top: measureTopY(obj), width: boxOf(obj).max.x - boxOf(obj).min.x });
    }
    return protos.get(name);
  };

  const group = new THREE.Group();
  for (const p of PLATFORMS) {
    const proto = protoOf(p.x1 - p.x0 > 12 ? ROCKS[0] : pick(rng, ROCKS));
    const step = proto.width * 0.58;
    const n = Math.max(2, Math.ceil((p.x1 - p.x0) / step));
    for (let i = 0; i < n; i++) {
      const rock = proto.obj.clone();
      const t = n === 1 ? 0.5 : i / (n - 1);
      rock.position.set(
        p.x0 + proto.width * 0.34 + t * (p.x1 - p.x0 - proto.width * 0.68),
        p.y - proto.top,
        rng(-0.8, 0.8)
      );
      rock.rotation.y = i % 2 ? Math.PI : 0;
      rock.scale.z = rng(0.95, 1.3);
      group.add(rock);
    }
    // Spire clusters, upside down: the island reads as a chunk torn loose.
    for (let i = 0; i < Math.max(1, Math.round((p.x1 - p.x0) / 10)); i++) {
      const spire = assets[pick(rng, SPIRES)].clone();
      spire.position.set(rng(p.x0 + 3, p.x1 - 3), p.y - 2.2, rng(-1.5, 0.5));
      spire.rotation.set(Math.PI, rng(0, 6.28), 0);
      spire.scale.set(rng(0.7, 1.0), rng(0.8, 1.5), rng(0.7, 1.0));
      group.add(spire);
    }
    decorate(group, assets, p, rng);
  }
  prepare(group);
  scene.add(group);
  return group;
}

function decorate(group, assets, p, rng) {
  // Prop origins are inconsistent across the pack (grass tufts sit above theirs,
  // trees on theirs), so every prop is seated by its own measured base.
  const put = (name, x, z, scale, y = p.y) => {
    const o = assets[name].clone();
    o.scale.setScalar(scale);
    o.position.set(x, y - boxOf(assets[name]).min.y * scale, z);
    o.rotation.y = rng(0, 6.28);
    group.add(o);
    return o;
  };

  const width = p.x1 - p.x0;
  for (let i = 0; i < Math.round(width / 11); i++) {
    put(rng() < 0.3 ? 'Tree_Fruit' : 'Tree', rng(p.x0 + 3, p.x1 - 3), rng(-5.5, -3.2), rng(0.55, 0.85));
  }
  for (let i = 0; i < Math.round(width / 7); i++) {
    put(rng() < 0.5 ? 'Bush' : 'Rock_2', rng(p.x0 + 1, p.x1 - 1), rng(-3.4, -1.9), rng(0.5, 0.9));
  }
  for (let i = 0; i < Math.round(width / 2.2); i++) {
    put(pick(rng, ['Grass_1', 'Grass_2', 'Grass_3', 'Plant_Small', 'Plant_Large']),
      rng(p.x0 + 0.4, p.x1 - 0.4), rng(1.5, 2.6), rng(0.7, 1.2));
  }
  for (let i = 0; i < Math.round(width / 6); i++) {
    put(pick(rng, ['Grass_1', 'Grass_2', 'Grass_3']),
      rng(p.x0 + 0.4, p.x1 - 0.4), rng(-1.6, -0.9), rng(0.6, 1.0));
  }
  if (p.style === 'wide') {
    put('Rock_1', rng(p.x0 + 2, p.x1 - 2), rng(-2.6, -1.4), rng(0.7, 1.2));
  }
}
