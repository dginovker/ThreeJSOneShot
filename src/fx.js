import * as THREE from 'three';

const MAX = 400;
const _UP = new THREE.Vector3(0, 1, 0).normalize();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/**
 * One instanced pool for every burst in the game. Dead particles are parked at
 * zero scale rather than removed, so the draw call count never changes.
 */
export class Particles {
  constructor(scene) {
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.11), mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.p = Array.from({ length: MAX }, () => ({ life: 0, ttl: 1, vel: new THREE.Vector3(), pos: new THREE.Vector3(), size: 1, gravity: 0 }));
    this.next = 0;
    for (let i = 0; i < MAX; i++) {
      this.mesh.setColorAt(i, new THREE.Color(0xffffff));
      _m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, _m);
    }
  }

  burst(pos, color, { count = 14, speed = 4, ttl = 0.6, size = 1, gravity = 9, spread = 1 } = {}) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const p = this.p[this.next];
      const idx = this.next;
      this.next = (this.next + 1) % MAX;
      p.pos.copy(pos);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - 2 * Math.random());
      p.vel.set(Math.sin(phi) * Math.cos(theta) * spread, Math.cos(phi), Math.sin(phi) * Math.sin(theta) * spread * 0.5)
        .multiplyScalar(speed * (0.5 + Math.random() * 0.8));
      p.life = p.ttl = ttl * (0.7 + Math.random() * 0.6);
      p.size = size * (0.6 + Math.random() * 0.7);
      p.gravity = gravity;
      this.mesh.setColorAt(idx, c);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      const p = this.p[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      const k = Math.max(p.life / p.ttl, 0);
      _s.setScalar(p.size * k * k * (0.4 + k));
      _q.setFromAxisAngle(_UP, p.life * 9);
      this.mesh.setMatrixAt(i, _m.compose(p.pos, _q, _s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}


