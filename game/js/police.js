// The Rustport PD: wanted stars, police cars that hunt on the street grid,
// foot cops that run you down, and the bust.
import { clamp, dist, pick, rangeInt } from './util.js';
import { STREETS } from './world.js';
import { createCar, steerCarToward, driveCar } from './cars.js';
import { streetIndex, lanePoint, DIRS } from './traffic.js';

export function createPolice() {
  return { cars: [], foot: [] };
}

function desiredCounts(stars, onFoot) {
  if (stars <= 0) return { cars: 0, foot: 0 };
  if (stars === 1) return onFoot ? { cars: 0, foot: 1 } : { cars: 1, foot: 0 };
  if (stars === 2) return { cars: 1, foot: 1 };
  if (stars === 3) return { cars: 2, foot: 1 };
  if (stars === 4) return { cars: 3, foot: 2 };
  return { cars: 4, foot: 2 };
}

function spawnPoliceCar(G) {
  const p = G.player;
  // Spawn on a street 500-900 px away, on the grid.
  const ix = clamp(streetIndex(p.x) + pick(Math.random, [-2, -1, 1, 2]), 0, 7);
  const iy = clamp(streetIndex(p.y) + pick(Math.random, [-2, -1, 1, 2]), 0, 7);
  const d = rangeInt(Math.random, 0, 3);
  const pt = lanePoint(ix, iy, d);
  const car = createCar(pt.x, pt.y, Math.atan2(DIRS[d][1], DIRS[d][0]), 'police', '#1a2f4a', 'police');
  car.speed = 200;
  car.ix = ix; car.iy = iy; car.dir = d; car.bustTimer = 0;
  pickNextPoliceIntersection(G, car);
  return car;
}

function pickNextPoliceIntersection(G, car) {
  const p = G.player;
  const pix = streetIndex(p.x), piy = streetIndex(p.y);
  const options = [];
  for (let d = 0; d < 4; d++) {
    if (d === (car.dir + 2) % 4) continue;
    const nx = car.ix + DIRS[d][0], ny = car.iy + DIRS[d][1];
    if (nx < 0 || nx > 7 || ny < 0 || ny > 7) continue;
    const manhattan = Math.abs(nx - pix) + Math.abs(ny - piy);
    options.push({ d, nx, ny, manhattan });
  }
  if (!options.length) { car.dir = (car.dir + 2) % 4; return; }
  options.sort((a, b) => a.manhattan - b.manhattan);
  // Usually take the best road toward the player, sometimes a random one.
  const choice = Math.random() < 0.8 ? options[0] : pick(Math.random, options);
  car.dir = choice.d; car.ix = choice.nx; car.iy = choice.ny;
  const pt = lanePoint(car.ix, car.iy, car.dir);
  car.tx = pt.x; car.ty = pt.y;
}

function spawnFootCop(G) {
  const p = G.player;
  const a = Math.random() * Math.PI * 2;
  const cop = {
    x: clamp(p.x + Math.cos(a) * 320, 30, 3810),
    y: clamp(p.y + Math.sin(a) * 320, 30, 3810),
    angle: 0, speed: 195, kind: 'cop',
    down: 0, arrestTimer: 0,
    color: '#1a2f4a',
    id: Math.random().toString(36).slice(2, 9),
  };
  G.world.resolveCircle(cop, 11);
  return cop;
}

export function updatePolice(G, dt) {
  const wanted = G.wanted;
  const p = G.player;

  // Wanted decays after 18 quiet seconds with no police close by.
  if (wanted.stars > 0) {
    const nearCop = G.police.cars.some((c) => dist(c.x, c.y, p.x, p.y) < 600)
      || G.police.foot.some((c) => dist(c.x, c.y, p.x, p.y) < 300);
    if (!nearCop) {
      wanted.calmTimer += dt;
      if (wanted.calmTimer > 18) {
        wanted.stars--;
        wanted.calmTimer = 0;
        G.addToast(wanted.stars > 0 ? 'Heat dying down…' : 'You lost them. Clean — for now.');
      }
    } else {
      wanted.calmTimer = 0;
    }
  }

  // Keep the right number of units on the street.
  const want = desiredCounts(wanted.stars, p.onFoot);
  while (G.police.cars.length < want.cars) G.police.cars.push(spawnPoliceCar(G));
  while (G.police.foot.length < want.foot) G.police.foot.push(spawnFootCop(G));
  if (wanted.stars === 0) {
    // Units peel off once the heat is gone.
    if (G.police.cars.length && Math.random() < dt * 0.5) G.police.cars.pop();
    if (G.police.foot.length && Math.random() < dt * 0.5) G.police.foot.pop();
  }

  // --- police cars ---
  for (const car of G.police.cars) {
    const dPlayer = dist(car.x, car.y, p.x, p.y);
    const sameStreet = Math.abs(car.x - p.x) < 60 || Math.abs(car.y - p.y) < 60;
    if (!p.onFoot && dPlayer < 420 && sameStreet) {
      // Close and on the same road: ram the player.
      steerCarToward(G, car, p.x, p.y, Math.min(p.car ? Math.abs(p.car.speed) + 80 : 300, 570), dt);
    } else {
      // Hunt on the grid toward the player's intersection.
      if (dist(car.x, car.y, car.tx, car.ty) < 26) pickNextPoliceIntersection(G, car);
      steerCarToward(G, car, car.tx, car.ty, 420, dt);
    }
    // Ram damage + bust pressure.
    if (!p.onFoot && p.car && dPlayer < 55) {
      if (p.hurtCooldown <= 0) {
        p.health -= 4;
        p.lastHurt = G.time;
        G.audio.crash();
        p.hurtCooldown = 0.8;
        if (p.health <= 0) { p.health = 0; G.wasted(); return; }
      }
      // Boxed in at low speed: the bust timer runs.
      if (Math.abs(p.car.speed) < 40) {
        car.bustTimer += dt;
        if (car.bustTimer > 2) { G.busted(); return; }
      } else car.bustTimer = 0;
    } else {
      car.bustTimer = 0;
    }
  }

  // --- foot cops ---
  for (const cop of G.police.foot) {
    if (cop.down > 0) { cop.down -= dt; continue; }
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (p.onFoot && d < 26) {
      cop.arrestTimer += dt;
      if (cop.arrestTimer > 1.2) { G.busted(); return; }
    } else {
      cop.arrestTimer = Math.max(0, cop.arrestTimer - dt * 2);
    }
    if (d > 20) {
      const want = Math.atan2(p.y - cop.y, p.x - cop.x);
      cop.angle = want;
      cop.x += Math.cos(want) * cop.speed * dt;
      cop.y += Math.sin(want) * cop.speed * dt;
      G.world.resolveCircle(cop, 11);
    }
  }

  G.audio.siren(wanted.stars > 0);
}

export function clearPolice(G) {
  G.police.cars.length = 0;
  G.police.foot.length = 0;
  G.wanted.stars = 0;
  G.wanted.calmTimer = 0;
  G.audio.siren(false);
}
