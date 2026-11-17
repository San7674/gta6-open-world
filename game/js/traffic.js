// Traffic: cars that drive the street grid and pedestrians that walk the sidewalks.
// Both respawn near the player so the streets around you always feel alive.
import { clamp, dist, pick, range, rangeInt, angleDiff } from './util.js';
import { STREETS, LANE } from './world.js';
import { createCar, steerCarToward, collideCars } from './cars.js';

const CAR_COLORS = ['#c23b2e', '#2e5fa3', '#d8c33a', '#e8e8e8', '#222831', '#3a7a4d', '#c26a1e', '#7a3aa0', '#5a7a8a', '#a03a5a'];
const PED_COLORS = ['#d8a03a', '#3a7ad8', '#7ad83a', '#d83a7a', '#8a5ad8', '#e8e8e8', '#3ad8c2', '#d86a3a'];
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E, S, W, N

export function streetIndex(v) {
  let best = 0;
  for (let i = 0; i < STREETS.length; i++) {
    if (Math.abs(STREETS[i] - v) < Math.abs(STREETS[best] - v)) best = i;
  }
  return best;
}

// Lane point at intersection (ix, iy) for a car travelling in direction d.
export function lanePoint(ix, iy, d) {
  const [dx, dy] = DIRS[d];
  return { x: STREETS[ix] + -dy * LANE, y: STREETS[iy] + dx * LANE };
}

function spawnTrafficCar(G, nearPlayer) {
  const rng = Math.random;
  let ix, iy;
  if (nearPlayer) {
    ix = clamp(streetIndex(G.player.x) + rangeInt(rng, -2, 2), 0, 7);
    iy = clamp(streetIndex(G.player.y) + rangeInt(rng, -2, 2), 0, 7);
  } else {
    ix = rangeInt(rng, 0, 7); iy = rangeInt(rng, 0, 7);
  }
  const d = rangeInt(rng, 0, 3);
  const p = lanePoint(ix, iy, d);
  const model = rng() < 0.14 ? 'taxi' : pick(rng, ['sedan', 'sedan', 'hatch', 'van', 'sports']);
  const color = model === 'taxi' ? '#d8c33a' : pick(rng, CAR_COLORS);
  const car = createCar(p.x, p.y, Math.atan2(DIRS[d][1], DIRS[d][0]), model, color, 'traffic');
  car.speed = range(rng, 120, 200);
  car.ix = ix; car.iy = iy; car.dir = d;
  pickNextIntersection(G, car);
  return car;
}

function pickNextIntersection(G, car) {
  const rng = Math.random;
  const options = [];
  for (let d = 0; d < 4; d++) {
    if (d === (car.dir + 2) % 4) continue; // no U-turn
    const nx = car.ix + DIRS[d][0], ny = car.iy + DIRS[d][1];
    if (nx < 0 || nx > 7 || ny < 0 || ny > 7) continue;
    options.push({ d, nx, ny, straight: d === car.dir });
  }
  if (!options.length) { car.dir = (car.dir + 2) % 4; return; }
  const straight = options.filter((o) => o.straight);
  const choice = (straight.length && rng() < 0.55) ? straight[0] : pick(rng, options);
  car.dir = choice.d;
  car.ix = choice.nx; car.iy = choice.ny;
  const p = lanePoint(car.ix, car.iy, car.dir);
  car.tx = p.x; car.ty = p.y;
}

function spawnPed(G, nearPlayer) {
  const rng = Math.random;
  let ix, iy;
  if (nearPlayer) {
    ix = clamp(streetIndex(G.player.x) + rangeInt(rng, -2, 2), 0, 7);
    iy = clamp(streetIndex(G.player.y) + rangeInt(rng, -2, 2), 0, 7);
  } else {
    ix = rangeInt(rng, 0, 7); iy = rangeInt(rng, 0, 7);
  }
  const d = rangeInt(rng, 0, 3);
  const [dx, dy] = DIRS[d];
  const p = {
    x: STREETS[ix] + -dy * 64, y: STREETS[iy] + dx * 64,
    angle: Math.atan2(dy, dx), speed: range(rng, 35, 60),
    color: pick(rng, PED_COLORS), kind: 'ped',
    down: 0, flee: false, fleeTimer: 0, ix, iy, dir: d,
    id: Math.random().toString(36).slice(2, 9),
  };
  pickNextPedTarget(p);
  return p;
}

function pickNextPedTarget(ped) {
  const options = [];
  for (let d = 0; d < 4; d++) {
    if (d === (ped.dir + 2) % 4) continue;
    const nx = ped.ix + DIRS[d][0], ny = ped.iy + DIRS[d][1];
    if (nx < 0 || nx > 7 || ny < 0 || ny > 7) continue;
    options.push({ d, nx, ny });
  }
  if (!options.length) { ped.dir = (ped.dir + 2) % 4; return; }
  const choice = pick(Math.random, options);
  ped.dir = choice.d; ped.ix = choice.nx; ped.iy = choice.ny;
  const [dx, dy] = DIRS[choice.d];
  ped.tx = STREETS[ped.ix] + -dy * 64;
  ped.ty = STREETS[ped.iy] + dx * 64;
}

export function createTraffic(G) {
  const traffic = { cars: [], peds: [] };
  // Parked cars from the world are stealable props, not AI traffic.
  for (const pc of G.world.parkedCars) {
    const car = createCar(pc.x, pc.y, pc.angle, pc.model, pc.color, 'parked');
    car.special = pc.special || null;
    traffic.cars.push(car);
  }
  for (let i = 0; i < 14; i++) traffic.cars.push(spawnTrafficCar(G, false));
  for (let i = 0; i < 26; i++) traffic.peds.push(spawnPed(G, false));
  return traffic;
}

function carAhead(G, car) {
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  for (const other of G.traffic.cars) {
    if (other === car || other.kind === 'parked') continue;
    const dx = other.x - car.x, dy = other.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead > 0 && ahead < 70 && Math.abs(dx * fy - dy * fx) < 26) return true;
  }
  return false;
}

export function updateTraffic(G, dt) {
  const p = G.player;
  // --- cars ---
  for (let i = G.traffic.cars.length - 1; i >= 0; i--) {
    const car = G.traffic.cars[i];
    if (car.kind === 'parked' || car.kind === 'player') continue;
    if (dist(car.x, car.y, p.x, p.y) > 2000) {
      G.traffic.cars[i] = spawnTrafficCar(G, true);
      continue;
    }
    const d = dist(car.x, car.y, car.tx, car.ty);
    if (d < 26) pickNextIntersection(G, car);
    const targetSpeed = carAhead(G, car) ? 0 : 190;
    steerCarToward(G, car, car.tx, car.ty, targetSpeed, dt);
  }
  // Car-car collisions (only near the player, for speed).
  const cars = G.traffic.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (a.kind === 'parked' && b.kind === 'parked') continue;
      if (dist(a.x, a.y, b.x, b.y) > 120) continue;
      if (collideCars(a, b) && (a.kind === 'player' || b.kind === 'player')) {
        if (Math.abs(a.speed) + Math.abs(b.speed) > 200) G.audio.crash();
      }
    }
  }
  // --- pedestrians ---
  for (let i = G.traffic.peds.length - 1; i >= 0; i--) {
    const ped = G.traffic.peds[i];
    if (dist(ped.x, ped.y, p.x, p.y) > 2000 && !ped.flee) {
      G.traffic.peds[i] = spawnPed(G, true);
      continue;
    }
    if (ped.down > 0) {
      ped.down -= dt;
      if (ped.down <= 0) { ped.flee = true; ped.fleeTimer = 6; }
      continue;
    }
    if (ped.flee) {
      ped.fleeTimer -= dt;
      const away = Math.atan2(ped.y - p.y, ped.x - p.x);
      ped.angle = away;
      ped.x += Math.cos(away) * 150 * dt;
      ped.y += Math.sin(away) * 150 * dt;
      G.world.resolveCircle(ped, 11);
      if (ped.fleeTimer <= 0) { ped.flee = false; pickNextPedTarget(ped); }
      continue;
    }
    const d = dist(ped.x, ped.y, ped.tx, ped.ty);
    if (d < 14) pickNextPedTarget(ped);
    const want = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
    ped.angle = want;
    ped.x += Math.cos(want) * ped.speed * dt;
    ped.y += Math.sin(want) * ped.speed * dt;
  }
}

// A car ran a pedestrian over: knock them down, they flee when they get up.
export function knockPedDown(G, ped) {
  if (ped.down > 0) return;
  ped.down = 2.4;
  ped.flee = true;
  ped.fleeTimer = 8;
  G.audio.crash();
  G.particles.push({ kind: 'stars', x: ped.x, y: ped.y - 10, life: 0.4, max: 0.4, size: 12 });
}
