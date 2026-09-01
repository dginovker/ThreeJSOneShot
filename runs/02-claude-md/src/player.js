import * as THREE from 'three';
import { clone as skinnedClone } from 'three/addons/utils/SkeletonUtils.js';
import { clamp, damp, overlaps, prepare } from './util.js';
import { PHYS } from './level.js';
import { TINT } from './entities.js';

/** How far the character turns toward the camera; 0 would be a flat side view. */
const FACE_TURN = Math.PI * 0.40;

export class Player {
  constructor(scene, gltf, fx) {
    this.root = skinnedClone(gltf.scene);
    prepare(this.root, { receive: false });
    this.pivot = new THREE.Group();
    this.pivot.add(this.root);
    scene.add(this.pivot);

    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      a.enabled = true;
      this.actions[clip.name] = a;
    }
    this.state = '';
    this.fx = fx;

    this.vx = 0;
    this.vy = 0;
    this.dir = 1;
    this.grounded = false;
    this.coyote = 0;
    this.buffer = 0;
    this.squash = 0;
    this.squashVel = 0;
    this.invuln = 0;
    this.runDust = 0;
    this.cutting = false;
    this.reset(0, 0);
  }

  reset(x, y) {
    this.pivot.position.set(x, y, 0);
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.squash = 0;
    this.squashVel = 0;
  }

  get x() { return this.pivot.position.x; }
  get y() { return this.pivot.position.y; }

  aabb(x = this.pivot.position.x, y = this.pivot.position.y) {
    return { x0: x - PHYS.halfWidth, x1: x + PHYS.halfWidth, y0: y, y1: y + PHYS.height };
  }

  /** Head-height point used for pickups, so coins at chest level read as collected. */
  get center() {
    return new THREE.Vector3(this.pivot.position.x, this.pivot.position.y + PHYS.height * 0.55, 0);
  }

  hurt(fromX) {
    if (this.invuln > 0) return false;
    this.invuln = 1.3;
    this.vy = 14;
    this.vx = Math.sign(this.pivot.position.x - fromX || 1) * 9;
    this.squash = -0.2;
    this.fx.burst(this.center, TINT.hurt, 24, { speed: 8, size: 0.45, life: 0.5, gravity: -12 });
    return true;
  }

  bounce(v) {
    this.vy = v;
    this.grounded = false;
    this.coyote = 0;
    // A launch the player didn't ask for isn't theirs to cut short.
    this.cutting = false;
    this.squash = 0.45;
    this.squashVel = 0;
  }

  update(dt, input, solids, fields) {
    const p = this.pivot.position;

    if (this.invuln > 0) this.invuln -= dt;

    const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const accel = this.grounded ? PHYS.accel : PHYS.airAccel;
    if (move !== 0) {
      this.vx += move * accel * dt;
      this.vx = clamp(this.vx, -PHYS.runSpeed, PHYS.runSpeed);
      this.dir = move;
    } else if (this.grounded) {
      this.vx = damp(this.vx, 0, PHYS.friction, dt);
    }

    this.buffer = input.jumpPressed ? PHYS.jumpBuffer : Math.max(0, this.buffer - dt);
    if (this.buffer > 0 && this.coyote > 0) {
      this.vy = PHYS.jumpVelocity;
      this.buffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.cutting = true;
      this.squash = 0.3;
      this.squashVel = 0;
      this.fx.burst(new THREE.Vector3(p.x, p.y + 0.1, 0), TINT.dust, 10,
        { speed: 3.5, spread: 1.2, size: 0.4, life: 0.35, gravity: -6 });
    }

    // Releasing jump early cuts the arc short — the single biggest lever on
    // feel. It applies only to a jump the player started: a bouncer or a stomp
    // launch keeps its full arc whether or not the key happens to be down.
    if (this.vy <= 0) this.cutting = false;
    const g = PHYS.gravity * (this.cutting && !input.jump ? PHYS.cutGravity : 1);
    this.vy = Math.max(this.vy - g * dt, -46);

    const wasGrounded = this.grounded;
    const impact = this.vy;
    this.grounded = false;
    this.sweep('x', this.vx * dt, solids);
    this.sweep('y', this.vy * dt, solids);
    this.standOn(fields);

    if (this.grounded) {
      this.coyote = PHYS.coyote;
      if (!wasGrounded) this.land(impact);
    } else {
      this.coyote = Math.max(0, this.coyote - dt);
    }

    this.animate(dt, move);
    this.applySquash(dt);
  }

  sweep(axis, delta, solids) {
    const p = this.pivot.position;
    p[axis] += delta;
    let self = this.aabb();
    for (const s of solids) {
      if (!overlaps(self, s)) continue;
      if (axis === 'x') {
        p.x += delta > 0 ? s.x0 - self.x1 : s.x1 - self.x0;
        this.vx = 0;
      } else {
        p.y += delta > 0 ? s.y0 - self.y1 : s.y1 - self.y0;
        if (delta < 0) this.grounded = true;
        this.vy = 0;
      }
      self = this.aabb();
    }
  }

  /**
   * Sloped surfaces (the arched bridge) are height profiles rather than boxes:
   * a box stack would stop the player dead on every 20cm step.
   */
  standOn(fields) {
    const p = this.pivot.position;
    for (const f of fields) {
      if (p.x < f.x0 || p.x > f.x1 || this.vy > 0.001) continue;
      const surface = f.heightAt(p.x);
      // The extra reach while already grounded is what keeps the player glued
      // to the deck as it falls away underneath them on the far side.
      const reach = this.grounded ? 0.9 : 0.1;
      if (p.y > surface + reach || p.y < surface - 3) continue;
      p.y = surface;
      this.vy = 0;
      this.grounded = true;
    }
  }

  land(impact) {
    const force = clamp(-impact / 34, 0, 1);
    this.squash = -0.18 - force * 0.32;
    this.squashVel = 0;
    if (force > 0.25) {
      this.fx.burst(new THREE.Vector3(this.pivot.position.x, this.pivot.position.y + 0.15, 0),
        TINT.dust, 8 + Math.round(force * 14),
        { speed: 3 + force * 6, spread: 1.4, size: 0.42, life: 0.4, gravity: -9 });
    }
  }

  /** A light spring: overshoot on the way back is what sells the rubberiness. */
  applySquash(dt) {
    this.squashVel += (-130 * this.squash - 15 * this.squashVel) * dt;
    this.squash += this.squashVel * dt;
    const s = clamp(this.squash, -0.4, 0.5);
    this.root.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
    this.pivot.rotation.y = damp(this.pivot.rotation.y, this.dir * FACE_TURN, 14, dt);
    // Lean into the run, then straighten on landing.
    this.pivot.rotation.z = damp(this.pivot.rotation.z, -this.vx * 0.012, 8, dt);
    this.root.visible = this.invuln <= 0 || Math.floor(this.invuln * 18) % 2 === 0;
  }

  animate(dt, move) {
    let next = 'Idle';
    let speed = 1;
    if (!this.grounded) {
      next = this.vy > 1.5 ? 'Jump' : 'Jump_Idle';
    } else if (Math.abs(this.vx) > 0.6) {
      next = 'Run';
      speed = clamp(Math.abs(this.vx) / PHYS.runSpeed, 0.45, 1.4) * 1.25;
      this.runDust -= dt;
      if (this.runDust <= 0) {
        this.runDust = 0.12;
        this.fx.burst(new THREE.Vector3(this.pivot.position.x - this.dir * 0.5, this.pivot.position.y + 0.1, 0),
          TINT.dust, 2, { speed: 1.6, spread: 0.5, size: 0.3, life: 0.3, gravity: -5 });
      }
    }
    this.play(next, speed);
    this.mixer.update(dt);
  }

  play(name, speed) {
    const action = this.actions[name];
    if (!action) {
      throw new Error(`Character has no clip "${name}". Have: ${Object.keys(this.actions).join(', ')}`);
    }
    action.setEffectiveTimeScale(speed);
    if (this.state === name) return;
    const prev = this.actions[this.state];
    action.reset().setEffectiveWeight(1).play();
    if (prev) action.crossFadeFrom(prev, name === 'Jump' ? 0.06 : 0.16, false);
    this.state = name;
  }
}
