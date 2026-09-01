import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { installFatalHandler, guardFrame } from './fatal.js';
import { loadGLTFs } from './models.js';
import { clamp, damp, overlaps } from './util.js';
import * as L from './level.js';
import { makeSkyDome, makeLights, makeParallax, makeClouds, makeForeground, updateBackdrop, SKY } from './sky.js';
import { Particles } from './fx.js';
import { buildEntities, TINT } from './entities.js';
import { Player } from './player.js';
import { Hud } from './hud.js';

installFatalHandler();

const ui = {
  hud: document.getElementById('hud'),
  banner: document.getElementById('banner'),
};
ui.hud.innerHTML = '<div class="loading">Loading sky islands…</div>';

const MODELS = [
  'Character', 'Bee', 'Bouncer', 'Lever', 'Door', 'Goal_Flag', 'Key', 'Coin',
  'Gem_Blue', 'Gem_Green', 'Gem_Pink', 'Hazard_Saw', 'Bridge_Small',
  'RockPlatforms_Large', 'RockPlatforms_1', 'RockPlatforms_2', 'RockPlatforms_3',
  'RockPlatforms_Medium', 'RockPlatform_Tall', 'Tree', 'Tree_Fruit', 'Bush', 'Rock_1', 'Rock_2',
  'Grass_1', 'Grass_2', 'Grass_3', 'Plant_Small', 'Plant_Large',
  'Cloud_1', 'Cloud_2', 'Cloud_3', 'Heart', 'Heart_Outline',
];

const gltfs = await loadGLTFs(MODELS);
const assets = Object.fromEntries(Object.entries(gltfs).map(([k, g]) => [k, g.scene]));

// ---------------------------------------------------------------- renderer

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY.haze.clone().lerp(SKY.mid, 0.3), 105, 470);

const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 1600);
// Slightly off-axis and slightly above: enough three-quarter to read the depth
// of the islands without leaving the flat, readable side-on play plane.
const CAM_OFFSET = new THREE.Vector3(3.4, 4.4, 32);
const camTarget = new THREE.Vector3(L.SPAWN.x, L.SPAWN.y + 2.4, 0);
let camAnchorY = L.SPAWN.y;

scene.add(makeSkyDome());
const sun = makeLights(scene);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.5, 1.15);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- world

const fx = new Particles(scene);
L.buildTerrain(scene, assets);
const layers = makeParallax(scene, assets);
const clouds = makeClouds(scene, assets);
const foreground = makeForeground(scene, assets);
const world = buildEntities(scene, assets, gltfs, fx);
const player = new Player(scene, gltfs.Character, fx);
const hud = new Hud(assets);

const staticSolids = L.colliders();
const solids = [];
const fields = [];

// ?at=<x> drops the player onto whichever platform spans that x, so a single
// set piece can be checked without replaying everything before it.
function spawnOn(x) {
  const under = L.PLATFORMS.find((p) => x >= p.x0 && x <= p.x1);
  if (!under) {
    const spans = L.PLATFORMS.map((p) => `${p.x0}..${p.x1}`).join(', ');
    throw new Error(`?at=${x} is over open sky. Platforms span: ${spans}`);
  }
  return { x, y: under.y + 0.1 };
}

const requested = new URLSearchParams(location.search).get('at');
const start = requested === null ? { ...L.SPAWN } : spawnOn(Number(requested));

const state = {
  coins: 0,
  gems: 0,
  health: 3,
  hasKey: false,
  won: false,
  checkpoint: { ...start },
  checkpointTimer: 0,
};
player.reset(start.x, start.y);

// ---------------------------------------------------------------- input

const held = new Set();
const input = { left: false, right: false, jump: false, jumpPressed: false };
const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW', 'KeyZ'];
const IDLE_INPUT = { left: false, right: false, jump: false, jumpPressed: false };

addEventListener('keydown', (e) => {
  if (JUMP_KEYS.includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
  if (held.has(e.code)) return;
  held.add(e.code);
  if (JUMP_KEYS.includes(e.code)) input.jumpPressed = true;
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());

function readInput() {
  input.left = held.has('ArrowLeft') || held.has('KeyA');
  input.right = held.has('ArrowRight') || held.has('KeyD');
  input.jump = JUMP_KEYS.some((k) => held.has(k));
}

// ---------------------------------------------------------------- gameplay

function damage(fromX) {
  if (!player.hurt(fromX)) return;
  state.health -= 1;
  hud.setHealth(Math.max(0, state.health));
  if (state.health <= 0) {
    state.health = 3;
    hud.setHealth(3);
    respawn();
  }
}

function respawn() {
  player.reset(state.checkpoint.x, state.checkpoint.y);
  player.invuln = 1.2;
  fx.burst(player.center, TINT.spark, 26, { speed: 8, size: 0.5, life: 0.6, gravity: -8 });
}

function collide() {
  const self = player.aabb();

  for (const coin of world.coins) {
    if (!coin.taken && overlaps(self, coin.aabb)) {
      coin.take(fx);
      state.coins += 1;
    }
  }
  for (const gem of world.gems) {
    if (!gem.taken && overlaps(self, gem.aabb)) {
      gem.take(fx);
      state.gems += 1;
    }
  }
  if (!world.key.taken && overlaps(self, world.key.aabb)) {
    world.key.take(fx);
    state.hasKey = true;
  }
  if (state.hasKey && !world.door.open && Math.abs(player.x - L.DOOR.x) < 5) {
    world.door.unlock(fx);
  }
  if (!world.lever.pulled && overlaps(self, world.lever.aabb)) {
    world.lever.pull(fx);
    world.bridge.down = true;
  }
  for (const b of world.bouncers) {
    if (player.vy <= 0.5 && overlaps(self, b.aabb)) {
      player.bounce(L.PHYS.bounceVelocity);
      b.fire(fx);
    }
  }
  for (const saw of world.saws) {
    if (overlaps(self, saw.aabb)) damage(saw.mesh.position.x);
  }
  for (const bee of world.bees) {
    if (bee.dead || !overlaps(self, bee.aabb)) continue;
    // Generous: anything caught on the way down counts, so a near-miss above
    // the bee reads as a stomp rather than an unfair side hit.
    const stomping = player.vy < -1 && player.y > bee.root.position.y - 0.3;
    if (stomping) {
      bee.kill(fx);
      player.bounce(L.PHYS.stompVelocity);
    } else {
      damage(bee.root.position.x);
    }
  }
  if (!state.won && overlaps(self, world.flag.aabb)) win();
}

function win() {
  state.won = true;
  for (let i = 0; i < 5; i++) {
    fx.burst(new THREE.Vector3(L.FLAG.x, L.FLAG.y + 1 + i * 0.8, 0), i % 2 ? TINT.coin : TINT.gem, 40,
      { speed: 13, spread: 2.5, size: 0.6, life: 1.6, gravity: -7, up: 4 });
  }
  ui.banner.className = 'show';
  ui.banner.innerHTML =
    `<h1>Island Cleared</h1><p>${state.coins} / ${world.coins.length} coins &nbsp;·&nbsp; ` +
    `${state.gems} / ${world.gems.length} gems &nbsp;·&nbsp; ${state.health} hearts left</p>`;
}

function buildSolids() {
  solids.length = 0;
  for (const s of staticSolids) solids.push(s);
  fields.length = 0;
  const bridge = world.bridge.field;
  if (bridge) fields.push(bridge);
  const door = world.door.collider;
  if (door) solids.push(door);
}

function updateCamera(dt) {
  const look = clamp(player.vx / L.PHYS.runSpeed, -1, 1) * 3.2;
  // Y only tracks the player once they are back on the ground, with a window
  // wide enough that a normal jump doesn't drag the whole frame with it.
  if (player.grounded) camAnchorY = damp(camAnchorY, player.y, 5, dt);
  camAnchorY = Math.min(camAnchorY, player.y + 5);
  camAnchorY = Math.max(camAnchorY, player.y - 7);

  camTarget.x = damp(camTarget.x, player.x + look, 5.5, dt);
  camTarget.y = damp(camTarget.y, camAnchorY + 2.6, 3.4, dt);
  camera.position.copy(camTarget).add(CAM_OFFSET);
  camera.lookAt(camTarget);

  sun.position.set(camTarget.x - 24, camTarget.y + 34, 26);
  sun.target.position.copy(camTarget);
  sun.target.updateMatrixWorld();
}

let hudText = '';
function updateHudText() {
  if (state.won) return;
  const next =
    `<span class="stat"><b>${state.coins}</b><i>coins</i></span>` +
    `<span class="stat"><b>${state.gems}</b><i>gems</i></span>` +
    (state.hasKey ? '<span class="stat key">🔑<i>key</i></span>' : '') +
    // The controls prompt has done its job once the player is clearly moving.
    (elapsed < 14 ? '<span class="hint">← → move &nbsp;·&nbsp; space to jump</span>' : '');
  if (next === hudText) return;
  hudText = next;
  ui.hud.innerHTML = next;
}

// ---------------------------------------------------------------- loop

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.resolution.set(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  hud.layout(w / h);
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let elapsed = 0;
let accumulator = 0;

// A hook for driving the level from the console while tuning it.
globalThis.game = { player, world, state, camera, scene, solids, fields };

renderer.setAnimationLoop(guardFrame(() => {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  elapsed += dt;

  readInput();
  buildSolids();
  // Euler integration at a variable dt makes the same jump reach different
  // heights on a 30Hz and a 144Hz display; a fixed step keeps them identical.
  accumulator = Math.min(accumulator + dt, L.PHYS.step * 12);
  while (accumulator >= L.PHYS.step) {
    player.update(L.PHYS.step, state.won ? IDLE_INPUT : input, solids, fields);
    input.jumpPressed = false;
    accumulator -= L.PHYS.step;
  }
  input.jumpPressed = false;

  world.update(dt, elapsed);
  collide();

  if (player.grounded && (state.checkpointTimer -= dt) <= 0) {
    state.checkpointTimer = 0.4;
    state.checkpoint = { x: player.x, y: player.y + 0.05 };
  }
  if (player.y < L.PHYS.killY) {
    damage(player.x);
    respawn();
  }

  updateCamera(dt);
  updateBackdrop(elapsed, dt, {
    layers, clouds, foreground, camX: camTarget.x, camY: camTarget.y - 3,
  });
  fx.update(dt);
  hud.update(dt, elapsed);
  updateHudText();

  composer.render();
  hud.render(renderer);
}));
