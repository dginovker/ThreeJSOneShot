import * as THREE from 'three';
import { spawn, ownMaterials, eachMaterial } from './assets.js';

// One source of truth for the layout: the 3D icons and the DOM numbers that sit
// beside them are placed from the same pixel coordinates.
const PAD = 30;
const HEART = { x: PAD + 22, y: PAD + 20, gap: 44, scale: 25 };
const ROW = { y: PAD + 74, scale: 20, coinX: PAD + 20, gemX: PAD + 118, keyX: PAD + 214 };

function label(x, y, extra = '') {
  const el = document.createElement('div');
  el.style.cssText =
    `position:fixed;left:${x}px;top:${y}px;transform:translateY(-50%);` +
    `font:700 21px/1 ui-rounded,"SF Pro Rounded",Avenir,system-ui,sans-serif;` +
    `color:#fff;text-shadow:0 2px 0 rgba(40,25,10,.45),0 0 14px rgba(255,220,150,.35);` +
    `letter-spacing:.5px;pointer-events:none;z-index:3;${extra}`;
  document.body.appendChild(el);
  return el;
}

export class Hud {
  constructor(renderer, totals) {
    this.renderer = renderer;
    this.totals = totals;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 0, -1, -500, 500);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x99aabb, 2.6));
    const key = new THREE.DirectionalLight(0xfff2d8, 2.6);
    key.position.set(-0.4, 0.8, 1);
    this.scene.add(key);

    this.hearts = [];
    for (let i = 0; i < totals.maxHealth; i++) {
      const full = this.#icon('Heart', HEART.x + i * HEART.gap, HEART.y, HEART.scale);
      const empty = this.#icon('Heart_Outline', HEART.x + i * HEART.gap, HEART.y, HEART.scale);
      eachMaterial(empty, (m) => m.color.setHex(0x6b4a52));
      this.hearts.push({ full, empty });
    }

    this.coinIcon = this.#icon('Coin', ROW.coinX, ROW.y, ROW.scale);
    this.gemIcon = this.#icon('Gem_Pink', ROW.gemX, ROW.y, ROW.scale * 0.9);
    this.keyIcon = this.#icon('Key', ROW.keyX, ROW.y, ROW.scale);
    this.keyDim = ownMaterials(this.keyIcon);
    this.keyDim.forEach((m) => m.color.multiplyScalar(0.22));

    this.coinText = label(ROW.coinX + 22, ROW.y);
    this.gemText = label(ROW.gemX + 20, ROW.y);
    this.keyText = label(ROW.keyX + 26, ROW.y, 'opacity:.35');
    this.keyText.textContent = 'KEY';

    this.prompt = label(0, 0, 'left:50%;top:auto;bottom:96px;transform:translateX(-50%);font-size:18px;opacity:0;transition:opacity .18s');
    this.banner = label(0, 0, 'left:50%;top:38%;transform:translate(-50%,-50%) scale(.9);' +
      'font-size:52px;font-weight:800;letter-spacing:1px;opacity:0;text-align:center;' +
      'text-shadow:0 4px 0 rgba(40,25,10,.35),0 0 40px rgba(255,220,150,.6);transition:opacity .3s,transform .3s');
    this.title = label(0, 0, 'left:50%;top:34%;transform:translate(-50%,-50%);text-align:center;' +
      'font-size:15px;font-weight:600;letter-spacing:3px;line-height:2.1;transition:opacity .8s');
    this.title.innerHTML =
      '<div style="font-size:76px;font-weight:800;letter-spacing:8px;margin-bottom:6px">DRIFTLANDS</div>' +
      '<div style="opacity:.85">&larr; &rarr; MOVE &nbsp;·&nbsp; SPACE JUMP &nbsp;·&nbsp; E INTERACT &nbsp;·&nbsp; R RESTART</div>';

    this.bannerTimer = 0;
    this.promptText = '';
    this.resize();
  }

  #icon(name, x, y, scale) {
    const obj = spawn(name, { shadow: false, receive: false });
    ownMaterials(obj);
    eachMaterial(obj, (m) => { m.roughness = 0.45; m.emissive = new THREE.Color(0x000000); });
    obj.scale.setScalar(scale);
    obj.position.set(x, -y, 0);
    obj.rotation.set(-0.18, 0.5, 0.06);
    this.scene.add(obj);
    return obj;
  }

  resize() {
    this.camera.right = innerWidth;
    this.camera.bottom = -innerHeight;
    this.camera.updateProjectionMatrix();
  }

  setPrompt(text) {
    this.pendingPrompt = text;
  }

  showBanner(text, seconds) {
    this.hideTitle();
    this.banner.textContent = text;
    this.bannerTimer = seconds;
    this.banner.style.opacity = '1';
    this.banner.style.transform = 'translate(-50%,-50%) scale(1)';
  }

  hideTitle() {
    this.title.style.opacity = '0';
  }

  update(dt, t, state, health) {
    for (let i = 0; i < this.hearts.length; i++) {
      const h = this.hearts[i];
      const alive = i < health;
      h.full.visible = alive;
      h.empty.visible = !alive;
      const beat = alive ? 1 + Math.max(Math.sin(t * 3.2 - i * 0.5), 0) ** 8 * 0.16 : 1;
      h.full.scale.setScalar(HEART.scale * beat);
    }
    this.coinIcon.rotation.y = t * 1.6;
    this.gemIcon.rotation.y = t * 1.1;
    this.coinText.textContent = `${state.coins}`;
    this.gemText.textContent = `${state.gems}/${this.totals.gems}`;
    if (state.hasKey) {
      this.keyIcon.rotation.y = t * 2;
      this.keyDim.forEach((m) => m.color.lerp(new THREE.Color(0xffc94d), 1 - Math.exp(-4 * dt)));
      this.keyText.style.opacity = '1';
    }

    const want = this.pendingPrompt ?? '';
    this.pendingPrompt = null;
    if (want !== this.promptText) {
      this.promptText = want;
      this.prompt.textContent = want;
      this.prompt.style.opacity = want ? '1' : '0';
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.banner.style.opacity = '0';
        this.banner.style.transform = 'translate(-50%,-50%) scale(.9)';
      }
    }
  }

  render() {
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
    this.renderer.autoClear = true;
  }
}
