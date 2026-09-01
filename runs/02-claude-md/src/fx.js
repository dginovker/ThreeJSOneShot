import * as THREE from 'three';

const MAX = 900;

/**
 * One additive Points cloud recycled for every burst in the game. Particles are
 * the main thing the bloom pass has to chew on, so they are deliberately bright.
 */
export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.psize = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.span = new Float32Array(MAX);
    this.base = new Float32Array(MAX);
    this.tint = new Float32Array(MAX * 3);
    this.grav = new Float32Array(MAX);
    this.head = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.psize, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 pcolor;
        attribute float psize;
        varying vec3 vColor;
        void main() {
          vColor = pcolor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * 340.0 / max(0.001, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = 1.0 - smoothstep(0.12, 0.5, d);
          if (a <= 0.002) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
  }

  /** Spawns `count` particles at `origin`; opts tune the shape of the burst. */
  burst(origin, color, count, opts = {}) {
    const { speed = 7, spread = 1, size = 0.5, life = 0.7, gravity = -14, up = 0 } = opts;
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.head = (this.head + 1) % MAX;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - 2 * Math.random());
      const v = speed * (0.45 + Math.random() * 0.55);
      this.pos[i * 3] = origin.x + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 1] = origin.y + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * spread * 0.6;
      this.vel[i * 3] = Math.sin(phi) * Math.cos(theta) * v;
      this.vel[i * 3 + 1] = Math.cos(phi) * v + up;
      this.vel[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * v * 0.5;
      this.span[i] = this.life[i] = life * (0.7 + Math.random() * 0.6);
      this.base[i] = size * (0.6 + Math.random() * 0.8);
      this.grav[i] = gravity;
      this.tint[i * 3] = c.r; this.tint[i * 3 + 1] = c.g; this.tint[i * 3 + 2] = c.b;
    }
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.psize[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.span[i]);
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      const drag = Math.exp(-2.2 * dt);
      for (let a = 0; a < 3; a++) {
        this.vel[i * 3 + a] *= drag;
        this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      }
      // Additive blending means fading the colour to black *is* fading out.
      const f = k * k;
      this.col[i * 3] = this.tint[i * 3] * f;
      this.col[i * 3 + 1] = this.tint[i * 3 + 1] * f;
      this.col[i * 3 + 2] = this.tint[i * 3 + 2] * f;
      this.psize[i] = this.base[i] * (0.35 + k * 0.65);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.pcolor.needsUpdate = true;
    g.attributes.psize.needsUpdate = true;
  }
}
