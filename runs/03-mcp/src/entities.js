import * as THREE from 'three';
import { spawn, clip, ownMaterials, eachMaterial } from './assets.js';
import { sfx } from './sfx.js';

function glow(obj, color, intensity) {
  ownMaterials(obj);
  eachMaterial(obj, (m) => {
    m.emissive = new THREE.Color(color);
    m.emissiveIntensity = intensity;
  });
  return obj;
}

const near = (a, x, y, r) => (a.x - x) ** 2 + (a.y + 1.7 - y) ** 2 < r * r;

class Coin {
  constructor(scene, x, y) {
    this.obj = glow(spawn('Coin', { receive: false }), 0xffb03a, 0.9);
    this.obj.scale.setScalar(0.78);
    this.obj.position.set(x, y, 0);
    scene.add(this.obj);
    this.alive = true;
    this.phase = x * 0.63;
    this.y0 = y;
  }

  update(dt, t, ctx) {
    if (!this.alive) return;
    this.obj.rotation.y = t * 3 + this.phase;
    this.obj.position.y = this.y0 + Math.sin(t * 2.4 + this.phase) * 0.16;
    if (!near(ctx.player.pos, this.obj.position.x, this.obj.position.y, 1.7)) return;
    this.alive = false;
    this.obj.visible = false;
    ctx.state.coins += 1;
    ctx.state.streak = Math.min(ctx.state.streak + 1, 4);
    ctx.state.streakTimer = 0.7;
    ctx.particles.burst(this.obj.position, {
      count: 14, color: 0xffd76a, speed: 8, size: 0.4, life: 0.45, gravity: -12, spread: 1.2,
    });
    sfx.coin(ctx.state.streak);
  }
}

class Gem {
  constructor(scene, spec) {
    this.spec = spec;
    this.obj = glow(spawn(spec.model, { receive: false }), 0xffffff, 0.7);
    this.obj.position.set(spec.x, spec.y, 0);
    this.color = new THREE.Color();
    eachMaterial(this.obj, (m) => this.color.copy(m.color));
    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 16, 12),
      new THREE.MeshBasicMaterial({
        color: this.color, transparent: true, opacity: 0.1,
        depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    this.obj.add(this.halo);
    scene.add(this.obj);
    this.alive = true;
  }

  update(dt, t, ctx) {
    if (!this.alive) return;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.6 + this.spec.x);
    this.obj.rotation.y = t * 1.1;
    this.obj.position.y = this.spec.y + Math.sin(t * 1.6 + this.spec.x) * 0.22;
    this.obj.scale.setScalar(1 + pulse * 0.11);
    this.halo.scale.setScalar(1.15 + pulse * 0.3);
    this.halo.material.opacity = 0.06 + pulse * 0.09;
    eachMaterial(this.obj, (m) => { if (m.emissive) m.emissiveIntensity = 0.45 + pulse * 0.7; });
    if (!near(ctx.player.pos, this.obj.position.x, this.obj.position.y, 2)) return;
    this.alive = false;
    this.obj.visible = false;
    ctx.state.gems += 1;
    ctx.state.coins += this.spec.value;
    ctx.particles.burst(this.obj.position, {
      count: 34, color: this.color.getHex(), speed: 13, size: 0.6, life: 0.8, gravity: -9, spread: 1.4,
    });
    ctx.shake(0.35);
    sfx.gem();
  }
}

class Bouncer {
  constructor(scene, spec) {
    this.obj = spawn('Bouncer');
    this.obj.position.set(spec.x, spec.y, 0);
    scene.add(this.obj);
    this.mixer = new THREE.AnimationMixer(this.obj);
    this.idle = this.mixer.clipAction(clip('Bouncer', 'Bouncer_Idle'));
    this.bounce = this.mixer.clipAction(clip('Bouncer', 'Bouncer_Bounce'));
    this.bounce.loop = THREE.LoopOnce;
    this.idle.play();
    this.cooldown = 0;
    this.spec = spec;
  }

  update(dt, t, ctx) {
    this.mixer.update(dt);
    this.cooldown -= dt;
    const p = ctx.player;
    const onTop = p.vel.y <= 0 && p.pos.y > this.spec.y - 0.4 && p.pos.y < this.spec.y + 2.8;
    if (this.cooldown > 0 || !onTop || Math.abs(p.pos.x - this.spec.x) > 1.9) return;
    this.cooldown = 0.35;
    p.bounce(40);
    this.bounce.reset().play();
    ctx.particles.burst({ x: this.spec.x, y: this.spec.y + 1.6, z: 0 }, {
      count: 20, color: 0xff8f6b, speed: 10, size: 0.45, life: 0.5, gravity: -14, spread: 1.5, up: 0.9,
    });
    ctx.shake(0.3);
    sfx.bounce();
  }
}

class Saw {
  constructor(scene, spec) {
    this.spec = spec;
    this.obj = glow(spawn('Hazard_Saw', { receive: false }), 0x557088, 0.35);
    this.obj.scale.setScalar(spec.scale);
    scene.add(this.obj);
    this.radius = 1.45 * spec.scale;

    // A visible rail: a saw you can't predict is a cheap hit, not a hazard.
    const len = spec.range * 2 + 0.8;
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(spec.axis === 'x' ? len : 0.16, spec.axis === 'x' ? 0.16 : len, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x8ea0b2, roughness: 0.85 })
    );
    rail.position.set(spec.x, spec.y, -0.7);
    scene.add(rail);
  }

  update(dt, t, ctx) {
    const s = Math.sin(t * this.spec.speed + this.spec.phase) * this.spec.range;
    const x = this.spec.x + (this.spec.axis === 'x' ? s : 0);
    const y = this.spec.y + (this.spec.axis === 'y' ? s : 0);
    this.obj.position.set(x, y, 0);
    this.obj.rotation.z = -t * 9;
    const p = ctx.player;
    const cx = THREE.MathUtils.clamp(x, p.pos.x - 0.8, p.pos.x + 0.8);
    const cy = THREE.MathUtils.clamp(y, p.pos.y, p.pos.y + 3.35);
    if ((cx - x) ** 2 + (cy - y) ** 2 > this.radius ** 2) return;
    if (p.hurt(x)) {
      ctx.shake(0.7);
      ctx.hitStop(0.1);
    }
  }
}

class Bee {
  constructor(scene, spec) {
    this.spec = spec;
    this.obj = spawn('Bee', { receive: false });
    this.obj.position.set(spec.x, spec.y, 0);
    scene.add(this.obj);
    this.mixer = new THREE.AnimationMixer(this.obj);
    this.fly = this.mixer.clipAction(clip('Bee', 'Flying'));
    this.death = this.mixer.clipAction(clip('Bee', 'Death'));
    this.death.loop = THREE.LoopOnce;
    this.death.clampWhenFinished = true;
    this.fly.play();
    this.dir = 1;
    this.alive = true;
    this.fallTimer = 0;
  }

  update(dt, t, ctx) {
    this.mixer.update(dt);
    if (!this.alive) {
      this.fallTimer += dt;
      this.obj.position.y -= this.fallTimer * 12 * dt;
      this.obj.rotation.z += dt * 4;
      if (this.fallTimer > 1.4) this.obj.visible = false;
      return;
    }
    this.obj.position.x += this.dir * 4.2 * dt;
    if (this.obj.position.x > this.spec.to) this.dir = -1;
    if (this.obj.position.x < this.spec.from) this.dir = 1;
    this.obj.position.y = this.spec.y + Math.sin(t * 2.8 + this.spec.x) * 0.5;
    this.obj.rotation.y = this.dir * Math.PI * 0.5;

    const p = ctx.player;
    if (Math.abs(p.pos.x - this.obj.position.x) > 1.6) return;
    if (p.pos.y + 3.35 < this.obj.position.y || p.pos.y > this.obj.position.y + 1.9) return;

    // Coming down onto it is a stomp; anything else is a sting.
    if (p.vel.y < -1 && p.pos.y > this.obj.position.y + 0.6) {
      this.alive = false;
      this.fly.stop();
      this.death.reset().play();
      p.bounce(22);
      ctx.state.coins += 2;
      ctx.particles.burst({ x: this.obj.position.x, y: this.obj.position.y + 1, z: 0 }, {
        count: 22, color: 0xffe08a, speed: 10, size: 0.45, life: 0.5, gravity: -12,
      });
      ctx.shake(0.4);
      ctx.hitStop(0.075);
      sfx.stomp();
    } else if (p.hurt(this.obj.position.x)) {
      ctx.shake(0.7);
      ctx.hitStop(0.1);
    }
  }
}

class Bridge {
  constructor(scene, spec) {
    this.spec = spec;
    this.group = new THREE.Group();
    this.segments = [];
    const step = (spec.x1 - spec.x0) / spec.segments;
    for (let i = 0; i < spec.segments; i++) {
      const seg = spawn('Bridge_Modular_Center');
      seg.scale.set(step / 3, 1, 1.15);
      seg.position.set(spec.x0 + step * (i + 0.5), spec.y - 0.93 - 16, 0);
      this.group.add(seg);
      this.segments.push({ obj: seg, target: spec.y - 0.93, t: -i * 0.11 });
    }
    scene.add(this.group);
    this.on = false;
    this.solid = { x0: spec.x0, x1: spec.x1, top: spec.y, bottom: spec.y - 2.2, dy: 0 };
  }

  activate(ctx) {
    if (this.on) return;
    this.on = true;
    sfx.bridge();
    ctx.shake(0.5);
  }

  update(dt, t, ctx) {
    if (!this.on) return;
    for (const s of this.segments) {
      if (s.t >= 1) continue;
      s.t = Math.min(s.t + dt * 1.5, 1);
      const k = Math.max(s.t, 0);
      // Overshoot then settle, so the bridge lands with a thump instead of a slide.
      const ease = 1 - Math.pow(1 - k, 3);
      const wobble = Math.sin(k * Math.PI * 2.2) * (1 - k) * 0.7;
      s.obj.position.y = s.target - 16 * (1 - ease) + wobble;
      if (s.t === 1) {
        ctx.particles.burst({ x: s.obj.position.x, y: this.spec.y, z: 0 }, {
          count: 10, color: 0xd9c39a, speed: 6, size: 0.4, life: 0.45, gravity: -14, spread: 1.4,
        });
      }
    }
  }

  get walkable() {
    return this.on && this.segments.every((s) => s.t > 0.72);
  }
}

class Lever {
  constructor(scene, spec, bridge) {
    this.spec = spec;
    this.bridge = bridge;
    this.obj = spawn('Lever');
    this.obj.position.set(spec.x, spec.y, 0);
    this.obj.scale.setScalar(1.6);
    scene.add(this.obj);
    this.mixer = new THREE.AnimationMixer(this.obj);
    this.off = this.mixer.clipAction(clip('Lever', 'Lever_Off'));
    this.on = this.mixer.clipAction(clip('Lever', 'Lever_On'));
    this.on.loop = this.off.loop = THREE.LoopOnce;
    this.on.clampWhenFinished = this.off.clampWhenFinished = true;
    this.off.play();
    this.pulled = false;
    this.beacon = new THREE.PointLight(0xffd27a, 0, 9);
    this.beacon.position.set(spec.x, spec.y + 1.6, 1);
    scene.add(this.beacon);
  }

  update(dt, t, ctx) {
    this.mixer.update(dt);
    const inRange = Math.abs(ctx.player.pos.x - this.spec.x) < 3 &&
      Math.abs(ctx.player.pos.y - this.spec.y) < 3.5;
    this.beacon.intensity = this.pulled ? 0 : (inRange ? 14 : 5) * (0.7 + 0.3 * Math.sin(t * 5));
    if (this.pulled) return;
    if (inRange) ctx.prompt('Press  E  to pull the lever');
    if (!inRange || !ctx.input.usePressed) return;
    this.pulled = true;
    this.off.stop();
    this.on.reset().play();
    this.bridge.activate(ctx);
    ctx.particles.burst({ x: this.spec.x, y: this.spec.y + 1.4, z: 0.4 }, {
      count: 16, color: 0xffd27a, speed: 7, size: 0.4, life: 0.5, gravity: -8,
    });
    sfx.lever();
  }
}

class Key {
  constructor(scene, spec) {
    this.spec = spec;
    this.obj = glow(spawn('Key', { receive: false }), 0xffcc55, 0.9);
    this.obj.position.set(spec.x, spec.y, 0);
    this.obj.scale.setScalar(1.1);
    scene.add(this.obj);
    this.light = new THREE.PointLight(0xffd27a, 7, 10);
    this.obj.add(this.light);
    this.alive = true;
  }

  update(dt, t, ctx) {
    if (!this.alive) return;
    this.obj.rotation.y = t * 1.8;
    this.obj.position.y = this.spec.y + Math.sin(t * 2) * 0.3;
    if (!near(ctx.player.pos, this.obj.position.x, this.obj.position.y, 2.1)) return;
    this.alive = false;
    this.obj.visible = false;
    ctx.state.hasKey = true;
    ctx.particles.burst(this.obj.position, {
      count: 30, color: 0xffd27a, speed: 11, size: 0.55, life: 0.75, gravity: -8,
    });
    ctx.banner('Key acquired', 1.6);
    ctx.shake(0.3);
    sfx.key();
  }
}

class Door {
  constructor(scene, spec) {
    this.spec = spec;
    this.obj = spawn('Door');

    // Re-hang the leaf on its own edge so it swings like a door instead of
    // spinning about the model origin. Measured, not hard-coded, so a different
    // door model still hinges in the right place.
    const leaf = this.obj.getObjectByName('Door');
    if (!leaf) throw new Error('Door.gltf no longer contains a node named "Door" to hinge.');
    this.obj.updateMatrixWorld(true);
    const leafBox = new THREE.Box3().setFromObject(leaf);
    this.pivot = new THREE.Group();
    this.pivot.position.set(leafBox.min.x + 0.15, 0, 0);
    leaf.position.x -= this.pivot.position.x;
    this.obj.add(this.pivot);
    this.pivot.add(leaf);

    this.obj.scale.setScalar(1.35);
    this.obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.obj);
    this.obj.position.set(spec.x, spec.y - box.min.y, 0);
    scene.add(this.obj);
    this.solid = { x0: spec.x - 1.9, x1: spec.x + 1.9, top: spec.y + 5.6, bottom: spec.y - 0.5, dy: 0 };
    this.open = 0;
    this.locked = true;
  }

  update(dt, t, ctx) {
    if (this.locked) {
      if (Math.abs(ctx.player.pos.x - this.spec.x) < 4.5 && !ctx.state.hasKey) {
        ctx.prompt('Locked — find the key');
      }
      if (!ctx.state.hasKey) return;
      this.locked = false;
      ctx.banner('The door swings open', 1.4);
      ctx.shake(0.45);
      ctx.particles.burst({ x: this.spec.x, y: this.spec.y + 2.4, z: 0.8 }, {
        count: 26, color: 0xd7b98a, speed: 9, size: 0.5, life: 0.7, gravity: -10, spread: 1.5,
      });
      sfx.door();
    }
    this.open = Math.min(this.open + dt * 1.1, 1);
    this.pivot.rotation.y = -(1 - Math.pow(1 - this.open, 3)) * 2.0;
  }

  get blocking() {
    return this.open < 0.35;
  }
}

class Goal {
  constructor(scene, spec, totalGems) {
    this.spec = spec;
    this.totalGems = totalGems;
    this.obj = spawn('Goal_Flag');
    this.obj.scale.setScalar(1.8);
    this.obj.position.set(spec.x, spec.y, 0);
    scene.add(this.obj);
    this.light = new THREE.PointLight(0xffe6a8, 9, 14);
    this.light.position.set(spec.x, spec.y + 3, 2);
    scene.add(this.light);
    this.sparkle = 0;
  }

  update(dt, t, ctx) {
    this.obj.rotation.z = Math.sin(t * 2.3) * 0.045;
    this.light.intensity = 8 + Math.sin(t * 3) * 3;
    this.sparkle -= dt;
    if (this.sparkle <= 0) {
      this.sparkle = 0.28;
      ctx.particles.burst({ x: this.spec.x + 0.6, y: this.spec.y + 2.4, z: 0 }, {
        count: 2, color: 0xffe9b0, speed: 1.6, size: 0.2, life: 1.1, gravity: 2.2, spread: 1.6, up: 0,
      });
    }
    if (ctx.state.won) {
      ctx.prompt(`${ctx.state.coins} coins  ·  ${ctx.state.gems}/${this.totalGems} gems  ·  press R to play again`);
      return;
    }
    if (Math.abs(ctx.player.pos.x - this.spec.x) > 1.8) return;
    if (Math.abs(ctx.player.pos.y - this.spec.y) > 3.5) return;
    ctx.state.won = true;
    ctx.banner('Level complete!', 6);
    ctx.shake(0.5);
    for (let i = 0; i < 5; i++) {
      ctx.particles.burst({ x: this.spec.x, y: this.spec.y + 2, z: 0 }, {
        count: 40, color: [0xffd166, 0x8ce0ff, 0xff8fb1, 0xa8f0a0, 0xffffff][i],
        speed: 18, size: 0.6, life: 1.8, gravity: -11, spread: 1.6, up: 0.6, drag: 1.1,
      });
    }
    sfx.win();
  }
}

export function createEntities(scene, level) {
  const bridge = new Bridge(scene, level.bridge);
  const door = new Door(scene, level.door);
  const saws = level.saws.map((s) => new Saw(scene, s));
  const bees = level.bees.map((b) => new Bee(scene, b));
  const all = [
    ...level.coins.map(([x, y]) => new Coin(scene, x, y)),
    ...level.gems.map((g) => new Gem(scene, g)),
    ...level.bouncers.map((b) => new Bouncer(scene, b)),
    ...saws, ...bees,
    bridge,
    new Lever(scene, level.lever, bridge),
    new Key(scene, level.key),
    door,
    new Goal(scene, level.goal, level.gems.length),
  ];

  // Respawning inside a saw's arc is a death sentence, so checkpoints are only
  // taken outside every hazard's full sweep — not merely where it happens to be.
  const zones = level.saws.map((s) => {
    const r = 1.45 * s.scale + 2.2;
    const rx = s.axis === 'x' ? s.range : 0;
    const ry = s.axis === 'y' ? s.range : 0;
    return { x0: s.x - rx - r, x1: s.x + rx + r, y0: s.y - ry - r, y1: s.y + ry + r };
  });

  return {
    update(dt, t, ctx) {
      for (const e of all) e.update(dt, t, ctx);
    },
    safeSpot(pos) {
      const y = pos.y + 1.7;
      return !zones.some((z) => pos.x > z.x0 && pos.x < z.x1 && y > z.y0 && y < z.y1);
    },
    dynamicSolids() {
      const out = [];
      if (bridge.walkable) out.push(bridge.solid);
      if (door.blocking) out.push(door.solid);
      return out;
    },
    saws, bees,
    totalGems: level.gems.length,
  };
}
