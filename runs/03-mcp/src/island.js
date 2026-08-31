import * as THREE from 'three';
import { spawn, eachMaterial, ownMaterials } from './assets.js';

export const TILE = 2; // the pack's cubes are 2 units across

/** Seeded so the level's scatter is identical every run — screenshots included. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROCKS = [
  { name: 'RockPlatform_Tall', w: 3.58, h: 4.26 },
  { name: 'RockPlatforms_Medium', w: 4.8, h: 2.91 },
  { name: 'RockPlatforms_3', w: 5.99, h: 4.38 },
  { name: 'RockPlatforms_Large', w: 7.38, h: 3.63 },
  { name: 'RockPlatforms_2', w: 9.32, h: 4.45 },
];

// The deck's grass skirt only exists on the outward faces, so each tile has to
// know which edges of the slab it sits on.
function deckTile(ix, iz, tilesWide) {
  const last = tilesWide - 1;
  const front = iz === 0;
  if (tilesWide === 1) return ['Cube_Grass_Single', 0];
  if (ix === 0) return ['Cube_Grass_Corner', front ? 0 : -Math.PI / 2];
  if (ix === last) return ['Cube_Grass_Corner', front ? Math.PI / 2 : Math.PI];
  return ['Cube_Grass_Side', front ? 0 : Math.PI];
}

function addRockUnderside(group, tilesWide, rng) {
  const span = tilesWide * TILE;
  let x = 0;
  while (x < span - 0.4) {
    const remaining = span - x;
    const pick = ROCKS.filter((r) => r.w <= remaining + 3.2).at(-1);
    const scale = 0.9 + rng() * 0.35;
    const rock = spawn(pick.name, { receive: false });
    rock.scale.setScalar(scale);
    rock.rotation.y = rng() < 0.5 ? 0 : Math.PI;
    rock.position.set(
      Math.min(x + (pick.w * scale) / 2, span - 0.6),
      -1.5 - pick.h * scale,
      (rng() - 0.5) * 1.2
    );
    group.add(rock);
    x += pick.w * scale * 0.72;
  }
}

const GRASS = ['Grass_1', 'Grass_2', 'Grass_3'];

function addDecor(group, tilesWide, rng, { trees = 0 } = {}) {
  const span = tilesWide * TILE;
  const tufts = Math.round(tilesWide * 1.3);
  for (let i = 0; i < tufts; i++) {
    const g = spawn(GRASS[(rng() * GRASS.length) | 0], { shadow: false, receive: false });
    // Grass models are modelled sitting on top of a tile, so their origin is a
    // tile-radius below the blades.
    g.position.set(rng() * span, -0.95, rng() < 0.62 ? -2.9 + rng() * 1.6 : 1.9 + rng() * 0.8);
    g.rotation.y = rng() * Math.PI * 2;
    g.scale.setScalar(0.8 + rng() * 0.7);
    group.add(g);
  }
  for (let i = 0; i < Math.round(tilesWide / 5); i++) {
    const r = spawn(rng() < 0.5 ? 'Rock_1' : 'Rock_2', { shadow: false, receive: false });
    r.position.set(1 + rng() * (span - 2), 0, -2.4 - rng() * 0.8);
    r.rotation.y = rng() * Math.PI * 2;
    r.scale.setScalar(0.5 + rng() * 0.5);
    group.add(r);
  }
  for (let i = 0; i < trees; i++) {
    const t = spawn(rng() < 0.35 ? 'Tree_Fruit' : 'Tree', { receive: false });
    // Hug the ends of the deck: a trunk behind the middle of a platform hides
    // the character exactly where the player is looking.
    const edge = i % 2 ? span * (0.82 + rng() * 0.14) : span * (0.04 + rng() * 0.14);
    t.position.set(edge, 0, -7 - rng() * 1.6);
    t.rotation.y = rng() * Math.PI * 2;
    t.scale.setScalar(0.5 + rng() * 0.22);
    group.add(t);
  }
  if (tilesWide >= 4 && rng() < 0.7) {
    const b = spawn(rng() < 0.5 ? 'Bush_Fruit' : 'Bush', { shadow: false, receive: false });
    b.position.set(1.5 + rng() * (span - 3), -0.2, -3.2 - rng() * 0.8);
    b.scale.setScalar(0.45 + rng() * 0.2);
    group.add(b);
  }
}

/**
 * A floating island whose deck top sits at local y = 0 and whose left edge is
 * at local x = 0, so the caller positions it by the surface the player lands on.
 */
export function buildIsland(tilesWide, { rng = makeRng(1), depth = 2, trees = 0, decor = true } = {}) {
  const group = new THREE.Group();
  for (let ix = 0; ix < tilesWide; ix++) {
    for (let iz = 0; iz < depth; iz++) {
      const [name, rot] = deckTile(ix, iz, tilesWide);
      const cube = spawn(name);
      cube.rotation.y = rot;
      cube.position.set(ix * TILE + 1, -1, (depth - 1) * TILE * 0.5 - iz * TILE);
      group.add(cube);
    }
  }
  addRockUnderside(group, tilesWide, rng);
  if (decor) addDecor(group, tilesWide, rng, { trees });
  return group;
}

/** Flatten an island into cheap unlit-ish scenery for the far parallax layers. */
export function fadeIntoDistance(group, color, amount) {
  const target = new THREE.Color(color);
  ownMaterials(group); // background tints must not bleed into the playfield
  eachMaterial(group, (m) => {
    m.color.lerp(target, amount);
    m.roughness = 1;
  });
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = false;
  });
}
