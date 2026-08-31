// Procedural WebAudio — no asset budget, and every sound is tuned by ear from
// numbers we can nudge, which beats hunting for CC0 clips that almost fit.
let ctx = null;
let master = null;

export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext ?? window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

// Browsers suspend a context created before the first gesture; resume there.
export function resumeAudio() {
  if (ctx.state === 'suspended') ctx.resume();
}

function env(node, t0, peak, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  node.connect(g);
  g.connect(master);
  return g;
}

function tone({ freq, to = freq, type = 'square', gain = 0.2, attack = 0.005, decay = 0.15, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, t0 + attack + decay);
  env(osc, t0, gain, attack, decay);
  osc.start(t0);
  osc.stop(t0 + attack + decay + 0.05);
}

function noise({ gain = 0.2, decay = 0.2, freq = 1200, q = 1, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const len = Math.ceil(ctx.sampleRate * (decay + 0.05));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  src.connect(filter);
  env(filter, t0, gain, 0.004, decay);
  src.start(t0);
  src.stop(t0 + decay + 0.05);
}

const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880];

export const sfx = {
  jump: () => tone({ freq: 320, to: 620, type: 'square', gain: 0.14, decay: 0.11 }),
  land: () => noise({ freq: 380, q: 1.4, gain: 0.16, decay: 0.11 }),
  // Coins climb the pentatonic as a streak builds, so a run of them sings.
  coin: (streak = 0) => {
    const f = PENTATONIC[Math.min(streak, PENTATONIC.length - 1)];
    tone({ freq: f, type: 'triangle', gain: 0.16, decay: 0.09 });
    tone({ freq: f * 2, type: 'triangle', gain: 0.1, decay: 0.16, delay: 0.05 });
  },
  gem: () => {
    [880, 1174.66, 1567.98].forEach((f, i) =>
      tone({ freq: f, type: 'triangle', gain: 0.15, decay: 0.3, delay: i * 0.07 })
    );
  },
  bounce: () => tone({ freq: 180, to: 900, type: 'sine', gain: 0.28, attack: 0.01, decay: 0.22 }),
  stomp: () => {
    noise({ freq: 700, q: 0.8, gain: 0.24, decay: 0.12 });
    tone({ freq: 260, to: 90, type: 'square', gain: 0.16, decay: 0.16 });
  },
  hurt: () => {
    tone({ freq: 300, to: 70, type: 'sawtooth', gain: 0.22, decay: 0.34 });
    noise({ freq: 300, q: 0.6, gain: 0.16, decay: 0.24 });
  },
  lever: () => {
    noise({ freq: 2600, q: 3, gain: 0.16, decay: 0.06 });
    tone({ freq: 160, to: 300, type: 'square', gain: 0.14, decay: 0.2, delay: 0.04 });
  },
  bridge: () => tone({ freq: 90, to: 200, type: 'sawtooth', gain: 0.12, decay: 0.9 }),
  key: () => [1046, 1318, 1567, 2093].forEach((f, i) =>
    tone({ freq: f, type: 'triangle', gain: 0.13, decay: 0.24, delay: i * 0.06 })),
  door: () => {
    noise({ freq: 220, q: 0.7, gain: 0.2, decay: 0.7 });
    tone({ freq: 130, to: 60, type: 'sine', gain: 0.2, decay: 0.7 });
  },
  locked: () => tone({ freq: 150, to: 110, type: 'square', gain: 0.16, decay: 0.12 }),
  death: () => [523, 440, 349, 262].forEach((f, i) =>
    tone({ freq: f, type: 'square', gain: 0.16, decay: 0.24, delay: i * 0.1 })),
  win: () => [523, 659, 784, 1046, 1318].forEach((f, i) =>
    tone({ freq: f, type: 'triangle', gain: 0.2, decay: 0.5, delay: i * 0.11 })),
};
