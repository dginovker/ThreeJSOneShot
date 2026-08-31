import * as THREE from 'three';
import { spawn, clip } from './assets.js';
import { sfx } from './sfx.js';

const HALF_W = 0.82;
const HEIGHT = 3.35;

const GRAVITY = 62;
const FALL_GRAVITY = 1.45;      // heavier on the way down: snappier, less floaty
const LOW_JUMP_GRAVITY = 2.7;   // extra pull once jump is released: tap = hop, hold = leap
const JUMP_V = 26;
const MAX_RUN = 13.5;
const GROUND_ACCEL = 110;
const GROUND_FRICTION = 105;
const AIR_ACCEL = 62;
const AIR_DRAG = 9;
const TERMINAL = 48;
const COYOTE = 0.11;
const JUMP_BUFFER = 0.13;
const INVULN = 1.2;
// Vertical slack for the horizontal sweep. Without it, an island drifting up by
// a fraction of a unit counts as a side overlap and the wall-push teleports the
// player back to the platform's left edge mid-jump.
const SKIN = 0.12;

export class Player {
  constructor(scene, particles, level) {
    this.particles = particles;
    this.level = level;

    this.root = new THREE.Group();
    this.visual = new THREE.Group();
    this.model = spawn('Character');
    this.visual.add(this.model);
    this.root.add(this.visual);
    scene.add(this.root);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const name of ['Idle', 'Run', 'Jump', 'Jump_Idle', 'Jump_Land', 'HitReact', 'Death', 'Wave']) {
      this.actions[name] = this.mixer.clipAction(clip('Character', name));
    }
    this.actions.Death.loop = THREE.LoopOnce;
    this.actions.Death.clampWhenFinished = true;
    this.current = null;
    this.#play('Idle', 0);

    this.pos = new THREE.Vector3(level.spawn.x, level.spawn.y, 0);
    this.vel = new THREE.Vector3();
    this.facing = 1;
    this.grounded = false;
    this.ground = null;
    this.coyote = 0;
    this.buffer = 0;
    this.cutJump = false;
    this.squash = new THREE.Vector2(1, 1); // (xz, y)
    this.dustTimer = 0;
    this.health = 3;
    this.maxHealth = 3;
    this.invuln = 0;
    this.dead = false;
    this.deadTimer = 0;
    this.checkpoint = this.pos.clone();
    this.landImpact = 0;
    this.hurtTimer = 0;
  }

  get aabb() {
    return { x0: this.pos.x - HALF_W, x1: this.pos.x + HALF_W, y0: this.pos.y, y1: this.pos.y + HEIGHT };
  }

  get center() {
    return new THREE.Vector3(this.pos.x, this.pos.y + HEIGHT * 0.5, 0);
  }

  #play(name, fade = 0.16) {
    if (this.current === name) return;
    const next = this.actions[name];
    next.reset().setEffectiveWeight(1).play();
    if (this.current) next.crossFadeFrom(this.actions[this.current], fade, false);
    this.current = name;
  }

  #overlaps(solid, x, y, skin = 0) {
    return x + HALF_W > solid.x0 && x - HALF_W < solid.x1 &&
      y < solid.top - skin && y + HEIGHT > solid.bottom + skin;
  }

  update(dt, input, solids) {
    if (this.dead) return this.#updateDead(dt);

    this.invuln = Math.max(this.invuln - dt, 0);
    this.hurtTimer = Math.max(this.hurtTimer - dt, 0);

    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const accel = this.grounded ? GROUND_ACCEL : AIR_ACCEL;
    if (dir !== 0) {
      this.vel.x += dir * accel * dt;
      this.vel.x = THREE.MathUtils.clamp(this.vel.x, -MAX_RUN, MAX_RUN);
      this.facing = dir;
    } else {
      const drag = (this.grounded ? GROUND_FRICTION : AIR_DRAG) * dt;
      this.vel.x -= Math.sign(this.vel.x) * Math.min(Math.abs(this.vel.x), drag);
    }

    // Ride the island's drift before anything can clear `ground`, so the jump
    // frame still starts from the surface the player was standing on.
    if (this.grounded && this.ground) this.pos.y += this.ground.dy;

    this.buffer = input.jumpPressed ? JUMP_BUFFER : Math.max(this.buffer - dt, 0);
    if (this.buffer > 0 && this.coyote > 0) {
      this.vel.y = JUMP_V;
      this.buffer = this.coyote = 0;
      this.grounded = false;
      this.ground = null;
      this.cutJump = true;
      this.squash.set(0.76, 1.3);
      this.#play('Jump', 0.06);
      sfx.jump();
      this.particles.burst(this.pos, { count: 8, color: 0xfff0c8, speed: 5, size: 0.35, life: 0.35, gravity: -6, up: 0.1 });
    }
    const rising = this.vel.y > 0;
    const g = GRAVITY * (rising ? (this.cutJump && !input.jump ? LOW_JUMP_GRAVITY : 1) : FALL_GRAVITY);
    this.vel.y = Math.max(this.vel.y - g * dt, -TERMINAL);

    this.pos.x += this.vel.x * dt;
    for (const s of solids) {
      if (!this.#overlaps(s, this.pos.x, this.pos.y, SKIN)) continue;
      this.pos.x = this.vel.x > 0 ? s.x0 - HALF_W : s.x1 + HALF_W;
      this.vel.x = 0;
    }

    const wasGrounded = this.grounded;
    this.grounded = false;
    this.ground = null;
    this.pos.y += this.vel.y * dt;
    for (const s of solids) {
      if (!this.#overlaps(s, this.pos.x, this.pos.y)) continue;
      if (this.vel.y <= 0) {
        this.pos.y = s.top;
        this.landImpact = -this.vel.y;
        this.grounded = true;
        this.ground = s;
      } else {
        this.pos.y = s.bottom - HEIGHT;
      }
      this.vel.y = 0;
    }

    if (this.grounded) {
      this.coyote = COYOTE;
      if (!wasGrounded) this.#land();
    } else {
      this.coyote = Math.max(this.coyote - dt, 0);
    }

    this.#animate(dt, dir);
    this.#applyTransform(dt);

    if (this.pos.y < this.level.killY) {
      this.health -= 1;
      this.kill();
    }
  }

  #land() {
    const impact = THREE.MathUtils.clamp(this.landImpact / TERMINAL, 0, 1);
    this.squash.set(1 + 0.42 * impact, 1 - 0.36 * impact);
    if (impact > 0.12) {
      sfx.land();
      this.particles.burst(this.pos, {
        count: Math.round(6 + impact * 16), color: 0xf3e2c0, speed: 4 + impact * 8,
        size: 0.35, life: 0.4, gravity: -10, up: 0.25, spread: 1.4,
      });
    }
  }

  /** Called from the step loop, which knows where the hazards are. */
  markCheckpoint() {
    this.checkpoint.set(this.pos.x, this.pos.y + 0.05, 0);
  }

  #animate(dt, dir) {
    if (this.hurtTimer > 0) this.#play('HitReact', 0.05);
    else if (!this.grounded) this.#play(this.vel.y > 1 ? 'Jump' : 'Jump_Idle', 0.12);
    else if (Math.abs(this.vel.x) > 0.6) this.#play('Run', 0.12);
    else this.#play('Idle', 0.2);

    this.actions.Run.timeScale = THREE.MathUtils.clamp(Math.abs(this.vel.x) / 9, 0.6, 1.8);
    this.mixer.update(dt);

    if (this.grounded && Math.abs(this.vel.x) > 7) {
      this.dustTimer -= dt;
      if (this.dustTimer <= 0) {
        this.dustTimer = 0.075;
        this.particles.burst(
          { x: this.pos.x - this.facing * 0.5, y: this.pos.y + 0.15, z: 0.4 },
          { count: 2, color: 0xefe0c4, speed: 2.4, size: 0.3, life: 0.32, gravity: -3, up: 0.6, spread: 0.6 }
        );
      }
    }
  }

  #applyTransform(dt) {
    // Airborne stretch on top of the impulse spring — reads as momentum.
    const air = this.grounded ? 0 : THREE.MathUtils.clamp(this.vel.y / 34, -0.5, 0.5);
    const k = 1 - Math.exp(-13 * dt);
    this.squash.x += (1 - this.squash.x) * k;
    this.squash.y += (1 - this.squash.y) * k;
    const sx = this.squash.x * (1 - air * 0.16);
    const sy = this.squash.y * (1 + air * 0.2);
    this.visual.scale.set(sx, sy, sx);

    this.root.position.copy(this.pos);
    const want = this.facing * Math.PI * 0.5;
    this.visual.rotation.y += THREE.MathUtils.clamp(
      ((want - this.visual.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -18 * dt, 18 * dt
    );
    this.model.visible = this.invuln <= 0 || Math.floor(this.invuln * 22) % 2 === 0;
  }

  #updateDead(dt) {
    this.mixer.update(dt);
    this.pos.y += (this.vel.y -= GRAVITY * dt) * dt;
    this.root.position.copy(this.pos);
    this.deadTimer -= dt;
    if (this.deadTimer <= 0) this.respawn();
  }

  bounce(v) {
    this.vel.y = v;
    this.cutJump = false; // a launch is the level's, not the player's, to cut short
    this.grounded = false;
    this.ground = null;
    this.coyote = 0;
    this.squash.set(0.68, 1.42);
  }

  hurt(fromX) {
    if (this.invuln > 0 || this.dead) return false;
    this.health -= 1;
    this.invuln = INVULN;
    this.hurtTimer = 0.45;
    const away = Math.sign(this.pos.x - fromX) || -this.facing;
    this.vel.set(away * 11, 15, 0);
    this.grounded = false;
    this.coyote = 0;
    this.particles.burst(this.center, { count: 18, color: 0xff6b6b, speed: 9, size: 0.45, life: 0.5, gravity: -8 });
    sfx.hurt();
    if (this.health <= 0) this.kill();
    return true;
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.deadTimer = 1.35;
    this.vel.set(0, 9, 0);
    this.model.visible = true;
    this.visual.scale.set(1, 1, 1);
    this.#play('Death', 0.05);
    this.particles.burst(this.center, { count: 26, color: 0xffd0a0, speed: 11, size: 0.5, life: 0.7, gravity: -16 });
    sfx.death();
  }

  respawn() {
    this.dead = false;
    this.pos.copy(this.checkpoint);
    this.vel.set(0, 0, 0);
    this.invuln = INVULN;
    this.health = this.health <= 0 ? this.maxHealth : this.health;
    this.squash.set(1, 1);
    this.mixer.stopAllAction();
    this.current = null;
    this.#play('Idle', 0);
  }
}
