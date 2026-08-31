import * as THREE from 'three';

const MAX = 700;

function sparkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * One pooled Points cloud for every burst in the game. Dead particles are
 * parked at size 0 rather than removed, so no allocation happens mid-frame.
 */
export function createFX(scene) {
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const size = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

  const material = new THREE.PointsMaterial({
    map: sparkTexture(),
    vertexColors: true,
    size: 1,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  // PointsMaterial exposes only one global size. Patch the stock shader so
  // each particle can carry its own, via an `aSize` attribute. (`size` itself
  // is already taken by the uniform, hence the prefix.)
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute float aSize;\nvoid main() {')
      .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
  };

  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  scene.add(points);

  const parts = Array.from({ length: MAX }, () => ({ life: 0, ttl: 1, vx: 0, vy: 0, vz: 0, size: 0, drag: 2 }));
  let cursor = 0;
  const tint = new THREE.Color();

  function burst(x, y, z, color, count, opts = {}) {
    const { speed = 6, spread = 1, gravity = 14, ttl = 0.55, size: s = 1.2, drag = 2 } = opts;
    tint.set(color);
    for (let i = 0; i < count; i++) {
      const p = parts[cursor];
      const idx = cursor;
      cursor = (cursor + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const r = speed * (0.35 + Math.random() * 0.65);
      p.life = p.ttl = ttl * (0.7 + Math.random() * 0.6);
      p.vx = Math.cos(a) * r * spread;
      p.vy = Math.sin(a) * r + speed * 0.35;
      p.vz = (Math.random() - 0.5) * r * 0.6;
      p.size = s * (0.6 + Math.random() * 0.8);
      p.gravity = gravity;
      p.drag = drag;
      pos[idx * 3] = x;
      pos[idx * 3 + 1] = y;
      pos[idx * 3 + 2] = z;
      col[idx * 3] = tint.r;
      col[idx * 3 + 1] = tint.g;
      col[idx * 3 + 2] = tint.b;
      size[idx] = p.size;
    }
  }

  function update(dt) {
    for (let i = 0; i < MAX; i++) {
      const p = parts[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { size[i] = 0; continue; }
      const damp = Math.max(0, 1 - p.drag * dt);
      p.vx *= damp;
      p.vz *= damp;
      p.vy = p.vy * damp - p.gravity * dt;
      pos[i * 3] += p.vx * dt;
      pos[i * 3 + 1] += p.vy * dt;
      pos[i * 3 + 2] += p.vz * dt;
      size[i] = p.size * Math.min(1, (p.life / p.ttl) * 2.2);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
  }

  return { burst, update };
}
