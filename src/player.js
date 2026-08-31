import * as THREE from 'three';
import { loadGLTF } from './models.js';
import { prepare, damp, clamp, MODEL_SCALE } from './util.js';

const HALF_W = 0.34;
const HEIGHT = 1.7;
const GRAVITY = 34;
const RUN = 8.0;
const ACCEL = 60;
const AIR_ACCEL = 28;
const FRICTION = 26;
const JUMP_V = 13.0;
const COYOTE = 0.10;
const BUFFER = 0.12;
// Islands drift +/-0.1, so a static ledge (the bridge) is often a hair above the
// surface you're standing on. Without a step-up that seam is an invisible wall.
const STEP_UP = 0.4;

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyZ: 'jump',
};

export class Player {
  static async create(scene) {
    const gltf = await loadGLTF('Character');
    return new Player(scene, gltf);
  }

  constructor(scene, gltf) {
    // The visual sits in a pivot so squash-stretch never touches the collider.
    this.pivot = new THREE.Group();
    this.model = prepare(gltf.scene, { scale: MODEL_SCALE });
    this.pivot.add(this.model);
    scene.add(this.pivot);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = Object.fromEntries(gltf.animations.map((c) => [c.name, this.mixer.clipAction(c)]));
    for (const need of ['Idle', 'Run', 'Jump', 'Jump_Idle', 'Death']) {
      if (!this.clips[need]) throw new Error(`Character is missing the "${need}" clip; got ${Object.keys(this.clips).join(', ')}`);
    }
    this.current = null;
    this.play('Idle');

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.grounded = false;
    this.facing = 1;
    this.yaw = Math.PI / 2;
    this.squash = new THREE.Vector2(1, 1);
    this.coyote = 0;
    this.buffered = 0;
    this.hearts = 3;
    this.invuln = 0;
    this.dead = false;
    this.won = false;

    this.input = { left: false, right: false, jump: false };
    this.jumpHeld = false;
    addEventListener('keydown', (e) => {
      const k = KEYS[e.code];
      if (!k) return;
      e.preventDefault();
      if (k === 'jump' && !this.input.jump) this.buffered = BUFFER;
      this.input[k] = true;
    });
    addEventListener('keyup', (e) => {
      const k = KEYS[e.code];
      if (k) this.input[k] = false;
    });
  }

  play(name, fade = 0.15) {
    if (this.current === name) return;
    const next = this.clips[name];
    if (this.current) this.clips[this.current].fadeOut(fade);
    next.reset().fadeIn(fade).play();
    this.current = name;
  }

  respawn(pos) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.invuln = 1.4;
  }

  hurt(fromX, particles) {
    if (this.invuln > 0 || this.dead) return false;
    this.hearts--;
    this.invuln = 1.3;
    // Gentle enough that a hit on a narrow island isn't an automatic pit death.
    this.vel.set((Math.sign(this.pos.x - fromX) || 1) * 4.5, 7, 0);
    particles.burst(this.center(), 0xff5a5a, { count: 18, speed: 5, ttl: 0.5 });
    if (this.hearts <= 0) this.dead = true;
    return true;
  }

  center() {
    return new THREE.Vector3(this.pos.x, this.pos.y + HEIGHT * 0.5, 0);
  }

  bounce(power) {
    this.vel.y = power;
    this.squash.set(0.72, 1.42);
    this.grounded = false;
  }

  update(dt, solids, particles) {
    const wantJump = this.input.jump;
    if (!wantJump) this.jumpHeld = false;
    this.buffered -= dt;
    this.invuln -= dt;

    const dir = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    const control = this.won || this.dead ? 0 : dir;

    const accel = this.grounded ? ACCEL : AIR_ACCEL;
    if (control !== 0) {
      this.vel.x += control * accel * dt;
      this.vel.x = clamp(this.vel.x, -RUN, RUN);
      this.facing = control;
    } else if (this.grounded) {
      const drop = FRICTION * dt;
      this.vel.x = Math.abs(this.vel.x) <= drop ? 0 : this.vel.x - Math.sign(this.vel.x) * drop;
    }

    if (this.grounded) this.coyote = COYOTE;
    else this.coyote -= dt;

    if (this.buffered > 0 && this.coyote > 0 && !this.dead && !this.won) {
      this.vel.y = JUMP_V;
      this.buffered = 0;
      this.coyote = 0;
      this.grounded = false;
      this.jumpHeld = true;
      this.squash.set(0.74, 1.34);
      this.play('Jump', 0.05);
      particles.burst(this.pos, 0xffffff, { count: 8, speed: 2.2, ttl: 0.35, size: 0.7, gravity: 4 });
    }
    // Variable jump height: releasing early cuts the rise.
    if (this.jumpHeld && !wantJump && this.vel.y > 0) {
      this.vel.y *= 0.42;
      this.jumpHeld = false;
    }

    this.vel.y -= GRAVITY * dt;
    this.vel.y = Math.max(this.vel.y, -34);

    const wasGrounded = this.grounded;
    this.grounded = false;

    // Y before X. A drifting island that rises into a standing player must
    // resolve as "stand on top", and only a still-overlapping box after that
    // snap is a real wall.
    this.pos.y += this.vel.y * dt;
    const landVel = this.vel.y;
    this.resolveY(solids);

    this.pos.x += this.vel.x * dt;
    this.resolveX(solids);

    if (this.grounded && !wasGrounded) {
      const impact = clamp(-landVel / 20, 0, 1);
      this.squash.set(1 + impact * 0.45, 1 - impact * 0.35);
      if (impact > 0.25) {
        particles.burst(this.pos, 0xd8e6ff, { count: 6 + (impact * 10) | 0, speed: 2.6, ttl: 0.35, size: 0.8, gravity: 6, spread: 1.6 });
      }
    }

    this.animate(dt);
  }

  resolveX(solids) {
    const half = HALF_W;
    for (const s of solids) {
      if (s.enabled === false) continue;
      if (this.pos.x + half <= s.minX || this.pos.x - half >= s.maxX) continue;
      if (this.pos.y + HEIGHT <= s.minY || this.pos.y >= s.maxY - 1e-3) continue;
      if (this.grounded && s.maxY - this.pos.y <= STEP_UP) {
        this.pos.y = s.maxY;
        continue;
      }
      // Push out the near side rather than trusting vel.x, which is zero when a
      // moving surface is the thing that created the overlap.
      const outLeft = this.pos.x + half - s.minX;
      const outRight = s.maxX - (this.pos.x - half);
      this.pos.x = outLeft < outRight ? s.minX - half : s.maxX + half;
      this.vel.x = 0;
    }
  }

  resolveY(solids) {
    const half = HALF_W;
    for (const s of solids) {
      if (s.enabled === false) continue;
      if (this.pos.x + half <= s.minX || this.pos.x - half >= s.maxX) continue;
      if (this.pos.y + HEIGHT <= s.minY || this.pos.y >= s.maxY) continue;
      if (this.vel.y <= 0) {
        this.pos.y = s.maxY;
        // Snapping to maxY every frame is also what rides a drifting island.
        this.grounded = true;
        this.vel.y = 0;
      } else {
        this.pos.y = s.minY - HEIGHT;
        this.vel.y = 0;
      }
    }
  }

  animate(dt) {
    this.mixer.update(dt);
    if (this.dead) this.play('Death', 0.2);
    else if (!this.grounded) this.play(this.vel.y > 1 ? 'Jump' : 'Jump_Idle', 0.12);
    else if (Math.abs(this.vel.x) > 0.6) this.play('Run', 0.12);
    else this.play('Idle', 0.2);

    if (this.current === 'Run') this.clips.Run.timeScale = clamp(Math.abs(this.vel.x) / RUN, 0.6, 1.4) * 1.3;

    this.yaw += (this.facing > 0 ? Math.PI / 2 - this.yaw : -Math.PI / 2 - this.yaw) * damp(dt, 16);
    this.pivot.position.copy(this.pos);
    this.pivot.rotation.y = this.yaw;

    // Airborne stretch on top of the impulse squash, so falls look like falls.
    const air = this.grounded ? 0 : clamp(this.vel.y / 26, -0.35, 0.35);
    this.squash.x += (1 - this.squash.x) * damp(dt, 11);
    this.squash.y += (1 - this.squash.y) * damp(dt, 11);
    this.pivot.scale.set(this.squash.x - air * 0.45, this.squash.y + air * 0.5, this.squash.x - air * 0.45);

    const flicker = this.invuln > 0 && Math.sin(this.invuln * 40) > 0;
    this.model.visible = !flicker;
  }
}

export { HALF_W, HEIGHT };
