import * as THREE from 'three';
import { buildIsland, makeRng, TILE } from './island.js';

// Coin trails read best as arcs the player traces mid-jump, so author them as
// the jump itself rather than as scattered points.
function arc(x0, y0, x1, y1, count, lift = 3) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * lift]);
  }
  return out;
}

function line(x0, y0, dx, dy, count) {
  return Array.from({ length: count }, (_, i) => [x0 + dx * i, y0 + dy * i]);
}

export const LEVEL = {
  span: 210,
  spawn: { x: 6, y: 0.2 },
  killY: -34,

  // Gaps are sized against the jump arc (apex 5.4, reach ~10.4) and the bounce
  // arc (apex 12.9): a launch clears the ledge edge on the way up and lands well
  // inside it, so neither is a pixel-perfect commitment.
  // x = left edge, y = walkable surface, tw = width in 2-unit tiles
  platforms: [
    { x: 0, y: 0, tw: 7, trees: 2 },
    { x: 21, y: 2, tw: 4 },
    { x: 35, y: 5, tw: 3 },
    { x: 46, y: 2, tw: 5, trees: 1 },
    { x: 59, y: 11, tw: 5 },
    { x: 73, y: 8, tw: 3 },
    { x: 83, y: 8, tw: 5 },
    { x: 97, y: 8, tw: 4 },
    { x: 119, y: 8, tw: 6, trees: 1 },
    { x: 137, y: 8, tw: 6 },
    { x: 153, y: 8, tw: 8, trees: 2 },
    { x: 171, y: 17, tw: 5 },
    { x: 185, y: 20, tw: 6, trees: 2 },
  ],

  bouncers: [{ x: 52, y: 2 }, { x: 164, y: 8 }],

  // Saws guard gaps and the middle of a deck, never a whole platform: there is
  // always somewhere to stand and read the timing from.
  saws: [
    { x: 71, y: 10, axis: 'y', range: 4, speed: 0.8, phase: 0, scale: 1 },
    { x: 81, y: 8.4, axis: 'y', range: 3.6, speed: 0.75, phase: 0.6, scale: 0.85 },
    { x: 88, y: 10.2, axis: 'x', range: 1.8, speed: 1, phase: 1.2, scale: 1 },
    { x: 95, y: 8.4, axis: 'y', range: 3.4, speed: 1.05, phase: 2.4, scale: 1.1 },
    { x: 143, y: 9.4, axis: 'x', range: 2, speed: 0.85, phase: 0.4, scale: 0.9 },
  ],

  bees: [
    { x: 125, y: 12.5, from: 120, to: 130 },
    { x: 159, y: 12, from: 155, to: 167 },
  ],

  lever: { x: 103, y: 8 },
  bridge: { x0: 105, x1: 120, y: 8, segments: 5 },
  key: { x: 143, y: 12.6 },
  door: { x: 157, y: 8 },
  goal: { x: 191, y: 20 },

  gems: [
    { x: 63, y: 13.4, model: 'Gem_Blue', value: 5 },
    { x: 101, y: 10.6, model: 'Gem_Green', value: 5 },
    { x: 113, y: 12.5, model: 'Gem_Pink', value: 5 },
    { x: 174, y: 19.2, model: 'Gem_Blue', value: 5 },
  ],

  coins: [
    ...line(4, 1.6, 2.4, 0, 3),
    ...arc(15, 1.6, 20, 3.6, 5),
    ...arc(29.5, 3.6, 34, 6.6, 4),
    ...line(36, 6.6, 2.2, 0, 3),
    ...arc(42, 6.6, 46, 3.6, 4, 2),
    ...line(53, 5.5, 0, 2.4, 4),
    ...line(60, 12.6, 2, 0, 4),
    ...arc(69.5, 12.6, 74, 9.6, 4, 1.5),
    ...arc(79.5, 9.6, 83.5, 9.6, 3, 2.2),
    ...arc(93.5, 9.6, 97.5, 9.6, 3, 2.2),
    ...line(85, 9.6, 2, 0, 2),
    ...line(107, 9.6, 2.6, 0, 5),
    ...arc(132, 9.6, 138, 9.6, 4, 2.4),
    ...line(138, 9.6, 2, 0, 2),
    ...line(147, 9.6, 2, 0, 2),
    ...arc(150, 9.6, 154, 9.6, 3, 2),
    ...line(161, 9.6, 2.2, 0, 3),
    ...arc(166, 11, 172, 18.6, 5, 1.5),
    ...arc(181, 18.6, 186, 21.6, 4, 1.5),
    ...line(188, 21.6, 2.2, 0, 3),
  ],
};

/** A platform's live AABB — `top` moves with the island's drift each frame. */
class Platform {
  constructor(spec, group) {
    this.x0 = spec.x;
    this.x1 = spec.x + spec.tw * TILE;
    this.baseTop = spec.y;
    this.top = spec.y;
    this.dy = 0;
    this.thickness = 2;
    this.group = group;
    this.bobAmp = 0.09 + Math.random() * 0.05;
    this.bobPhase = spec.x * 0.21;
    this.bobRate = 0.28 + (spec.x % 7) * 0.02;
  }

  get bottom() {
    return this.top - this.thickness;
  }

  update(t) {
    const y = this.baseTop + Math.sin(t * this.bobRate + this.bobPhase) * this.bobAmp;
    this.dy = y - this.top;
    this.top = y;
    this.group.position.y = y;
  }
}

export function buildLevel(scene) {
  const rng = makeRng(7);
  const platforms = LEVEL.platforms.map((spec) => {
    const group = buildIsland(spec.tw, { rng, depth: 2, trees: spec.trees ?? 0 });
    group.position.set(spec.x, spec.y, 0);
    scene.add(group);
    return new Platform(spec, group);
  });

  // The bridge is a platform the lever switches on; it starts disabled.
  const bridgeGroup = new THREE.Group();
  scene.add(bridgeGroup);

  return { platforms, bridgeGroup };
}
