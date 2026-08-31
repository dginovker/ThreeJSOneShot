// The whole level in one place: platform boxes in world units (x is the left
// edge, `top` is the surface the player stands on) plus where every prop sits.
// Everything else in the game reads from here, so tuning the level never means
// touching the systems that run it.

export const PLATFORMS = [
  { x: -6, w: 22, top: 0 },
  { x: 21, w: 14, top: 0 },
  { x: 40, w: 8, top: 2 },
  { x: 52, w: 18, top: 8 },
  { x: 75, w: 12, top: 9 },
  { x: 102, w: 14, top: 9 },
  { x: 109, w: 10, top: 17 },
  { x: 121, w: 24, top: 9 },
];

export const BRIDGE = { x: 87, segments: 5, span: 3, top: 9 };

export const BOUNCERS = [
  { x: 46, y: 2 },
  { x: 104.5, y: 9 },
];

// Every saw is placed so it can be beaten: the flat sweeps sit low enough to
// jump clean over, and the vertical ones rise high enough to run under.
export const SAWS = [
  { a: [23, 1], b: [33, 1], period: 3.6, phase: 0 },
  { a: [131, 10], b: [131, 15], period: 2.4, phase: 0 },
  { a: [135, 15], b: [135, 10], period: 2.8, phase: 0.9 },
  { a: [139, 10], b: [139, 15], period: 2.2, phase: 2.1 },
];

export const BEES = [
  { x0: 54, x1: 68, y: 12, period: 6 },
  { x0: 122, x1: 130, y: 12.4, period: 5 },
];

export const LEVER = { x: 80, y: 9 };
export const DOOR = { x: 127, y: 9 };
export const KEY = { x: 113.5, y: 19 };
export const GOAL = { x: 143, y: 9 };

export const GEMS = [
  { x: 44, y: 6.4, model: 'Gem_Green' },
  { x: 61, y: 12.5, model: 'Gem_Blue' },
  { x: 94.5, y: 12.5, model: 'Gem_Pink' },
];

export const CHECKPOINTS = [
  { x: 0, y: 0 },
  { x: 54, y: 8 },
  { x: 104, y: 9 },
  { x: 122.5, y: 9 },
];

/** A row of coins along a shallow arc — the shape a jump actually traces. */
function arc(x0, x1, yBase, peak, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out.push({ x: x0 + (x1 - x0) * t, y: yBase + Math.sin(t * Math.PI) * peak });
  }
  return out;
}

function row(x0, x1, y, n) {
  return arc(x0, x1, y, 0, n);
}

export const COINS = [
  ...row(4, 12, 1.6, 4),
  ...arc(16.5, 20.5, 1.6, 2.4, 4),      // over the first gap
  ...row(23, 33, 4.4, 5),               // above the sweeping saw
  ...arc(35.5, 39.5, 1.8, 2.6, 4),
  ...arc(48, 52, 5, 4.5, 5),            // the bouncer launch
  ...row(54, 68, 9.6, 7),
  ...arc(70.5, 74.5, 10.6, 2.2, 4),
  ...row(88, 101, 10.6, 6),             // only reachable once the bridge is up
  ...arc(106, 110, 12, 4.5, 5),
  ...row(110, 117, 18.6, 4),
  ...arc(116.5, 120.5, 10.6, 2.4, 4),
  ...row(129, 141, 10.8, 5),
];

export const START = { x: 0, y: 0 };
export const LEVEL_END = 148;
export const KILL_Y = -34;
