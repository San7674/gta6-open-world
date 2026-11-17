// Pure helpers shared by every Rustport module: seeded randomness, math, collision.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const TAU = Math.PI * 2;

// Shortest signed difference between two angles, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

// Turn `angle` toward `target` by at most `maxStep` radians.
export function turnToward(angle, target, maxStep) {
  const d = angleDiff(angle, target);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function rangeInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }

// Circle vs axis-aligned rectangle: true when they overlap.
export function circleHitsRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// Push a circle out of a rectangle it overlaps. Returns true when a push happened.
export function pushCircleOutOfRect(pos, r, rect) {
  const nx = clamp(pos.x, rect.x, rect.x + rect.w);
  const ny = clamp(pos.y, rect.y, rect.y + rect.h);
  let dx = pos.x - nx, dy = pos.y - ny;
  let d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 < 0.0001) {
    // Center is inside the rectangle: push out along the smallest penetration axis.
    const left = pos.x - rect.x, right = rect.x + rect.w - pos.x;
    const top = pos.y - rect.y, bottom = rect.y + rect.h - pos.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) pos.x = rect.x - r;
    else if (m === right) pos.x = rect.x + rect.w + r;
    else if (m === top) pos.y = rect.y - r;
    else pos.y = rect.y + rect.h + r;
    return true;
  }
  const d = Math.sqrt(d2);
  pos.x = nx + (dx / d) * r;
  pos.y = ny + (dy / d) * r;
  return true;
}
