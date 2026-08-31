import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { installFatalHandler, guardFrame } from './fatal.js';
import { addLights, buildScenery, addForegroundGrass } from './scenery.js';
import { createFX } from './fx.js';
import { createUI } from './ui.js';
import { createGame } from './game.js';

installFatalHandler();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 420);
// Foreground dressing is parented to the camera, so the camera itself has to
// be part of the scene graph.
scene.add(camera);

// Fixed side-on framing, nudged off-axis so platforms show a little of their
// side face. The camera never rotates; it only trails the player.
const OFFSET = new THREE.Vector3(5.5, 4.2, 34);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.75, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const sun = addLights(scene);
const fx = createFX(scene);
const [scenery, ui] = await Promise.all([buildScenery(scene, sun), createUI()]);
const game = await createGame(scene, fx, ui);
const updateForeground = addForegroundGrass(camera, scenery.foreground);

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  ui.resize(w, h);
}
addEventListener('resize', resize);
resize();

camera.position.copy(game.focus).add(OFFSET);

document.getElementById('loading').classList.add('gone');

if (import.meta.env.DEV) globalThis.dbg = { camera, scene, renderer };

const timer = new THREE.Timer();
timer.connect(document);
const look = new THREE.Vector3();

renderer.setAnimationLoop(guardFrame(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 1 / 30);

  const state = game.update(dt);
  scenery.update(dt, camera.position.x);
  updateForeground(camera.position.x);
  fx.update(dt);

  // A second, softer follow on top of the one inside the game gives the camera
  // its lag: it settles behind fast movement instead of pinning to the player.
  const wantX = game.focus.x + OFFSET.x;
  const wantY = game.focus.y + OFFSET.y;
  if (state.snap) {
    camera.position.set(wantX, wantY, OFFSET.z);
    state.snap = false;
  }
  camera.position.x = THREE.MathUtils.damp(camera.position.x, wantX, 4.5, dt);
  camera.position.y = THREE.MathUtils.damp(camera.position.y, wantY, 3, dt);
  camera.position.z = OFFSET.z;
  if (state.shake > 0) {
    const k = state.shake ** 2 * 0.9;
    camera.position.x += (Math.random() - 0.5) * k;
    camera.position.y += (Math.random() - 0.5) * k;
  }
  look.set(camera.position.x - OFFSET.x, camera.position.y - OFFSET.y + 1.1, 0);
  camera.lookAt(look);

  composer.render();
  ui.update(dt);
  ui.render(renderer);
}));
