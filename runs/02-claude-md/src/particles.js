import * as THREE from 'three';

const MAX = 900;

/** One additive Points cloud recycled for every burst in the game. */
export function makeParticles(scene) {
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3);
  const size = new Float32Array(MAX);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('psize', new THREE.BufferAttribute(size, 1));
  geo.setDrawRange(0, MAX);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(64, 4, 0), 400);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { scale: { value: 1 } },
    vertexShader: `
      attribute float psize;
      varying vec3 vColor;
      uniform float scale;
      void main() {
        vColor = color;
        // Dead particles must leave the clip volume: additive blending turns a
        // pile of zero-size splats at the origin into a searchlight.
        if (psize <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = psize * scale / max(-mv.z, 0.001);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.05, length(d));
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a);
      }`,
    vertexColors: true,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  let cursor = 0;
  let bursts = 0;
  const c = new THREE.Color();

  function burst(x, y, z, count, color, opts = {}) {
    const { speed = 4, spread = 1, up = 1.5, life: l = 0.6, size: sz = 0.2 } = opts;
    bursts++;
    c.set(color);
    for (let i = 0; i < count; i++) {
      const k = cursor;
      cursor = (cursor + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * speed;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      vel[k * 3] = Math.cos(a) * r * spread;
      vel[k * 3 + 1] = Math.sin(a) * r * 0.6 + up;
      vel[k * 3 + 2] = (Math.random() - 0.5) * r * spread;
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      size[k] = sz * (0.6 + Math.random() * 0.8);
      life[k] = maxLife[k] = l * (0.7 + Math.random() * 0.6);
    }
  }

  function update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) { size[i] = 0; continue; }
      life[i] -= dt;
      const f = Math.max(life[i], 0) / maxLife[i];
      vel[i * 3 + 1] -= 9 * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      size[i] *= 1 - dt * 1.2;
      if (size[i] < 0.01 || f <= 0) size[i] = 0;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.psize.needsUpdate = true;
  }

  return { burst, update, setScale: (s) => { mat.uniforms.scale.value = s; }, stats: () => ({ bursts, live: life.filter((v) => v > 0).length }) };
}
