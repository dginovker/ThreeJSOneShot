import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { installFatalHandler, guardFrame } from './fatal.js';
import { buildSky, skyDome, SKY } from './sky.js';
import { buildLevel, LEVEL_LENGTH, CHECKPOINTS } from './level.js';
import { makePlayer, stepPlayer, makeInput } from './player.js';
import { makeParticles } from './particles.js';
import { makeHud } from './hud.js';
import { damp, clamp } from './util.js';

installFatalHandler();

// --- renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// Aggressive aerial perspective: without it a rock 100 units out reads as a
// prop standing next to the player.
scene.fog = new THREE.Fog(SKY.middle.clone().lerp(SKY.horizon, 0.5), 40, 175);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 900);
camera.position.set(0, 4, 18);

// The sky itself is the light probe: metal saws and coins pick up the warm
// horizon and the blue zenith instead of reflecting a black void.
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(skyDome());
scene.environment = pmrem.fromScene(envScene, 0, 1, 500).texture;
scene.environmentIntensity = 0.45;
pmrem.dispose();

// --- lighting ---------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0xa8d4ff, 0xd9743a, 0.55));
const sun = new THREE.DirectionalLight(0xffdcae, 1.7);
sun.position.set(-13, 19, 11);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 3.5;
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.02;
const sc = sun.shadow.camera;
sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 60;
sc.updateProjectionMatrix();
scene.add(sun, sun.target);
// A cool rim from behind separates the rock silhouettes from the sky.
const rim = new THREE.DirectionalLight(0x7fb6ff, 0.35);
rim.position.set(12, 6, -18);
scene.add(rim);

// --- world ------------------------------------------------------------------
const [updateSky, level, player, hud] = await Promise.all([
  buildSky(scene, LEVEL_LENGTH),
  buildLevel(scene),
  makePlayer(scene),
  makeHud(renderer),
]);
const particles = makeParticles(scene);
const input = makeInput();

// --- post -------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.55, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  // World-space particle radius -> pixels: height / (2 tan(fov/2)), divided
  // per-vertex by view depth.
  particles.setScale(innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
}
addEventListener('resize', resize);
resize();

// --- game state -------------------------------------------------------------
const hudEl = document.getElementById('hud');
const bannerEl = document.getElementById('banner');
const flashEl = document.getElementById('flash');

const state = {
  coins: 0,
  gems: 0,
  hasKey: false,
  invuln: 0,
  respawn: CHECKPOINTS[0].pos.clone(),
  checkpoint: 0,
  won: false,
  shake: 0,
  hint: 'Arrows / WASD to move · Space to jump',
};

player.pos.copy(state.respawn);

function banner(big, small, hold = 2.2) {
  bannerEl.innerHTML = `<div class="big">${big}</div><div>${small}</div>`;
  bannerEl.classList.add('on');
  if (hold > 0) setTimeout(() => bannerEl.classList.remove('on'), hold * 1000);
}
banner('SKYBOUND', 'Reach the flag · collect what glitters', 3.2);

function flash(on) {
  flashEl.style.opacity = on ? '0.35' : '0';
  if (on) setTimeout(() => (flashEl.style.opacity = '0'), 130);
}

function hurt(reason) {
  if (state.invuln > 0 || state.won) return;
  state.invuln = 1.4;
  hud.health -= 1;
  state.shake = 1;
  flash(true);
  particles.burst(player.pos.x, player.pos.y + 0.8, 0, 26, '#ff6b6b', { speed: 5, up: 2.5 });
  player.vel.set(-player.facing * 5, 8, 0);
  if (hud.health <= 0) {
    banner('OUCH', 'Back to the last safe rock', 1.8);
    hud.health = hud.MAX_HEARTS;
    state.checkpoint = Math.max(0, state.checkpoint - 1);
    respawnNow();
  } else if (reason === 'fall') {
    respawnNow();
  }
}

function respawnNow() {
  player.pos.copy(CHECKPOINTS[state.checkpoint].pos);
  player.vel.set(0, 0, 0);
  state.invuln = 1.2;
  particles.burst(player.pos.x, player.pos.y + 0.8, 0, 30, '#9fe4ff', { speed: 4, up: 2 });
}

addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && state.won) location.reload();
});

const near = (a, bx, by, r) => {
  const dx = a.pos.x - bx;
  const dy = a.pos.y + a.HEIGHT * 0.5 - by;
  return dx * dx + dy * dy < r * r;
};

// --- loop -------------------------------------------------------------------
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, 0);
const camLook = camTarget.clone();

renderer.setAnimationLoop(guardFrame(() => {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  const t = clock.getElapsedTime();
  const now = performance.now() / 1000;

  level.update(dt, t);
  const ev = stepPlayer(player, input, level.solids, dt, now);

  if (ev.landed) {
    particles.burst(player.pos.x, player.pos.y + 0.05, 0, 8, '#ffe9c0', { speed: 2.2, up: 0.6, life: 0.35, size: 0.10 });
  }
  if (ev.jumped) {
    particles.burst(player.pos.x, player.pos.y + 0.05, 0, 6, '#ffffff', { speed: 1.6, up: 0.4, life: 0.3, size: 0.09 });
  }

  // checkpoints
  for (let i = CHECKPOINTS.length - 1; i > state.checkpoint; i--) {
    if (player.pos.x > CHECKPOINTS[i].x) { state.checkpoint = i; break; }
  }

  // coins
  for (const c of level.coins) {
    if (c.taken || !near(player, c.obj.position.x, c.obj.position.y, 1.05)) continue;
    c.taken = true;
    c.obj.visible = false;
    state.coins++;
    particles.burst(c.obj.position.x, c.obj.position.y, 0, 16, '#ffcc45', { speed: 3.4, up: 1.8, life: 0.55, size: 0.17 });
  }
  // gems
  for (const g of level.gems) {
    if (g.taken || !near(player, g.obj.position.x, g.obj.position.y, 1.15)) continue;
    g.taken = true;
    g.obj.visible = false;
    state.gems++;
    state.shake = 0.4;
    particles.burst(g.obj.position.x, g.obj.position.y, 0, 40, '#b6f2ff', { speed: 6, up: 2.4, life: 0.8, size: 0.26 });
  }
  // key
  if (!level.key.taken && near(player, level.key.obj.position.x, level.key.obj.position.y, 1.2)) {
    level.key.taken = true;
    level.key.obj.visible = false;
    state.hasKey = true;
    state.hint = 'The door will know you have it';
    particles.burst(level.key.x, level.key.y, 0, 34, '#ffe07a', { speed: 5, up: 2.2, life: 0.8, size: 0.2 });
  }
  // bouncers
  for (const b of level.bouncers) {
    if (player.vel.y > 1) continue;
    if (Math.abs(player.pos.x - b.x) < 1.05 && player.pos.y > b.y - 0.2 && player.pos.y < b.y + 1.5) {
      player.vel.y = 23;
      player.stretch = 1.55;
      player.grounded = false;
      b.squash = 1;
      particles.burst(b.x, b.y + 0.5, 0, 20, '#a6ffd8', { speed: 4.5, up: 1.2, life: 0.5, size: 0.17 });
    }
  }
  // lever
  if (!level.lever.on && near(player, level.lever.x, level.lever.y + 0.7, 1.3)) {
    if (level.openBridge()) {
      state.hint = 'Bridge down — cross while it holds';
      banner('CLUNK', 'The bridge unfolds', 1.6);
      particles.burst(level.lever.x, level.lever.y + 1, 0, 24, '#c8e8ff', { speed: 4, up: 1.6, life: 0.6 });
    }
  }
  // door
  if (!level.door.open && state.hasKey && Math.abs(player.pos.x - level.door.x) < 2.4) {
    level.door.open = true;
    state.hint = 'Onward — the flag is close';
    particles.burst(level.door.x, level.door.y + 2, 0, 46, '#ffd98a', { speed: 5.5, up: 2, life: 0.9, size: 0.24 });
  }
  // saws
  for (const s of level.saws) {
    if (near(player, s.obj.position.x, s.obj.position.y, s.r + 0.55)) hurt('saw');
  }
  // bees
  for (const b of level.bees) {
    if (!b.alive) continue;
    if (!near(player, b.obj.position.x, b.obj.position.y, b.r + 0.6)) continue;
    const stomping = player.vel.y < -1 && player.pos.y > b.obj.position.y;
    if (stomping) {
      b.alive = false;
      player.vel.y = 12;
      player.stretch = 1.35;
      state.shake = 0.5;
      particles.burst(b.obj.position.x, b.obj.position.y, 0, 26, '#ffe08a', { speed: 4.5, up: 1.8, life: 0.6 });
    } else {
      hurt('bee');
    }
  }
  // goal
  if (!state.won && near(player, level.flag.x, level.flag.y + 1.2, 1.6)) {
    state.won = true;
    level.flag.raised = true;
    player.play('Wave', 0.2);
    player.dead = true;
    banner('LEVEL CLEAR', `${state.coins} coins · ${state.gems}/3 gems &nbsp;·&nbsp; press R to run it again`, 0);
    for (let i = 0; i < 6; i++) {
      setTimeout(() => particles.burst(level.flag.x + (Math.random() - 0.5) * 4, level.flag.y + 2 + Math.random() * 3, 0,
        40, ['#ffd35e', '#ff8fd8', '#9fe4ff'][i % 3], { speed: 7, up: 3, life: 1.2, size: 0.26 }), i * 220);
    }
  }
  if (player.pos.y < -16) hurt('fall');

  state.invuln = Math.max(0, state.invuln - dt);
  player.model.visible = state.invuln <= 0 || Math.sin(t * 40) > -0.3;

  particles.update(dt);

  // --- camera: lag + look-ahead, with a touch of shake -----------------------
  const ahead = clamp(player.vel.x * 0.32, -3, 3);
  camTarget.x = damp(camTarget.x, player.pos.x + ahead, 3.4, dt);
  camTarget.y = damp(camTarget.y, player.pos.y + 1.5, 2.4, dt);
  camLook.lerp(camTarget, 1 - Math.exp(-6 * dt));

  state.shake = Math.max(0, state.shake - dt * 2.4);
  const sh = state.shake * state.shake * 0.5;
  // Camera sits slightly off-axis and looks slightly back across the player:
  // enough parallax to read as 2.5D, not enough to hurt jump judgement.
  camera.position.set(
    camTarget.x + 2.4 + (Math.random() - 0.5) * sh,
    camTarget.y + 2.9 + (Math.random() - 0.5) * sh,
    15.5
  );
  camera.lookAt(camLook.x + 0.7, camLook.y + 0.5, 0);

  sun.position.set(camTarget.x - 13, camTarget.y + 19, 11);
  sun.target.position.set(camTarget.x, camTarget.y, 0);
  sun.target.updateMatrixWorld();

  updateSky(dt, camera.position.x);
  hud.update(dt, t);

  hudEl.innerHTML =
    `<b>${state.coins}</b> coins &nbsp; <b>${state.gems}</b>/3 gems &nbsp; ` +
    `${state.hasKey ? '<b>KEY</b>' : '<span style="opacity:.45">key</span>'}<br>` +
    `<span style="opacity:.7">${state.hint}</span>`;

  composer.render();
  hud.render();
}));
