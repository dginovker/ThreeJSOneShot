import * as THREE from 'three';
import { setShadow } from './scenery.js';

export const HALF_W = 0.55;
export const HEIGHT = 1.9;

const GRAVITY = 48;
const MAX_SPEED = 10;
const GROUND_ACCEL = 90;
const AIR_ACCEL = 45;
const FRICTION = 75;
const JUMP_V = 18.5;      // ~3.6 units of height: clears one platform step
const CUT_JUMP = 0.45;    // velocity kept when the jump button is released early
const COYOTE = 0.09;
const BUFFER = 0.12;
const TERMINAL = 42;
const MODEL_SCALE = 0.5;  // Character.gltf is 3.76 units tall at scale 1

const CLIPS = ['Idle', 'Run', 'Jump', 'Jump_Idle', 'Jump_Land', 'HitReact', 'Death', 'Wave'];

export function createPlayer(scene, gltf, hooks) {
  const root = new THREE.Group();
  const yaw = new THREE.Group();
  const squash = new THREE.Group();
  const model = gltf.scene;
  model.scale.setScalar(MODEL_SCALE);
  setShadow(model, true, false);
  squash.add(model);
  yaw.add(squash);
  root.add(yaw);
  scene.add(root);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const name of CLIPS) {
    const clip = gltf.animations.find((a) => a.name === name);
    if (!clip) throw new Error(`Character.gltf is missing the "${name}" animation`);
    actions[name] = mixer.clipAction(clip);
  }
  actions.Jump.setLoop(THREE.LoopOnce, 1);
  actions.Jump.clampWhenFinished = true;
  actions.HitReact.setLoop(THREE.LoopOnce, 1);
  actions.Death.setLoop(THREE.LoopOnce, 1);
  actions.Death.clampWhenFinished = true;

  let current = null;
  function play(name, fade = 0.15) {
    if (current === name) return;
    const next = actions[name];
    next.reset().fadeIn(fade).play();
    if (current) actions[current].fadeOut(fade);
    current = name;
  }
  play('Idle', 0);

  const p = {
    root,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1,
    dead: false,
    hurtTimer: 0,
    invuln: 0,
    get cx() { return this.x; },
    get cy() { return this.y + HEIGHT / 2; },
  };

  let coyote = 0;
  let buffered = 0;
  let stretch = 1;
  let stretchVel = 0;
  let turn = 1;
  let wasOnGround = false;
  // Only a jump the player started may be cut short by releasing the button —
  // a bouncer or a stomp launch keeps its full height.
  let cuttable = false;

  function box() {
    return { x0: p.x - HALF_W, x1: p.x + HALF_W, y0: p.y, y1: p.y + HEIGHT };
  }

  function hits(b, s) {
    return s.active !== false && b.x1 > s.x0 && b.x0 < s.x1 && b.y1 > s.y0 && b.y0 < s.y1;
  }

  function moveAndCollide(dt, solids) {
    p.x += p.vx * dt;
    for (const s of solids) {
      const b = box();
      if (!hits(b, s)) continue;
      // Only push out sideways when the overlap is genuinely a wall: a sliver
      // of vertical overlap at the lip of a platform should not stop a run.
      if (Math.min(b.y1, s.y1) - Math.max(b.y0, s.y0) < 0.12) continue;
      p.x = p.vx > 0 ? s.x0 - HALF_W : s.x1 + HALF_W;
      p.vx = 0;
    }

    p.y += p.vy * dt;
    p.onGround = false;
    for (const s of solids) {
      const b = box();
      if (!hits(b, s)) continue;
      if (p.vy <= 0) {
        p.y = s.y1;
        p.onGround = true;
      } else {
        p.y = s.y0 - HEIGHT;
      }
      p.vy = 0;
    }
  }

  function update(dt, input, solids) {
    const wantJump = input.jump && !input.jumpWasDown;
    if (wantJump) buffered = BUFFER;
    buffered -= dt;
    coyote -= dt;
    p.invuln -= dt;
    p.hurtTimer -= dt;

    if (!p.dead) {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const accel = p.onGround ? GROUND_ACCEL : AIR_ACCEL;
      if (dir) {
        p.vx = THREE.MathUtils.clamp(p.vx + dir * accel * dt, -MAX_SPEED, MAX_SPEED);
        p.facing = dir;
      } else if (p.onGround) {
        p.vx -= Math.sign(p.vx) * Math.min(Math.abs(p.vx), FRICTION * dt);
      }

      if (buffered > 0 && (p.onGround || coyote > 0)) {
        p.vy = JUMP_V;
        buffered = 0;
        coyote = 0;
        p.onGround = false;
        stretch = 1.3;
        stretchVel = 0;
        cuttable = true;
        play('Jump', 0.06);
        hooks.onJump?.(p);
      }
      // Applied once, on the release itself. Bleeding it off every frame
      // instead would turn any tap into a hop of almost no height.
      if (cuttable && p.vy > 0 && !input.jump && input.jumpWasDown) p.vy *= CUT_JUMP;
    }

    p.vy = Math.max(-TERMINAL, p.vy - GRAVITY * dt);
    const fallSpeed = -p.vy;
    moveAndCollide(dt, solids);

    if (p.onGround) {
      coyote = COYOTE;
      cuttable = false;
    }
    if (p.onGround && !wasOnGround) {
      // Damped spring back to neutral, driven from a squash proportional to
      // the impact, so a long fall lands heavier than a hop.
      stretch = 1 - Math.min(0.34, fallSpeed / 70);
      stretchVel = 0;
      hooks.onLand?.(p, fallSpeed);
    }
    wasOnGround = p.onGround;

    if (p.dead) play('Death', 0.1);
    else if (p.hurtTimer > 0) play('HitReact', 0.08);
    else if (!p.onGround) play(p.vy > 0.5 ? 'Jump' : 'Jump_Idle', 0.12);
    else if (Math.abs(p.vx) > 0.6) play('Run', 0.12);
    else play('Idle', 0.18);
    actions.Run.timeScale = THREE.MathUtils.clamp(Math.abs(p.vx) / 7, 0.6, 1.6);

    stretchVel += (1 - stretch) * 260 * dt - stretchVel * 15 * dt;
    stretch += stretchVel * dt;
    const lateral = 1 / Math.sqrt(Math.max(0.2, stretch));
    squash.scale.set(lateral, stretch, lateral);

    turn = THREE.MathUtils.damp(turn, p.facing, 14, dt);
    yaw.rotation.y = turn * Math.PI * 0.5;
    yaw.rotation.z = THREE.MathUtils.damp(yaw.rotation.z, -p.vx * 0.014 * p.facing, 8, dt);

    root.position.set(p.x, p.y, 0);
    root.visible = p.invuln <= 0 || Math.sin(p.invuln * 45) > -0.2;
    mixer.update(dt);
  }

  p.update = update;
  p.play = play;
  p.hurt = (fromX) => {
    p.hurtTimer = 0.35;
    p.invuln = 1.1;
    p.vy = 9;
    p.vx = Math.sign(p.x - fromX || 1) * 9;
    play('HitReact', 0.05);
  };
  p.bounce = (v) => {
    p.vy = v;
    cuttable = false;
    stretch = 1.35;
    stretchVel = 0;
  };
  p.teleport = (x, y) => {
    p.x = x;
    p.y = y;
    p.vx = p.vy = 0;
    p.dead = false;
    p.hurtTimer = 0;
    p.invuln = 0.8;
    root.visible = true;
  };
  return p;
}
