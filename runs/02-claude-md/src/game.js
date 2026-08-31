import * as THREE from 'three';
import { loadModels, loadGltfs, instance } from './models.js';
import { setShadow } from './scenery.js';
import { createPlayer, HALF_W, HEIGHT } from './player.js';
import * as L from './level.js';

const TILE = 2;               // every platform cube in the pack is 2 units wide
const BOUNCE_V = 31;
const STOMP_V = 19;
const MAX_HP = 3;
// Bridge_Modular_Center's walkable planks sit this far above the model origin.
const BRIDGE_DECK = 0.9;
const BRIDGE_Z = -1.1;

/** Tint a prototype's materials before it is cloned, so every copy glows. */
function glow(model, color, intensity, opts = {}) {
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.emissive = new THREE.Color(color);
    o.material.emissiveIntensity = intensity;
    if (opts.metalness !== undefined) o.material.metalness = opts.metalness;
    if (opts.roughness !== undefined) o.material.roughness = opts.roughness;
  });
  return model;
}

function child(root, name) {
  const found = root.getObjectByName(name);
  if (!found) throw new Error(`Expected a "${name}" node in the loaded model`);
  return found;
}

/** Squared distance from (x, y) to the player's collision box. */
function distToPlayer(p, x, y) {
  const cx = THREE.MathUtils.clamp(x, p.x - HALF_W, p.x + HALF_W);
  const cy = THREE.MathUtils.clamp(y, p.y, p.y + HEIGHT);
  return (x - cx) ** 2 + (y - cy) ** 2;
}

export async function createGame(scene, fx, ui) {
  const M = await loadModels([
    'Cube_Grass_1x1Center', 'Cube_Grass_1x1End', 'Cube_Dirt_1x1Center',
    'RockPlatforms_Medium', 'RockPlatforms_Large', 'RockPlatform_Tall',
    'Bouncer', 'Hazard_Saw', 'Door', 'Goal_Flag', 'Bridge_Modular_Center',
    'Coin', 'Key', 'Gem_Blue', 'Gem_Green', 'Gem_Pink',
    'Tree', 'Bush', 'Grass_1', 'Grass_2', 'Rock_1', 'Plant_Small',
  ]);
  const G = await loadGltfs(['Character', 'Bee', 'Lever']);

  glow(M.Coin, 0xffb62e, 0.75, { metalness: 0.35, roughness: 0.35 });
  glow(M.Key, 0xffd070, 0.6, { metalness: 0.5, roughness: 0.3 });
  glow(M.Gem_Blue, 0x2f7bff, 0.9, { roughness: 0.15 });
  glow(M.Gem_Green, 0x2fd07a, 0.9, { roughness: 0.15 });
  glow(M.Gem_Pink, 0xff54a8, 0.9, { roughness: 0.15 });
  glow(M.Goal_Flag, 0xff3b2f, 0.25);

  const solids = [];
  const props = new THREE.Group();
  scene.add(props);

  // ---------------------------------------------------------------- terrain
  for (const plat of L.PLATFORMS) {
    const tiles = Math.round(plat.w / TILE);
    if (Math.abs(tiles * TILE - plat.w) > 1e-6) {
      throw new Error(`Platform at x=${plat.x} is ${plat.w} wide, not a multiple of ${TILE}`);
    }
    solids.push({ x0: plat.x, x1: plat.x + plat.w, y0: plat.top - TILE, y1: plat.top });

    for (let i = 0; i < tiles; i++) {
      const end = i === 0 || i === tiles - 1;
      const cube = instance(end ? M.Cube_Grass_1x1End : M.Cube_Grass_1x1Center);
      cube.position.set(plat.x + i * TILE + TILE / 2, plat.top - TILE / 2, 0);
      if (i === tiles - 1) cube.rotation.y = Math.PI;
      setShadow(cube, true, true);
      props.add(cube);
    }

    // Rock mass hung underneath, flipped so it tapers downward: that silhouette
    // is what makes a flat platform read as a floating island.
    const chunks = Math.max(1, Math.round(plat.w / 9));
    for (let i = 0; i < chunks; i++) {
      const src = i % 2 ? M.RockPlatforms_Medium : M.RockPlatform_Tall;
      const rock = instance(src);
      rock.rotation.set(Math.PI, Math.random() * Math.PI, 0);
      rock.position.set(
        plat.x + (i + 0.5) * (plat.w / chunks),
        plat.top - TILE + 0.4,
        -0.2
      );
      rock.scale.set(1.05, 0.8 + Math.random() * 0.5, 1.05);
      setShadow(rock, true, false);
      props.add(rock);
    }

    // Dressing on the surface. Kept clear of the first two tiles of each
    // platform so nothing ever hides a landing spot.
    for (let x = plat.x + 1.2; x < plat.x + plat.w - 1.2; x += 1.6 + Math.random() * 2.4) {
      const r = Math.random();
      const src = r < 0.5 ? M.Grass_1 : r < 0.72 ? M.Grass_2 : r < 0.86 ? M.Plant_Small : M.Rock_1;
      const bit = instance(src);
      bit.position.set(x, plat.top - (src === M.Rock_1 ? 0.1 : 0.95), -0.75 + Math.random() * 1.5);
      bit.scale.setScalar(0.7 + Math.random() * 0.6);
      bit.rotation.y = Math.random() * Math.PI * 2;
      setShadow(bit, true, false);
      props.add(bit);
    }
    if (plat.w >= 12) {
      const tree = instance(Math.random() < 0.5 ? M.Tree : M.Bush);
      tree.position.set(plat.x + plat.w - 1.4, plat.top - 0.1, -1.6);
      tree.scale.setScalar(0.42 + Math.random() * 0.12);
      setShadow(tree, true, false);
      props.add(tree);
    }
  }


  // ----------------------------------------------------------------- bridge
  const bridge = [];
  for (let i = 0; i < L.BRIDGE.segments; i++) {
    const seg = instance(M.Bridge_Modular_Center);
    const x = L.BRIDGE.x + (i + 0.5) * L.BRIDGE.span;
    // Dropped so the planks line up with the collider, and set back so the
    // near railing does not cut across the player.
    seg.position.set(x, L.BRIDGE.top - BRIDGE_DECK, BRIDGE_Z);
    seg.visible = false;
    setShadow(seg, true, true);
    props.add(seg);
    const solid = {
      x0: x - L.BRIDGE.span / 2,
      x1: x + L.BRIDGE.span / 2,
      y0: L.BRIDGE.top - 1,
      y1: L.BRIDGE.top,
      active: false,
    };
    solids.push(solid);
    // Negative t is the stagger: the segment waits its turn before easing in.
    bridge.push({ obj: seg, solid, x, t: -i * 0.12 });
  }

  // ------------------------------------------------------------------ lever
  const lever = instance(G.Lever.scene);
  // Set back from the play plane so the player runs past it rather than over it.
  lever.position.set(L.LEVER.x, L.LEVER.y, -1);
  lever.scale.setScalar(1.7);
  setShadow(lever, true, false);
  props.add(lever);
  const leverMixer = new THREE.AnimationMixer(lever);
  const leverClip = G.Lever.animations.find((a) => a.name === 'Lever_On');
  if (!leverClip) throw new Error('Lever.gltf is missing the "Lever_On" animation');
  const leverAction = leverMixer.clipAction(leverClip);
  leverAction.setLoop(THREE.LoopOnce, 1);
  leverAction.clampWhenFinished = true;

  // ------------------------------------------------------------------- door
  const doorGroup = instance(M.Door);
  doorGroup.position.set(L.DOOR.x, L.DOOR.y, 0);
  setShadow(doorGroup, true, true);
  props.add(doorGroup);
  const doorLeaf = child(doorGroup, 'Door');
  // Re-parent the leaf onto a hinge at its left edge so it swings instead of
  // spinning about its middle.
  const hinge = new THREE.Group();
  hinge.position.set(-1.7, 0, 0);
  doorLeaf.position.x += 1.7;
  doorGroup.add(hinge);
  hinge.add(doorLeaf);
  const doorSolid = { x0: L.DOOR.x - 1.5, x1: L.DOOR.x + 1.5, y0: L.DOOR.y, y1: L.DOOR.y + 4.3 };
  solids.push(doorSolid);

  // ------------------------------------------------------------------- goal
  const flag = instance(M.Goal_Flag);
  flag.position.set(L.GOAL.x, L.GOAL.y, 0);
  flag.scale.setScalar(1.6);
  setShadow(flag, true, false);
  props.add(flag);

  // --------------------------------------------------------------- bouncers
  const bouncers = L.BOUNCERS.map((b) => {
    const obj = instance(M.Bouncer);
    obj.position.set(b.x, b.y, 0);
    setShadow(obj, true, false);
    props.add(obj);
    return { ...b, obj, squash: 1, vel: 0 };
  });

  // ------------------------------------------------------------------- saws
  const saws = L.SAWS.map((s) => {
    const obj = instance(M.Hazard_Saw);
    obj.scale.setScalar(1.2);
    setShadow(obj, true, false);
    props.add(obj);
    return { ...s, obj };
  });

  // ------------------------------------------------------------------- bees
  const bees = L.BEES.map((b) => {
    const obj = instance(G.Bee.scene);
    obj.scale.setScalar(0.62);
    setShadow(obj, true, false);
    props.add(obj);
    const mixer = new THREE.AnimationMixer(obj);
    const fly = G.Bee.animations.find((a) => a.name === 'Flying');
    const die = G.Bee.animations.find((a) => a.name === 'Death');
    if (!fly || !die) throw new Error('Bee.gltf is missing the "Flying"/"Death" animations');
    mixer.clipAction(fly).play();
    const dieAction = mixer.clipAction(die);
    dieAction.setLoop(THREE.LoopOnce, 1);
    dieAction.clampWhenFinished = true;
    return { ...b, obj, mixer, dieAction, alive: true, deadFor: 0, prevX: b.x0 };
  });

  // -------------------------------------------------------------- collectibles
  const coins = L.COINS.map((c, i) => {
    const obj = instance(M.Coin);
    obj.scale.setScalar(0.62);
    obj.position.set(c.x, c.y, 0);
    props.add(obj);
    return { ...c, obj, taken: false, phase: i * 0.6 };
  });

  const gems = L.GEMS.map((g, i) => {
    const obj = instance(M[g.model]);
    obj.scale.setScalar(0.9);
    obj.position.set(g.x, g.y, 0);
    props.add(obj);
    const light = new THREE.PointLight(
      { Gem_Blue: 0x4d9bff, Gem_Green: 0x4ff0a0, Gem_Pink: 0xff6cc0 }[g.model], 6, 9, 2
    );
    obj.add(light);
    return { ...g, obj, light, taken: false, phase: i * 1.3 };
  });

  const key = instance(M.Key);
  key.position.set(L.KEY.x, L.KEY.y, 0);
  key.scale.setScalar(0.85);
  props.add(key);
  const keyLight = new THREE.PointLight(0xffd070, 5, 8, 2);
  key.add(keyLight);

  // ----------------------------------------------------------------- player
  const player = createPlayer(scene, G.Character, {
    onJump: (p) => fx.burst(p.x, p.y + 0.1, 0.2, 0xffffff, 8, { speed: 3, gravity: 6, ttl: 0.35, size: 0.7 }),
    onLand: (p, impact) => {
      if (impact < 6) return;
      fx.burst(p.x, p.y + 0.1, 0.2, 0xf0e2c8, Math.min(18, 4 + impact | 0), {
        speed: 3.5, gravity: 8, ttl: 0.4, size: 0.9, spread: 1.6,
      });
    },
  });

  const state = {
    hp: MAX_HP,
    coins: 0,
    total: coins.length + gems.length * 5,
    hasKey: false,
    bridgeUp: false,
    doorOpen: false,
    won: false,
    snap: true,
    checkpoint: L.CHECKPOINTS[0],
    deathTimer: 0,
    shake: 0,
  };
  player.teleport(L.START.x, L.START.y);
  ui.setHearts(state.hp, MAX_HP);
  ui.setCoins(state.coins, state.total);

  const input = { left: false, right: false, jump: false, jumpWasDown: false };
  const KEYS = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump',
  };
  addEventListener('keydown', (e) => {
    const k = KEYS[e.code];
    if (!k) return;
    input[k] = true;
    e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    const k = KEYS[e.code];
    if (k) input[k] = false;
  });

  function damage(fromX) {
    if (player.invuln > 0 || player.dead || state.won) return;
    state.hp--;
    state.shake = 0.5;
    ui.setHearts(state.hp, MAX_HP);
    fx.burst(player.x, player.cy, 0.3, 0xff5566, 20, { speed: 7, gravity: 10, ttl: 0.5, size: 1.1 });
    if (state.hp <= 0) {
      player.dead = true;
      player.vx = 0;
      state.deathTimer = 1.3;
      ui.message('Ouch! Back to the last checkpoint…', 1400);
    } else {
      player.hurt(fromX);
    }
  }

  function toCheckpoint() {
    player.teleport(state.checkpoint.x, state.checkpoint.y);
    // Without this the camera would spend a second sailing back from wherever
    // the player fell to.
    focus.set(player.x, player.y + 1.6, 0);
    state.snap = true;
    fx.burst(player.x, player.cy, 0.3, 0x9fe8ff, 24, { speed: 6, gravity: 2, ttl: 0.6, size: 1.1 });
  }

  function respawn() {
    state.hp = MAX_HP;
    ui.setHearts(state.hp, MAX_HP);
    toCheckpoint();
  }

  const focus = new THREE.Vector3(L.START.x, L.START.y + 2, 0);
  let time = 0;

  /** Dev-only handle for probing the level from the console. */
  if (import.meta.env.DEV) {
    globalThis.game = { state, player, focus, goto: (x, y) => { player.teleport(x, y); focus.set(x, y + 1.6, 0); state.snap = true; } };
  }

  function update(dt) {
    time += dt;

    // --- checkpoints -------------------------------------------------------
    for (const cp of L.CHECKPOINTS) {
      if (player.x > cp.x && cp.x > state.checkpoint.x) state.checkpoint = cp;
    }

    // --- death / falling ---------------------------------------------------
    if (state.deathTimer > 0) {
      state.deathTimer -= dt;
      if (state.deathTimer <= 0) respawn();
    } else if (player.y < L.KILL_Y) {
      state.hp--;
      ui.setHearts(Math.max(0, state.hp), MAX_HP);
      if (state.hp <= 0) respawn();
      else {
        ui.setHearts(state.hp, MAX_HP);
        toCheckpoint();
        ui.message('The sky is a long way down.', 1200);
      }
      state.shake = 0.4;
    }

    player.update(dt, input, solids);
    input.jumpWasDown = input.jump;

    // --- bouncers ----------------------------------------------------------
    for (const b of bouncers) {
      const hitting =
        Math.abs(player.x - b.x) < 1.5 && player.vy <= 0 &&
        player.y < b.y + 1.9 && player.y > b.y - 0.6;
      if (hitting) {
        player.bounce(BOUNCE_V);
        b.squash = 0.5;
        b.vel = 0;
        fx.burst(b.x, b.y + 1.4, 0.2, 0xa9f3ff, 22, { speed: 8, gravity: 12, ttl: 0.5, size: 1 });
      }
      b.vel += (1 - b.squash) * 340 * dt - b.vel * 13 * dt;
      b.squash += b.vel * dt;
      b.obj.scale.set(1 / Math.sqrt(b.squash), b.squash, 1 / Math.sqrt(b.squash));
    }

    // --- saws --------------------------------------------------------------
    for (const s of saws) {
      const t = 0.5 - 0.5 * Math.cos((time / s.period) * Math.PI * 2 + s.phase);
      const x = s.a[0] + (s.b[0] - s.a[0]) * t;
      const y = s.a[1] + (s.b[1] - s.a[1]) * t;
      s.obj.position.set(x, y, 0);
      s.obj.rotation.z -= dt * 11;
      if (distToPlayer(player, x, y) < 1.6 ** 2) damage(x);
    }

    // --- bees --------------------------------------------------------------
    for (const b of bees) {
      if (!b.alive) {
        b.deadFor += dt;
        b.obj.position.y -= dt * 6;
        b.obj.rotation.z += dt * 3;
        if (b.deadFor > 1.4) b.obj.visible = false;
        b.mixer.update(dt);
        continue;
      }
      const t = 0.5 - 0.5 * Math.cos((time / b.period) * Math.PI * 2);
      const x = b.x0 + (b.x1 - b.x0) * t;
      const y = b.y + Math.sin(time * 2.4 + b.x0) * 0.5;
      b.obj.rotation.y = (x >= b.prevX ? 1 : -1) * Math.PI * 0.5;
      b.prevX = x;
      b.obj.position.set(x, y, 0);
      b.mixer.update(dt);

      if (distToPlayer(player, x, y + 0.55) < 1.25 ** 2) {
        const stomping = player.vy < -1 && player.y > y + 0.5;
        if (stomping) {
          b.alive = false;
          b.deadFor = 0;
          b.dieAction.reset().play();
          player.bounce(STOMP_V);
          state.shake = 0.25;
          fx.burst(x, y + 0.6, 0, 0xffe08a, 26, { speed: 8, gravity: 16, ttl: 0.5, size: 1 });
        } else {
          damage(x);
        }
      }
    }

    // --- coins & gems ------------------------------------------------------
    for (const c of coins) {
      if (c.taken) continue;
      c.obj.rotation.y = time * 3 + c.phase;
      c.obj.position.y = c.y + Math.sin(time * 2.5 + c.phase) * 0.14;
      if (distToPlayer(player, c.x, c.obj.position.y) < 1.4 ** 2) {
        c.taken = true;
        c.obj.visible = false;
        state.coins++;
        ui.setCoins(state.coins, state.total);
        ui.pop();
        fx.burst(c.x, c.obj.position.y, 0.2, 0xffd45e, 16, {
          speed: 6, gravity: 9, ttl: 0.5, size: 1.05,
        });
      }
    }

    for (const g of gems) {
      if (g.taken) continue;
      const pulse = 1 + Math.sin(time * 3.4 + g.phase) * 0.12;
      g.obj.scale.setScalar(0.9 * pulse);
      g.obj.rotation.y = time * 1.4 + g.phase;
      g.obj.position.y = g.y + Math.sin(time * 1.8 + g.phase) * 0.25;
      g.light.intensity = 5 + Math.sin(time * 3.4 + g.phase) * 3;
      if (distToPlayer(player, g.x, g.obj.position.y) < 1.6 ** 2) {
        g.taken = true;
        g.obj.visible = false;
        state.coins += 5;
        ui.setCoins(state.coins, state.total);
        ui.pop();
        ui.message('Sky gem! +5', 1100);
        fx.burst(g.x, g.obj.position.y, 0.2, g.light.color.getHex(), 40, {
          speed: 9, gravity: 6, ttl: 0.8, size: 1.3,
        });
      }
    }

    // --- key ---------------------------------------------------------------
    if (!state.hasKey) {
      key.rotation.y = time * 2;
      key.position.y = L.KEY.y + Math.sin(time * 2.2) * 0.2;
      keyLight.intensity = 4 + Math.sin(time * 4) * 2;
      if (distToPlayer(player, L.KEY.x, key.position.y) < 1.6 ** 2) {
        state.hasKey = true;
        key.visible = false;
        ui.setKey(true);
        ui.message('Got the key — the door ahead will open.', 2200);
        fx.burst(L.KEY.x, key.position.y, 0.2, 0xffd070, 34, { speed: 8, gravity: 6, ttl: 0.8, size: 1.2 });
      }
    }

    // --- lever & bridge ----------------------------------------------------
    if (!state.bridgeUp && Math.abs(player.x - L.LEVER.x) < 1.6 && Math.abs(player.y - L.LEVER.y) < 2.5) {
      state.bridgeUp = true;
      leverAction.reset().play();
      ui.message('The bridge unfolds across the chasm.', 2400);
      fx.burst(L.LEVER.x, L.LEVER.y + 1, 0.2, 0x9fe8ff, 20, { speed: 6, gravity: 6, ttl: 0.6 });
    }
    leverMixer.update(dt);

    for (const seg of bridge) {
      if (!state.bridgeUp) continue;
      seg.t += dt;
      if (seg.t < 0) continue;
      seg.obj.visible = true;
      const k = Math.min(1, seg.t / 0.4);
      const ease = 1 - (1 - k) ** 3;
      seg.obj.position.y = L.BRIDGE.top - BRIDGE_DECK + (1 - ease) * 7;
      seg.obj.position.z = BRIDGE_Z;
      seg.obj.scale.setScalar(0.6 + 0.4 * ease);
      if (k >= 1 && !seg.solid.active) {
        seg.solid.active = true;
        fx.burst(seg.x, L.BRIDGE.top, 0.2, 0xd8c39a, 12, { speed: 4, gravity: 10, ttl: 0.4 });
      }
    }

    // --- door --------------------------------------------------------------
    if (!state.doorOpen && Math.abs(player.x - L.DOOR.x) < 4) {
      if (state.hasKey) {
        state.doorOpen = true;
        doorSolid.active = false;
        ui.setKey(false);
        ui.message('Unlocked!', 1400);
        fx.burst(L.DOOR.x, L.DOOR.y + 2, 0.4, 0xffe6a8, 30, { speed: 7, gravity: 5, ttl: 0.7, size: 1.2 });
      } else if (Math.abs(player.x - L.DOOR.x) < 2.6) {
        ui.message('Locked. There is a key on the high ledge behind you.', 900);
      }
    }
    // Swings away from the camera, so the open leaf never covers the player.
    if (state.doorOpen) hinge.rotation.y = THREE.MathUtils.damp(hinge.rotation.y, 2.1, 4, dt);

    // --- goal --------------------------------------------------------------
    flag.rotation.y = Math.sin(time * 1.2) * 0.12;
    if (!state.won && distToPlayer(player, L.GOAL.x, L.GOAL.y + 1.6) < 2 ** 2) {
      state.won = true;
      player.play('Wave', 0.2);
      ui.win(state.coins, state.total);
      for (let i = 0; i < 6; i++) {
        setTimeout(() => fx.burst(
          L.GOAL.x + (Math.random() - 0.5) * 6, L.GOAL.y + 3 + Math.random() * 3, 0.2,
          [0xffd45e, 0xff6cc0, 0x4ff0a0, 0x9fe8ff][i % 4], 40,
          { speed: 11, gravity: 10, ttl: 1.1, size: 1.3 }
        ), i * 180);
      }
    }
    if (state.won) {
      player.vx = 0;
      if (player.onGround) player.play('Wave', 0.2);
    }

    // --- camera target -----------------------------------------------------
    state.shake = Math.max(0, state.shake - dt * 2);
    focus.x = THREE.MathUtils.damp(focus.x, player.x + player.vx * 0.16, 6, dt);
    focus.y = THREE.MathUtils.damp(focus.y, player.y + 1.6, 3.4, dt);
    focus.z = 0;

    return state;
  }

  return { update, focus, state, player };
}
