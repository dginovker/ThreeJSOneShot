import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { installFatalHandler, guardFrame } from './fatal.js';
import { preload } from './assets.js';
import { Particles } from './particles.js';
import { World } from './sky.js';
import { LEVEL, buildLevel } from './level.js';
import { Player } from './player.js';
import { createEntities } from './entities.js';
import { Hud } from './hud.js';
import { initAudio, resumeAudio } from './sfx.js';

installFatalHandler();

const PRELOAD = [
  'Character', 'Bee',
  'Coin', 'Gem_Blue', 'Gem_Green', 'Gem_Pink', 'Key', 'Heart', 'Heart_Outline',
  'Bouncer', 'Hazard_Saw', 'Lever', 'Bridge_Modular_Center', 'Door', 'Goal_Flag',
  'Cube_Grass_Single', 'Cube_Grass_Corner', 'Cube_Grass_Side',
  'RockPlatform_Tall', 'RockPlatforms_Medium', 'RockPlatforms_3', 'RockPlatforms_Large', 'RockPlatforms_2',
  'Rock_1', 'Rock_2', 'Grass_1', 'Grass_2', 'Grass_3',
  'Bush', 'Bush_Fruit', 'Tree', 'Tree_Fruit',
  'Cloud_1', 'Cloud_2', 'Cloud_3',
];

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 900);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.5, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- input

// Built before the key listeners exist, so resumeAudio() always has a context.
initAudio();

const input = { left: false, right: false, jump: false, jumpPressed: false, usePressed: false, any: false };
const BINDS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'jump', KeyW: 'jump',
  KeyE: 'use', ArrowDown: 'use', KeyS: 'use',
};

addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') return location.reload();
  const bind = BINDS[e.code];
  if (!bind) return;
  e.preventDefault();
  input.any = true;
  resumeAudio();
  if (bind === 'use') { input.usePressed = true; return; }
  if (bind === 'jump' && !input.jump) input.jumpPressed = true;
  input[bind] = true;
});
addEventListener('keyup', (e) => {
  const bind = BINDS[e.code];
  if (bind && bind !== 'use') input[bind] = false;
});
addEventListener('blur', () => { input.left = input.right = input.jump = false; });

// ---------------------------------------------------------------- camera rig

const CAM = { z: 30, xOff: -4.6, yOff: 6.3, lookY: 2.5, deadUp: 3.6, deadDown: 4.8 };

class CameraRig {
  constructor(start) {
    this.x = start.x;
    this.y = start.y;
    this.shake = 0;
    this.look = new THREE.Vector3();
  }

  update(dt, player) {
    const lead = THREE.MathUtils.clamp(player.vel.x * 0.28, -4.5, 4.5);
    this.x += (player.pos.x + lead - this.x) * (1 - Math.exp(-4.2 * dt));

    // A dead zone in Y so ordinary hops don't rock the whole frame.
    let ty = this.y;
    if (player.pos.y > this.y + CAM.deadUp) ty = player.pos.y - CAM.deadUp;
    else if (player.pos.y < this.y - CAM.deadDown) ty = player.pos.y + CAM.deadDown;
    else if (player.grounded) ty = player.pos.y;
    this.y += (ty - this.y) * (1 - Math.exp(-(player.grounded ? 3.2 : 6.5) * dt));

    this.shake *= Math.exp(-7 * dt);
    const s = this.shake * this.shake * 1.7;
    const jx = (Math.random() - 0.5) * s;
    const jy = (Math.random() - 0.5) * s;

    camera.position.set(this.x + CAM.xOff + jx, this.y + CAM.yOff + jy, CAM.z);
    this.look.set(this.x + jx * 0.5, this.y + CAM.lookY + jy * 0.5, 0);
    camera.lookAt(this.look);
    camera.rotation.z += Math.sin(performance.now() * 0.004) * this.shake * 0.02;
  }
}

// ---------------------------------------------------------------- boot

await preload(PRELOAD);

const particles = new Particles(scene);
const { platforms } = buildLevel(scene);
const world = new World(scene, { levelSpan: LEVEL.span });
const player = new Player(scene, particles, LEVEL);
const entities = createEntities(scene, LEVEL);
const hud = new Hud(renderer, { maxHealth: player.maxHealth, gems: entities.totalGems });
addEventListener('resize', () => hud.resize());

const state = { coins: 0, gems: 0, hasKey: false, won: false, streak: 0, streakTimer: 0 };
const rig = new CameraRig(LEVEL.spawn);
let hitStopLeft = 0;

const ctx = {
  player, particles, state, input,
  prompt: (text) => hud.setPrompt(text),
  banner: (text, s) => hud.showBanner(text, s),
  shake: (v) => { rig.shake = Math.max(rig.shake, v); },
  hitStop: (s) => { hitStopLeft = Math.max(hitStopLeft, s); },
};

document.getElementById('loading').remove();

const timer = new THREE.Timer();
timer.connect(document); // pause the clock on a hidden tab instead of a huge catch-up frame
let t = 0;
let gameT = 0;

/** One simulation step. Split out from the frame loop so it can be driven at a
 *  fixed rate by a test harness instead of by the display refresh. */
function step(dt) {
  t += dt;

  const frozen = hitStopLeft > 0;
  hitStopLeft = Math.max(hitStopLeft - dt, 0);
  const gdt = frozen ? 0 : dt;
  gameT += gdt;

  if (input.any) hud.hideTitle();

  for (const p of platforms) p.update(gameT);

  const solids = platforms.concat(entities.dynamicSolids());
  player.update(gdt, input, solids);
  entities.update(gdt, gameT, ctx);

  if (player.grounded && !player.dead && player.invuln <= 0 && entities.safeSpot(player.pos)) {
    player.markCheckpoint();
  }

  state.streakTimer -= dt;
  if (state.streakTimer <= 0) state.streak = 0;

  particles.update(dt);
  world.update(t, dt, camera);
  world.followSun(player.pos);
  rig.update(dt, player);
  hud.update(dt, t, state, player.health);

  input.jumpPressed = false;
  input.usePressed = false;
}

function render() {
  composer.render();
  hud.render();
}

// Live handle for probing or driving the running game from a console or harness.
globalThis.game = { player, platforms, entities, state, rig, input, LEVEL, scene, camera, renderer, step, render };

renderer.setAnimationLoop(guardFrame(() => {
  // Timer must run off its own clock: seeding it with rAF's epoch yields a
  // negative first delta, which inverts gravity for one frame.
  timer.update();
  step(Math.min(timer.getDelta(), 1 / 20));
  render();
}));
