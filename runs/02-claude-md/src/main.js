import * as THREE from 'three';
import { installFatalHandler, guardFrame } from './fatal.js';
import { loadModels, MODEL_NAMES } from './models.js';

installFatalHandler();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e14);
scene.fog = new THREE.Fog(0x0b0e14, 14, 42);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
camera.position.set(0, 3.2, 11);
camera.lookAt(0, 1.2, 0);

scene.add(new THREE.HemisphereLight(0x99bbff, 0x202028, 1.8));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(5, 10, 7);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0x1b2130, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
scene.add(new THREE.GridHelper(80, 80, 0x2b3a55, 0x1e2738));

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const showcase = ['Character', 'Bee', 'Coin', 'Cube_Question', 'Tree'];
const loaded = await loadModels(showcase);
const spinner = new THREE.Group();
showcase.forEach((name, i) => {
  const model = loaded[name];
  model.position.x = (i - (showcase.length - 1) / 2) * 3;
  spinner.add(model);
});
scene.add(spinner);

document.getElementById('hud').textContent =
  `three r${THREE.REVISION} · ${MODEL_NAMES.length} models ready\n` +
  `Replace src/main.js with your game. See CLAUDE.md.`;

const clock = new THREE.Clock();
renderer.setAnimationLoop(guardFrame(() => {
  const t = clock.getElapsedTime();
  spinner.children.forEach((m, i) => {
    m.rotation.y = t * 0.8 + i;
    m.position.y = Math.sin(t * 2 + i * 0.7) * 0.15;
  });
  renderer.render(scene, camera);
}));
