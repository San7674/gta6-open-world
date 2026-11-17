// The player: Cole "Rook" Vane, on foot and behind the wheel.
// Foot movement, car theft, driving input, the punch, and health.
import { clamp, dist } from './util.js';
import { driveCar } from './cars.js';

export function createPlayer() {
  return {
    x: 1700, y: 1300, angle: -Math.PI / 2,
    vx: 0, vy: 0,
    onFoot: true, car: null,
    health: 100, money: 25,
    punchCooldown: 0, punchAnim: 0,
    hurtCooldown: 0, lastHurt: -99,
    walkPhase: 0,
  };
}

const FOOT_WALK = 175, FOOT_RUN = 265;

export function updatePlayer(G, dt) {
  const p = G.player;
  const input = G.input;
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.punchAnim = Math.max(0, p.punchAnim - dt);
  p.hurtCooldown = Math.max(0, p.hurtCooldown - dt);

  if (input.pressed('enter')) {
    if (p.onFoot) tryEnterCar(G);
    else exitCar(G);
  }

  if (p.onFoot) {
    let mx = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0);
    let my = (input.down('down') ? 1 : 0) - (input.down('up') ? 1 : 0);
    const len = Math.hypot(mx, my);
    if (len > 0) { mx /= len; my /= len; }
    const speed = input.down('sprint') ? FOOT_RUN : FOOT_WALK;
    p.vx = mx * speed; p.vy = my * speed;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (len > 0) {
      p.angle = Math.atan2(p.vy, p.vx);
      p.walkPhase += dt * (input.down('sprint') ? 13 : 9);
    }
    G.world.resolveCircle(p, 13);
    if (input.pressed('punch')) doPunch(G);
    G.audio.engine(false, 0);
  } else if (p.car) {
    const car = p.car;
    const controls = {
      throttle: (input.down('up') ? 1 : 0) - (input.down('down') ? 0.7 : 0),
      steer: (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0),
      brake: input.down('brake'),
    };
    // Screenshot presets auto-drive so the car is moving in the shot.
    if (G.shot) controls.throttle = Math.max(controls.throttle, 0.8);
    const hardHit = driveCar(G, car, controls, dt);
    if (hardHit && p.hurtCooldown <= 0) {
      hurtPlayer(G, 5);
      p.hurtCooldown = 0.6;
    }
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    G.audio.engine(true, Math.abs(car.speed) / car.maxSpeed);
    if (car.skid && Math.random() < 0.6) {
      G.particles.push({
        kind: 'skid', x: car.x - Math.cos(car.angle) * 18, y: car.y - Math.sin(car.angle) * 18,
        life: 0.5, max: 0.5, size: 7,
      });
    }
  }

  // Slow health regen when out of trouble.
  if (G.time - p.lastHurt > 5 && p.health < 100) {
    p.health = Math.min(100, p.health + 2 * dt);
  }
  if (p.health <= 0) G.wasted();
}

export function hurtPlayer(G, amount) {
  const p = G.player;
  p.health -= amount;
  p.lastHurt = G.time;
  if (p.health <= 0) { p.health = 0; G.wasted(); }
}

function nearestCar(G, maxDist) {
  const p = G.player;
  let best = null, bestD = maxDist;
  for (const car of G.traffic.cars) {
    if (car.kind === 'police') continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

function tryEnterCar(G) {
  const p = G.player;
  const car = nearestCar(G, 68);
  if (!car) return;
  if (car.driver) {
    const driver = car.driver;
    car.driver = null;
    driver.flee = true;
    driver.fleeTimer = 6;
  }
  car.speed = 0;
  car.kind = 'player';
  p.car = car;
  p.onFoot = false;
  if (!car.owned) {
    car.owned = true;
    G.addWanted(1);
    G.addToast('Car stolen — the cops noticed');
    G.audio.phone();
  }
  G.audio.click();
}

function exitCar(G) {
  const p = G.player;
  const car = p.car;
  car.speed = 0;
  car.kind = 'parked';
  car.owned = true;
  const side = p.angle + Math.PI / 2;
  p.x = car.x + Math.cos(side) * 34;
  p.y = car.y + Math.sin(side) * 34;
  G.world.resolveCircle(p, 13);
  p.car = null;
  p.onFoot = true;
  p.vx = 0; p.vy = 0;
  G.audio.engineOff();
  G.audio.click();
}

function doPunch(G) {
  const p = G.player;
  if (p.punchCooldown > 0) return;
  p.punchCooldown = 0.4;
  p.punchAnim = 0.25;
  G.audio.punch();
  const fx = p.x + Math.cos(p.angle) * 30, fy = p.y + Math.sin(p.angle) * 30;
  G.particles.push({ kind: 'stars', x: fx, y: fy, life: 0.35, max: 0.35, size: 10 });
  // Hit the nearest pedestrian in front of the punch.
  for (const ped of G.traffic.peds) {
    if (ped.down > 0) continue;
    const d = dist(p.x, p.y, ped.x, ped.y);
    if (d > 46) continue;
    const ang = Math.atan2(ped.y - p.y, ped.x - p.x);
    let diff = Math.abs(ang - p.angle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > 1.2) continue;
    ped.down = 2.2;
    ped.flee = true;
    ped.fleeTimer = 8;
    G.addWanted(1);
    G.addToast('Assault — wanted level up');
    return;
  }
  // Or a police officer on foot (they hit back).
  for (const cop of G.police.foot) {
    if (cop.down > 0) continue;
    const d = dist(p.x, p.y, cop.x, cop.y);
    if (d > 46) continue;
    cop.down = 1.6;
    G.addWanted(1);
    hurtPlayer(G, 5);
    G.addToast('You hit a cop — bad idea');
    return;
  }
}
