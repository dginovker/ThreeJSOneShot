import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { installFatalHandler, guardFrame } from './fatal.js';
import { buildSkyDome, buildBackdrop, SKY_MID } from './sky.js';
import { buildLevel, ISLANDS, SPAN, START, KILL_Y } from './level.js';
import { Player, HEIGHT } from './player.js';
import { Particles } from './fx.js';
import { buildHud } from './hud.js';
import { damp, clamp } from './util.js';

installFatalHandler();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
buildSkyDome(scene);
// Low, far fog only: enough to push the backdrop bands apart without washing
// out the play plane at z=0.
scene.fog = new THREE.Fog(SKY_MID.clone().lerp(new THREE.Color(0xffffff), 0.3), 55, 230);

const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 900);

scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x6b5433, 1.15));
const sun = new THREE.DirectionalLight(0xffe6bb, 3.1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);
// A cool bounce from behind separates the character from the warm island tops.
const rim = new THREE.DirectionalLight(0x8fd0ff, 1.0);
rim.position.set(-6, 4, -8);
scene.add(rim);

const particles = new Particles(scene);
const level = await buildLevel(scene);
const backdrop = await buildBackdrop(scene, SPAN);
const player = await Player.create(scene);
const hud = await buildHud();
player.respawn(START);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// Threshold above 1.0 so only emissive pickups and the sun bloom; a lower one
// hazes the whole sky into milk.
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.6, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  hud.layout(w, h);
}
addEventListener('resize', resize);
resize();

const banner = document.getElementById('hud');
const state = { coins: 0, gems: 0, gemsTotal: level.gems.length, hasKey: false, hearts: 3, message: '' };
let checkpoint = START.clone();
const shake = { power: 0, x: 0, y: 0 };

// Fixed camera rig: side-on, nudged off-axis so the islands read as solid, and
// lagging behind the player so motion has weight.
const camTarget = new THREE.Vector3(START.x, START.y + 1.4, 0);
const camPos = new THREE.Vector3();
const OFFSET = new THREE.Vector3(3.0, 2.3, 14.0);
camera.position.copy(camTarget).add(OFFSET);

function say(text, ms = 2200) {
  state.message = text;
  banner.textContent = text;
  clearTimeout(say.timer);
  if (ms) say.timer = setTimeout(() => { if (state.message === text) banner.textContent = ''; }, ms);
}
say('← → to run · Space to jump', 5000);

function currentIsland(x) {
  let best = null;
  for (const i of ISLANDS) if (x >= i.x0 - 1 && x <= i.x1 + 1) best = i;
  return best;
}

function overlaps(px, py, x, y, r) {
  const dx = px - x;
  const dy = py - y;
  return dx * dx + dy * dy < r * r;
}

// The bee needs a box, not a circle: a circle around its centre leaves no
// vertical band where the player is both overlapping and still above it, so a
// stomp can never land.
const BEE_HALF_W = 0.6;
const BEE_TOP = 0.94;
function touchesBee(p, bee) {
  const b = bee.obj.position;
  return Math.abs(p.pos.x - b.x) < BEE_HALF_W + 0.34
    && p.pos.y < b.y + BEE_TOP
    && p.pos.y + 1.7 > b.y;
}

const timer = new THREE.Timer();
let time = 0;

renderer.setAnimationLoop(guardFrame(() => {
  timer.update();
  // Clamped so an alt-tab doesn't teleport the player through a platform.
  const dt = Math.min(timer.getDelta(), 1 / 30);
  time += dt;

  level.update(dt, time);
  backdrop.update(dt, time);
  player.update(dt, level.solids, particles);

  const pc = player.center();

  for (const c of level.coins) {
    if (!c.taken && overlaps(pc.x, pc.y, c.obj.position.x, c.obj.position.y, 0.95)) {
      c.take(particles);
      state.coins++;
    }
  }
  for (const g of level.gems) {
    if (!g.taken && overlaps(pc.x, pc.y, g.obj.position.x, g.obj.position.y, 1.05)) {
      g.take(particles);
      state.gems++;
      state.coins += g.value;
      shake.power = Math.max(shake.power, 0.12);
      say(`Gem ${state.gems}/${state.gemsTotal}`, 1400);
    }
  }
  if (!level.key.taken && overlaps(pc.x, pc.y, level.key.obj.position.x, level.key.obj.position.y, 1.1)) {
    level.key.take(particles);
    state.hasKey = true;
    say('Got the key — the door will open', 2600);
  }

  for (const b of level.bouncers) {
    if (player.vel.y <= 0 && overlaps(pc.x, player.pos.y, b.x, b.y + 0.5, 1.1)) {
      player.bounce(b.power);
      b.play('Bouncer_Bounce', { once: true, fade: 0.05 });
      b.cooldown = 0.5;
      particles.burst(new THREE.Vector3(b.x, b.y + 0.4, 0), 0x9df5ff, { count: 18, speed: 5, ttl: 0.5, gravity: 5 });
      shake.power = Math.max(shake.power, 0.1);
    }
  }

  if (!level.lever.on && overlaps(pc.x, pc.y, level.lever.x, level.lever.y + 0.6, 1.1)) {
    level.lever.on = true;
    level.lever.play('Lever_On', { once: true });
    particles.burst(new THREE.Vector3(level.lever.x, level.lever.y + 0.8, 0), 0xffd772, { count: 20, speed: 4, ttl: 0.6 });
    say('Bridge extended!', 2200);
  }

  if (level.door.locked && state.hasKey && Math.abs(pc.x - level.door.x) < 3) {
    level.door.locked = false;
    particles.burst(new THREE.Vector3(level.door.x, level.door.y + 1.2, 0), 0xffe27a, { count: 30, speed: 5, ttl: 0.8 });
    say('Unlocked!', 1600);
  } else if (level.door.locked && Math.abs(pc.x - level.door.x) < 1.6) {
    say('Locked — find the key up high', 1200);
  }

  // 0.9 sits just under the blade's own 0.75 radius plus the player's half
  // width: close to what the eye reads, and never a hit from clear air.
  for (const s of level.saws) {
    if (overlaps(pc.x, pc.y, s.obj.position.x, s.obj.position.y, 0.9) && player.hurt(s.obj.position.x, particles)) {
      shake.power = 0.35;
    }
  }

  for (const b of level.bees) {
    if (b.dead) continue;
    if (!touchesBee(player, b)) continue;
    // Stomp beats contact: falling with feet still above the bee's midline.
    if (player.vel.y < -1 && player.pos.y > b.obj.position.y + 0.35) {
      b.dead = 0.0001;
      player.vel.y = 11;
      player.squash.set(0.8, 1.3);
      particles.burst(b.obj.position, 0xffd34d, { count: 22, speed: 5, ttl: 0.6 });
      shake.power = Math.max(shake.power, 0.18);
    } else if (player.hurt(b.obj.position.x, particles)) {
      shake.power = 0.3;
    }
  }

  if (player.pos.y < KILL_Y) {
    player.hurt(player.pos.x, particles);
    // hurt() may have emptied the last heart; respawn regardless so a dead
    // player sits on the island with the restart prompt instead of falling forever.
    player.respawn(checkpoint);
  }

  const island = currentIsland(player.pos.x);
  if (island && player.grounded) checkpoint.set(clamp(player.pos.x, island.x0 + 1, island.x1 - 1), island.top + 0.1, 0);

  if (!player.won && Math.abs(pc.x - level.flag.x) < 1.2 && Math.abs(player.pos.y - level.flag.y) < 2) {
    player.won = true;
    level.flag.raised = 0.001;
    particles.burst(new THREE.Vector3(level.flag.x, level.flag.y + 1.4, 0), 0xfff0a0, { count: 60, speed: 7, ttl: 1.3, size: 1.4 });
    say(`Level complete! ${state.coins} ${state.coins === 1 ? 'coin' : 'coins'} · ${state.gems}/${state.gemsTotal} gems`, 0);
  }
  if (player.dead && !say.deathShown) {
    say.deathShown = true;
    say('Out of hearts — press R to restart', 0);
  }

  state.hearts = Math.max(0, player.hearts);
  hud.update(dt, time, state);

  camTarget.x += (player.pos.x + player.vel.x * 0.22 - camTarget.x) * damp(dt, 3.4);
  camTarget.y += (player.pos.y + HEIGHT * 0.6 - camTarget.y) * damp(dt, 2.2);
  camPos.copy(camTarget).add(OFFSET);

  shake.power = Math.max(0, shake.power - dt * 1.2);
  const s = shake.power * shake.power;
  shake.x = (Math.random() - 0.5) * s * 2.4;
  shake.y = (Math.random() - 0.5) * s * 2.4;
  camera.position.set(camPos.x + shake.x, camPos.y + shake.y, camPos.z);
  camera.lookAt(camTarget.x + shake.x * 0.5, camTarget.y - 0.5, 0);

  sun.position.set(camTarget.x - 13, camTarget.y + 22, 13);
  sun.target.position.set(camTarget.x, camTarget.y, 0);
  sun.target.updateMatrixWorld();

  particles.update(dt);
  composer.render();
  hud.render(renderer);
}));

addEventListener('keydown', (e) => { if (e.code === 'KeyR') location.reload(); });

// Debug handle for in-browser inspection during development.
globalThis.__game = { scene, camera, level, player, renderer, THREE, state };
