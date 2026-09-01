import * as THREE from 'three';
import { loadGltf } from './models.js';
import { anchor, shadows, clamp, damp } from './util.js';

const GRAVITY = 34;
const RUN_SPEED = 9;
const ACCEL = 70;
const AIR_ACCEL = 32;
const FRICTION = 90;
const JUMP_V = 13.2;
const CUT = 0.45;          // velocity kept when jump is released early
const COYOTE = 0.10;
const BUFFER = 0.13;
const HALF_W = 0.38;
const HEIGHT = 1.55;
const STICK = 2;      // downward bias that keeps the feet on a sinking platform

const KEY_MAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyZ: 'jump',
};

export function makeInput() {
  const held = { left: false, right: false, jump: false };
  let jumpPressedAt = -1;
  addEventListener('keydown', (e) => {
    const k = KEY_MAP[e.code];
    if (!k) return;
    e.preventDefault();
    if (k === 'jump' && !held.jump) jumpPressedAt = performance.now() / 1000;
    held[k] = true;
  });
  addEventListener('keyup', (e) => {
    const k = KEY_MAP[e.code];
    if (k) held[k] = false;
  });
  addEventListener('blur', () => { held.left = held.right = held.jump = false; });
  return {
    held,
    consumeJump(now) {
      if (jumpPressedAt >= 0 && now - jumpPressedAt <= BUFFER) { jumpPressedAt = -1; return true; }
      return false;
    },
  };
}

export async function makePlayer(scene) {
  const gltf = await loadGltf('Character');
  const model = anchor(gltf.scene, { height: HEIGHT });
  shadows(model, true, false);

  // The mesh lives under a squash pivot so scaling never moves the feet.
  const squash = new THREE.Group();
  squash.add(model);
  const root = new THREE.Group();
  root.add(squash);
  scene.add(root);

  const mixer = new THREE.AnimationMixer(gltf.scene);
  const clips = {};
  for (const name of ['Idle', 'Run', 'Jump', 'Jump_Idle', 'Jump_Land', 'HitReact', 'Death', 'Wave']) {
    const clip = THREE.AnimationClip.findByName(gltf.animations, name);
    if (!clip) throw new Error(`Character is missing the "${name}" animation clip`);
    clips[name] = mixer.clipAction(clip);
  }
  let current = null;
  function play(name, fade = 0.15) {
    if (current === name) return;
    const next = clips[name];
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (current) clips[current].fadeOut(fade);
    current = name;
  }
  play('Idle', 0);

  return {
    root, model, squash, mixer, play,
    pos: root.position,
    vel: new THREE.Vector3(),
    facing: 1,
    grounded: false,
    coyote: 0,
    stretch: 1,
    dead: false,
    HALF_W, HEIGHT,
  };
}

/** Runs one physics step and returns the events the game reacts to. */
export function stepPlayer(p, input, solids, dt, now) {
  const events = { landed: false, jumped: false };
  const wasGrounded = p.grounded;
  const dir = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
  const accel = p.grounded ? ACCEL : AIR_ACCEL;

  if (dir !== 0) {
    p.vel.x += dir * accel * dt;
    p.vel.x = clamp(p.vel.x, -RUN_SPEED, RUN_SPEED);
    p.facing = dir;
  } else if (p.grounded) {
    const drop = FRICTION * dt;
    p.vel.x = Math.abs(p.vel.x) <= drop ? 0 : p.vel.x - Math.sign(p.vel.x) * drop;
  }

  p.coyote = p.grounded ? COYOTE : Math.max(0, p.coyote - dt);
  if (p.coyote > 0 && input.consumeJump(now)) {
    p.vel.y = JUMP_V;
    p.coyote = 0;
    p.grounded = false;
    p.stretch = 1.3;
    events.jumped = true;
  }
  if (!input.held.jump && p.vel.y > 0) p.vel.y = Math.max(p.vel.y * (1 - (1 - CUT) * dt * 12), 0);

  p.vel.y = Math.max(p.vel.y - GRAVITY * dt, -34);

  p.pos.x += p.vel.x * dt;
  const wasFalling = p.vel.y < 0;
  p.pos.y += p.vel.y * dt;
  p.grounded = false;

  // Resolve on the axis of least penetration. Axis-separated sweeps look
  // simpler but eject the player sideways off a platform that drifts up into
  // his feet, which is exactly what every platform here does.
  for (const s of solids) {
    if (!s.active) continue;
    const px = Math.min(p.pos.x + HALF_W - s.minX, s.maxX - (p.pos.x - HALF_W));
    const py = Math.min(p.pos.y + HEIGHT - s.minY, s.maxY - p.pos.y);
    if (px <= 0 || py <= 0) continue;
    if (px < py) {
      p.pos.x += p.pos.x < (s.minX + s.maxX) / 2 ? -px : px;
      p.vel.x = 0;
    } else if (p.pos.y + HEIGHT / 2 > (s.minY + s.maxY) / 2) {
      p.pos.y = s.maxY;
      p.grounded = true;
      if (!wasGrounded && wasFalling) {
        events.landed = true;
        if (p.vel.y < -6) p.stretch = 0.68;
      }
      // Keep pressing down instead of zeroing: the platforms drift, and a
      // player with vel.y == 0 separates from one that is sinking away.
      p.vel.y = -STICK;
    } else {
      p.pos.y = s.minY - HEIGHT;
      p.vel.y = Math.min(p.vel.y, 0);
    }
  }

  p.stretch = damp(p.stretch, 1, 12, dt);
  const airStretch = p.grounded ? 0 : clamp(p.vel.y * 0.018, -0.14, 0.16);
  const sy = p.stretch + airStretch;
  p.squash.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));

  p.model.rotation.y = damp(p.model.rotation.y, p.facing * Math.PI * 0.5, 18, dt);
  // Lean into the run; a rigid upright sprite reads as sliding, not running.
  p.squash.rotation.z = damp(p.squash.rotation.z, -p.vel.x * 0.012, 10, dt);

  if (!p.dead) {
    if (!p.grounded) p.play(p.vel.y > 1 ? 'Jump' : 'Jump_Idle');
    else if (Math.abs(p.vel.x) > 0.6) p.play('Run');
    else p.play('Idle');
  }
  p.mixer.update(dt);
  return events;
}
