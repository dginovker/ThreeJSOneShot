import * as THREE from 'three';
import { clone as skinnedClone } from 'three/addons/utils/SkeletonUtils.js';
import { damp, prepare, boxOf, topAt, cloneMaterials } from './util.js';
import * as L from './level.js';

export const TINT = {
  coin: 0xffc247,
  gem: 0x9fe8ff,
  dust: 0xd8c9a8,
  spark: 0xfff3c4,
  hurt: 0xff5a3c,
};

const box = (x, y, hw, hh) => ({ x0: x - hw, x1: x + hw, y0: y - hh, y1: y + hh });

/** Plays one clip of a rigged prop and keeps its mixer alive. */
class Rig {
  constructor(scene, gltf, { skinned = false } = {}) {
    this.root = skinned ? skinnedClone(gltf.scene) : gltf.scene.clone();
    this.mixer = new THREE.AnimationMixer(this.root);
    this.clips = gltf.animations;
    scene.add(this.root);
  }
  play(name, { loop = true, fade = 0.2, speed = 1 } = {}) {
    const clip = this.clips.find((c) => c.name === name);
    if (!clip) {
      throw new Error(`Clip "${name}" not on this model. Have: ${this.clips.map((c) => c.name).join(', ')}`);
    }
    const next = this.mixer.clipAction(clip);
    next.enabled = true;
    next.setEffectiveTimeScale(speed);
    next.setEffectiveWeight(1);
    next.loop = loop ? THREE.LoopRepeat : THREE.LoopOnce;
    next.clampWhenFinished = !loop;
    if (this.current && this.current !== next) {
      next.reset().crossFadeFrom(this.current, fade, false).play();
    } else {
      next.reset().play();
    }
    this.current = next;
    return next;
  }
  update(dt) { this.mixer.update(dt); }
}

class Coin {
  constructor(scene, proto, spec, i) {
    this.mesh = proto.clone();
    this.mesh.position.set(spec.x, spec.y, 0);
    this.phase = i * 0.7;
    this.taken = false;
    scene.add(this.mesh);
  }
  get aabb() { return box(this.mesh.position.x, this.mesh.position.y, 0.95, 0.95); }
  update(dt, t) {
    if (this.taken) return;
    this.mesh.rotation.y = t * 3.4 + this.phase;
    this.mesh.position.y += Math.sin(t * 2.2 + this.phase) * 0.006;
  }
  take(fx) {
    this.taken = true;
    this.mesh.visible = false;
    fx.burst(this.mesh.position, TINT.coin, 16, { speed: 6, size: 0.42, life: 0.55, gravity: -10, up: 2 });
    fx.burst(this.mesh.position, TINT.spark, 8, { speed: 2.4, size: 0.9, life: 0.35, gravity: 0 });
  }
}

class Gem {
  constructor(scene, proto, spec, i) {
    this.mesh = cloneMaterials(proto.clone(), (m) => {
      m.emissive = new THREE.Color(TINT.gem);
      m.emissiveIntensity = 0.6;
    });
    this.mesh.position.set(spec.x, spec.y, 0);
    this.mesh.scale.setScalar(1.35);
    this.base = this.mesh.scale.x;
    this.phase = i * 1.9;
    this.taken = false;
    this.mats = [];
    this.mesh.traverse((o) => { if (o.isMesh) this.mats.push(o.material); });
    scene.add(this.mesh);
  }
  get aabb() { return box(this.mesh.position.x, this.mesh.position.y, 1.0, 1.2); }
  update(dt, t) {
    if (this.taken) return;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.6 + this.phase);
    this.mesh.rotation.y = t * 1.3 + this.phase;
    this.mesh.scale.setScalar(this.base * (1 + pulse * 0.09));
    for (const m of this.mats) m.emissiveIntensity = 0.45 + pulse * 1.15;
  }
  take(fx) {
    this.taken = true;
    this.mesh.visible = false;
    fx.burst(this.mesh.position, TINT.gem, 30, { speed: 9, size: 0.5, life: 0.8, gravity: -6, up: 3 });
  }
}

class Saw {
  constructor(scene, proto, spec) {
    this.mesh = proto.clone();
    this.a = new THREE.Vector2(...spec.a);
    this.b = new THREE.Vector2(...spec.b);
    this.period = spec.period;
    this.phase = spec.phase;
    scene.add(this.mesh);
  }
  get aabb() { return box(this.mesh.position.x, this.mesh.position.y, 1.25, 1.25); }
  update(dt, t) {
    // Ease at the ends of the sweep so the timing window is readable.
    const k = 0.5 - 0.5 * Math.cos(((t / this.period) + this.phase) * Math.PI * 2);
    this.mesh.position.set(
      this.a.x + (this.b.x - this.a.x) * k,
      this.a.y + (this.b.y - this.a.y) * k,
      0
    );
    this.mesh.rotation.z -= dt * 11;
  }
}

class Bee {
  constructor(scene, gltf, spec) {
    this.rig = new Rig(scene, gltf, { skinned: true });
    this.rig.play('Flying', { speed: 1.4 });
    prepare(this.rig.root);
    this.spec = spec;
    this.dead = false;
    this.deathTimer = 0;
    this.root = this.rig.root;
    this.root.position.set(spec.x0, spec.y, 0);
  }
  get aabb() { return box(this.root.position.x, this.root.position.y + 0.9, 1.15, 0.95); }
  update(dt, t) {
    this.rig.update(dt);
    if (this.dead) {
      this.deathTimer += dt;
      this.root.position.y -= dt * 6 * this.deathTimer;
      this.root.rotation.z += dt * 2.5;
      if (this.deathTimer > 1.6) this.root.visible = false;
      return;
    }
    const s = this.spec;
    const k = 0.5 - 0.5 * Math.cos((t / s.period) * Math.PI * 2);
    const x = s.x0 + (s.x1 - s.x0) * k;
    const dir = Math.sin((t / s.period) * Math.PI * 2) >= 0 ? 1 : -1;
    this.root.position.set(x, s.y + Math.sin(t * 3.1) * 0.35, 0);
    this.root.rotation.y = damp(this.root.rotation.y, dir * Math.PI * 0.42, 8, dt);
  }
  kill(fx) {
    this.dead = true;
    this.rig.play('Death', { loop: false, fade: 0.05 });
    fx.burst(this.root.position.clone().setY(this.root.position.y + 0.9), TINT.spark, 22,
      { speed: 8, size: 0.45, life: 0.6, gravity: -18 });
  }
}

class Bouncer {
  constructor(scene, gltf, spec) {
    this.rig = new Rig(scene, gltf, { skinned: true });
    this.rig.play('Bouncer_Idle');
    prepare(this.rig.root);
    this.rig.root.position.set(spec.x, spec.y, 0);
    this.top = spec.y + 1.85;
    this.recover = 0;
  }
  get aabb() { return { x0: this.rig.root.position.x - 1.2, x1: this.rig.root.position.x + 1.2, y0: this.top - 2.4, y1: this.top + 0.6 }; }
  update(dt) {
    this.rig.update(dt);
    if (this.recover > 0 && (this.recover -= dt) <= 0) this.rig.play('Bouncer_Idle', { fade: 0.2 });
  }
  fire(fx) {
    const action = this.rig.play('Bouncer_Bounce', { loop: false, fade: 0.02, speed: 1.6 });
    this.recover = action.getClip().duration / 1.6;
    fx.burst(new THREE.Vector3(this.rig.root.position.x, this.top, 0), TINT.spark, 20,
      { speed: 7, spread: 1.6, size: 0.4, life: 0.4, gravity: -20 });
  }
}

class Lever {
  constructor(scene, gltf, spec) {
    this.rig = new Rig(scene, gltf, { skinned: true });
    this.rig.play('Lever_Off');
    prepare(this.rig.root);
    this.rig.root.position.set(spec.x, spec.y, 0);
    this.rig.root.rotation.y = -0.35;
    this.pulled = false;
  }
  get aabb() { return box(this.rig.root.position.x, this.rig.root.position.y + 1, 1.4, 1.4); }
  update(dt) { this.rig.update(dt); }
  pull(fx) {
    this.pulled = true;
    this.rig.play('Lever_On', { loop: false, fade: 0.05, speed: 1.4 });
    fx.burst(this.rig.root.position.clone().setY(this.rig.root.position.y + 1.4), TINT.spark, 18,
      { speed: 5, size: 0.35, life: 0.5, gravity: -12 });
  }
}

const DOOR_SCALE = 1.55;
const DROP = 16;
const INSET = 0.55;

/**
 * Bridge_Small is an arch, not a plank, so it gets a real height profile sampled
 * off the model instead of a flat collider — the player runs up and over it.
 * The lever raises the whole span out of the cloud layer below.
 */
class Bridge {
  constructor(scene, proto, spec) {
    const bb = boxOf(proto);
    const width = bb.max.x - bb.min.x;
    const scale = spec.span / width;

    const model = proto.clone();
    model.scale.setScalar(scale);
    this.group = new THREE.Group();
    this.group.add(model);
    this.group.position.set(spec.x0 + spec.span / 2, spec.deck - DROP, 0);
    prepare(this.group);
    scene.add(this.group);

    // Sampled at cell midpoints: the two mirrored halves of the deck meet in a
    // hairline seam at local x = 0 that a ray drops straight through, and an
    // even cell count never puts a sample there. INSET clears the rail posts,
    // which overhang the deck at both ends.
    const N = 24;
    this.heights = [];
    for (let i = 0; i < N; i++) {
      const lx = bb.min.x + INSET + ((width - INSET * 2) * (i + 0.5)) / N;
      this.heights.push(topAt(proto, lx, 0.3) * scale);
    }
    this.spec = spec;
    this.down = false;
    this.raised = 0;
  }

  heightAt(x) {
    const t = ((x - this.spec.x0) / this.spec.span) * this.heights.length - 0.5;
    const i = Math.max(0, Math.min(this.heights.length - 2, Math.floor(t)));
    const f = Math.max(0, Math.min(1, t - i));
    return this.spec.deck + this.heights[i] * (1 - f) + this.heights[i + 1] * f
      - DROP * (1 - this.raised);
  }

  /** Only stands the player up once the span has actually surfaced. */
  get field() {
    if (this.raised < 0.985) return null;
    return { x0: this.spec.x0, x1: this.spec.x0 + this.spec.span, heightAt: (x) => this.heightAt(x) };
  }

  update(dt) {
    this.raised = damp(this.raised, this.down ? 1 : 0, 2.6, dt);
    if (this.down && this.raised > 0.999) this.raised = 1;
    this.group.position.y = this.spec.deck - DROP * (1 - this.raised);
  }
}

class Key {
  constructor(scene, proto, spec) {
    this.mesh = cloneMaterials(proto.clone(), (m) => {
      m.emissive = new THREE.Color(0xffd76a);
      m.emissiveIntensity = 0.8;
    });
    this.mesh.scale.setScalar(1.5);
    this.mesh.position.set(spec.x, spec.y, 0);
    this.base = spec.y;
    this.taken = false;
    scene.add(this.mesh);
  }
  get aabb() { return box(this.mesh.position.x, this.mesh.position.y, 1.3, 1.0); }
  update(dt, t) {
    if (this.taken) return;
    this.mesh.rotation.y = t * 1.8;
    this.mesh.rotation.z = Math.sin(t * 1.4) * 0.25;
    this.mesh.position.y = this.base + Math.sin(t * 1.7) * 0.35;
  }
  take(fx) {
    this.taken = true;
    this.mesh.visible = false;
    fx.burst(this.mesh.position, 0xffd76a, 34, { speed: 9, size: 0.5, life: 0.9, gravity: -5, up: 3 });
  }
}

/**
 * Scaled up until it is taller than the player's jump: at its natural size the
 * door can be landed on and walked over, which skips the key entirely.
 */
class Door {
  constructor(scene, proto, spec) {
    this.root = proto.clone();
    this.root.scale.setScalar(DOOR_SCALE);
    this.root.position.set(spec.x, spec.y, 0);
    this.panel = this.root.getObjectByName('Door');
    if (!this.panel) {
      throw new Error(`Door.gltf has no child named "Door"; got ${this.root.children.map((c) => c.name).join(', ')}`);
    }
    this.height = boxOf(proto).max.y * DOOR_SCALE;
    // Re-parent the panel onto a hinge at its own left edge so it swings like a
    // door instead of levitating out of its frame.
    const edge = (boxOf(this.panel).min.x - spec.x) / DOOR_SCALE;
    this.hinge = new THREE.Group();
    this.hinge.position.x = edge;
    this.panel.position.x -= edge;
    this.root.add(this.hinge);
    this.hinge.add(this.panel);
    prepare(this.root);
    scene.add(this.root);
    this.open = false;
    this.spec = spec;
  }
  get collider() {
    if (this.open) return null;
    return { x0: this.spec.x - 1.6, x1: this.spec.x + 1.6, y0: this.spec.y, y1: this.spec.y + this.height };
  }
  update(dt) {
    this.hinge.rotation.y = damp(this.hinge.rotation.y, this.open ? 1.95 : 0, 3.6, dt);
  }
  unlock(fx) {
    this.open = true;
    fx.burst(new THREE.Vector3(this.spec.x, this.spec.y + 2, 0), 0xffd76a, 30,
      { speed: 8, spread: 2, size: 0.45, life: 0.7, gravity: -8 });
  }
}

class Flag {
  constructor(scene, proto, spec) {
    this.root = proto.clone();
    this.root.scale.setScalar(1.6);
    this.root.position.set(spec.x, spec.y, 0);
    prepare(this.root);
    scene.add(this.root);
    this.spec = spec;
  }
  get aabb() { return box(this.spec.x, this.spec.y + 2, 1.6, 2.2); }
  update(dt, t) {
    this.root.rotation.y = Math.sin(t * 1.1) * 0.12;
  }
}

export function buildEntities(scene, assets, gltfs, fx) {
  const coinProto = cloneMaterials(assets.Coin, (m) => {
    m.emissive = new THREE.Color(TINT.coin);
    m.emissiveIntensity = 0.45;
    m.metalness = 0.55;
    m.roughness = 0.3;
  });
  prepare(coinProto, { receive: false });
  prepare(assets.Hazard_Saw);

  const world = {
    coins: L.COINS.map((s, i) => new Coin(scene, coinProto, s, i)),
    gems: L.GEMS.map((s, i) => new Gem(scene, assets[s.kind], s, i)),
    saws: L.SAWS.map((s) => new Saw(scene, assets.Hazard_Saw, s)),
    bees: L.BEES.map((s) => new Bee(scene, gltfs.Bee, s)),
    bouncers: L.BOUNCERS.map((s) => new Bouncer(scene, gltfs.Bouncer, s)),
    lever: new Lever(scene, gltfs.Lever, L.LEVER),
    bridge: new Bridge(scene, assets.Bridge_Small, L.BRIDGE),
    key: new Key(scene, assets.Key, L.KEY),
    door: new Door(scene, assets.Door, L.DOOR),
    flag: new Flag(scene, assets.Goal_Flag, L.FLAG),
  };

  world.update = (dt, t) => {
    for (const list of [world.coins, world.gems, world.saws, world.bees, world.bouncers]) {
      for (const e of list) e.update(dt, t);
    }
    world.lever.update(dt, t);
    world.bridge.update(dt, t);
    world.key.update(dt, t);
    world.door.update(dt, t);
    world.flag.update(dt, t);
  };

  return world;
}
