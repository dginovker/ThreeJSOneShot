import * as THREE from 'three';
import { installFatalHandler, guardFrame } from './fatal.js';

installFatalHandler();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e14);
scene.fog = new THREE.Fog(0x0b0e14, 12, 40);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
camera.position.set(0, 3, 8);
camera.lookAt(0, 0.75, 0);

scene.add(new THREE.HemisphereLight(0x99bbff, 0x202028, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(5, 10, 7);
scene.add(sun);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1.5, 1.5, 1.5),
  new THREE.MeshStandardMaterial({ color: 0x4f8cff, roughness: 0.35, metalness: 0.1 })
);
cube.position.y = 0.75;
scene.add(cube);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x1b2130, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
scene.add(new THREE.GridHelper(60, 60, 0x2b3a55, 0x1e2738));

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const hud = document.getElementById('hud');
const clock = new THREE.Clock();
let fps = 60;

renderer.setAnimationLoop(guardFrame(() => {
  const dt = clock.getDelta();
  cube.rotation.x += dt * 0.6;
  cube.rotation.y += dt * 0.9;
  fps += ((dt > 0 ? 1 / dt : fps) - fps) * 0.1;
  hud.textContent = `three r${THREE.REVISION} · ${fps.toFixed(0)} fps\nReplace src/main.js with your game.`;
  renderer.render(scene, camera);
}));
