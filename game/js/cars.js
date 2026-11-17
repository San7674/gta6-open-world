// Cars: one factory and the shared arcade driving physics.
// Player cars, traffic cars and police cars are all the same kind of object;
// only who steers them differs.
import { clamp, turnToward, angleDiff } from './util.js';

export const MODELS = {
  sedan:  { maxSpeed: 480, accel: 300, turn: 2.6, len: 46, wid: 22 },
  sports: { maxSpeed: 650, accel: 430, turn: 3.0, len: 46, wid: 21 },
  hatch:  { maxSpeed: 440, accel: 280, turn: 2.8, len: 40, wid: 21 },
  van:    { maxSpeed: 400, accel: 230, turn: 2.2, len: 52, wid: 24 },
  truck:  { maxSpeed: 380, accel: 210, turn: 2.0, len: 56, wid: 24 },
  taxi:   { maxSpeed: 480, accel: 300, turn: 2.6, len: 46, wid: 22 },
  police: { maxSpeed: 570, accel: 390, turn: 2.9, len: 48, wid: 22 },
};

export function createCar(x, y, angle, model, color, kind = 'traffic') {
  const m = MODELS[model] || MODELS.sedan;
  return {
    x, y, angle, speed: 0, model, color, kind,
    maxSpeed: m.maxSpeed, accel: m.accel, turn: m.turn, len: m.len, wid: m.wid,
    owned: false, driver: null, brakeLight: false, crashed: false, skid: false,
    id: Math.random().toString(36).slice(2, 9),
  };
}

// One physics step for a car steered by {throttle (-1..1), steer (-1..1), brake}.
// Returns true when the car hit something hard this step.
export function driveCar(G, car, controls, dt) {
  const m = car;
  const speed01 = Math.abs(car.speed) / car.maxSpeed;
  if (controls.throttle > 0) car.speed += car.accel * controls.throttle * dt;
  if (controls.throttle < 0) car.speed += car.accel * 0.7 * controls.throttle * dt;
  if (controls.brake) car.speed -= Math.sign(car.speed) * 700 * dt;
  // Rolling drag + a little extra when coasting.
  car.speed -= car.speed * 0.55 * dt;
  if (Math.abs(car.speed) < 4 && controls.throttle === 0) car.speed = 0;
  car.speed = clamp(car.speed, -180, car.maxSpeed);

  const steerAuthority = clamp(Math.abs(car.speed) / 120, 0, 1) * (car.speed < 0 ? -1 : 1);
  const turnRate = car.turn * (1 - speed01 * 0.45) * (controls.brake ? 1.5 : 1);
  car.angle += controls.steer * turnRate * steerAuthority * dt;
  car.skid = controls.brake && Math.abs(car.speed) > 200;

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // Two collision circles (nose and tail) against buildings and water.
  let hardHit = false;
  for (const off of [car.len * 0.32, -car.len * 0.32]) {
    const pos = {
      x: car.x + Math.cos(car.angle) * off,
      y: car.y + Math.sin(car.angle) * off,
    };
    const before = { x: pos.x, y: pos.y };
    if (G.world.resolveCircle(pos, car.wid * 0.62)) {
      const pushed = Math.hypot(pos.x - before.x, pos.y - before.y);
      // Move the car body by the same push so nose and tail stay consistent.
      car.x += pos.x - before.x;
      car.y += pos.y - before.y;
      if (Math.abs(car.speed) > 260) { hardHit = true; G.audio.crash(); }
      car.speed *= pushed > 2 ? 0.45 : 0.8;
    }
  }
  return hardHit;
}

// Steer a car toward a point at a target speed (traffic + police AI).
export function steerCarToward(G, car, tx, ty, targetSpeed, dt) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(car.angle, want);
  const steer = clamp(diff * 2.2, -1, 1);
  const throttle = car.speed < targetSpeed ? 1 : 0;
  const brake = Math.abs(diff) > 1.9 && car.speed > 120;
  return driveCar(G, car, { throttle, steer, brake }, dt);
}

// Simple circle-vs-circle push between two cars; returns true on contact.
export function collideCars(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = (a.len + b.len) / 2 - 6;
  if (d >= min || d < 0.01) return false;
  const push = (min - d) / 2;
  const nx = dx / d, ny = dy / d;
  a.x -= nx * push; a.y -= ny * push;
  b.x += nx * push; b.y += ny * push;
  const avg = (a.speed + b.speed) / 2;
  a.speed = avg * 0.6; b.speed = avg * 0.6;
  return true;
}
