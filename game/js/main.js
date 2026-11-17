// Rustport: game loop, state machine, camera, save/load, shot presets.
// One shared state object G is passed to every system.
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createPlayer, updatePlayer, hurtPlayer } from './player.js';
import { createTraffic, updateTraffic, knockPedDown } from './traffic.js';
import { createPolice, updatePolice, clearPolice } from './police.js';
import { createMissions, updateMissions, startMission, MISSION_LIST } from './missions.js';
import { drawWorld } from './render.js';
import { drawHUD, showOverlay, setStatus } from './hud.js';
import { clamp, dist, lerp } from './util.js';
import { createCar, collideCars } from './cars.js';
import { streetIndex, lanePoint } from './traffic.js';

const SAVE_KEY = 'rustport-save-v1';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const G = {
  world: createWorld(),
  input: createInput(canvas),
  audio: createAudio(),
  player: createPlayer(),
  traffic: null, police: null, missions: null,
  wanted: { stars: 0, heat: 0, calmTimer: 0 },
  camera: { x: 1700, y: 1300, zoom: 1 },
  particles: [], toasts: [],
  state: 'menu',
  time: 0, dayTime: 9.5, day: 1,
  hurtFlash: 0, saveTimer: 0, menuAngle: 0,
  shot: null,
};

G.traffic = createTraffic(G);
G.police = createPolice();
G.missions = createMissions();

G.addWanted = (n) => {
  G.wanted.stars = clamp(G.wanted.stars + n, 0, 5);
  G.wanted.calmTimer = 0;
};
G.addToast = (text) => {
  G.toasts.push({ text, life: 4 });
  if (G.toasts.length > 4) G.toasts.shift();
  setStatus(text);
};
G.addMoney = (n) => { G.player.money += n; };

G.busted = () => {
  if (G.state !== 'playing') return;
  G.state = 'busted';
  const fine = Math.min(100, G.player.money);
  G.player.money -= fine;
  document.getElementById('end-title').textContent = 'BUSTED';
  document.getElementById('end-text').textContent =
    `The RPD hauled you in. Fine: $${fine}. Your car is impounded — you're back on foot.`;
  showOverlay('end');
  G.audio.busted();
  G.audio.engineOff();
  G.audio.siren(false);
  G.saveGame();
};
G.wasted = () => {
  if (G.state !== 'playing') return;
  G.state = 'wasted';
  const bill = Math.min(50, G.player.money);
  G.player.money -= bill;
  document.getElementById('end-title').textContent = 'WASTED';
  document.getElementById('end-text').textContent =
    `You wake up in Rustport General, $${bill} lighter. The city didn't wait for you.`;
  showOverlay('end');
  G.audio.busted();
  G.audio.engineOff();
  G.audio.siren(false);
  G.saveGame();
};

G.saveGame = () => {
  try {
    const save = {
      money: G.player.money, health: G.player.health,
      x: G.player.x, y: G.player.y,
      missionsDone: G.missions.done, current: G.missions.current,
      coinsGot: G.missions.coinsGot,
      coinsTaken: G.missions.coins.map((c) => c.taken),
      dayTime: G.dayTime, day: G.day,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch { /* storage unavailable: the game still plays */ }
};

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function applySave(save) {
  const p = G.player;
  p.money = save.money; p.health = save.health;
  p.x = save.x; p.y = save.y; p.angle = 0;
  p.onFoot = true; p.car = null;
  G.missions.done = save.missionsDone || [];
  G.missions.current = save.current || 0;
  G.missions.coinsGot = save.coinsGot || 0;
  G.missions.coins.forEach((c, i) => { c.taken = !!(save.coinsTaken && save.coinsTaken[i]); });
  G.dayTime = save.dayTime ?? 9.5;
  G.day = save.day || 1;
  clearPolice(G);
  G.camera.x = p.x; G.camera.y = p.y;
}

function newGame() {
  const p = G.player;
  p.x = 1700; p.y = 1300; p.angle = -Math.PI / 2;
  p.onFoot = true; p.car = null;
  p.health = 100; p.money = 25;
  G.wanted.stars = 0; G.wanted.calmTimer = 0;
  clearPolice(G);
  G.missions = createMissions();
  G.dayTime = 9.5; G.day = 1;
  G.camera.x = p.x; G.camera.y = p.y;
  G.state = 'playing';
  showOverlay(null);
  startMission(G, 0);
}

function continueGame() {
  const save = loadSave();
  if (!save) return;
  applySave(save);
  G.state = 'playing';
  showOverlay(null);
  if (G.missions.current < MISSION_LIST.length && !G.missions.done.includes(MISSION_LIST[G.missions.current].id)) {
    startMission(G, G.missions.current);
  }
}

function respawn() {
  const p = G.player;
  const spot = G.state === 'busted' ? G.world.places.policeHQ : G.world.places.hospital;
  p.x = spot.x; p.y = spot.y; p.angle = 0;
  p.onFoot = true; p.car = null;
  p.health = 100;
  clearPolice(G);
  G.camera.x = p.x; G.camera.y = p.y;
  G.state = 'playing';
  showOverlay(null);
  G.addToast('Back on the street. Stay sharp.');
}

function update(dt) {
  G.time += dt;
  G.dayTime += dt / 90; // one game hour every 90 real seconds
  if (G.dayTime >= 24) { G.dayTime -= 24; G.day++; }

  // Toasts + particles age.
  for (let i = G.toasts.length - 1; i >= 0; i--) {
    G.toasts[i].life -= dt;
    if (G.toasts[i].life <= 0) G.toasts.splice(i, 1);
  }
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const pt = G.particles[i];
    pt.life -= dt;
    if (pt.life <= 0) G.particles.splice(i, 1);
  }
  G.hurtFlash = Math.max(0, G.hurtFlash - dt);

  if (G.state === 'menu') {
    G.menuAngle += dt * 0.08;
    G.camera.x = 1920 + Math.cos(G.menuAngle) * 500;
    G.camera.y = 1920 + Math.sin(G.menuAngle) * 500;
    G.camera.zoom = 0.7;
    updateTraffic(G, dt);
    return;
  }
  if (G.state !== 'playing') return;

  // Pause / mute.
  if (G.input.pressed('pause')) {
    G.state = 'paused';
    document.getElementById('pause-info').textContent =
      `Money $${G.player.money} · Jobs done ${G.missions.done.length}/5 · Coins ${G.missions.coinsGot}/20 · Day ${G.day}`;
    showOverlay('pause');
    G.audio.engineOff();
    G.audio.siren(false);
    G.saveGame();
    return;
  }
  if (G.input.pressed('mute')) {
    const muted = G.audio.toggleMute();
    G.addToast(muted ? 'Sound off' : 'Sound on');
  }

  const prevHealth = G.player.health;
  updatePlayer(G, dt);
  if (G.player.health < prevHealth) G.hurtFlash = 0.35;
  updateTraffic(G, dt);
  updatePolice(G, dt);
  updateMissions(G, dt);

  // --- interactions ---
  const p = G.player;
  if (!p.onFoot && p.car) {
    // Running pedestrians over.
    for (const ped of G.traffic.peds) {
      if (ped.down > 0) continue;
      if (dist(p.car.x, p.car.y, ped.x, ped.y) < 30 && Math.abs(p.car.speed) > 60) {
        knockPedDown(G, ped);
        G.addWanted(1);
        G.addToast('Pedestrian down — wanted level up');
      }
    }
    // Police cars ram / collide with the player's car.
    for (const cop of G.police.cars) {
      if (collideCars(p.car, cop) && Math.abs(p.car.speed) + Math.abs(cop.speed) > 200) {
        G.audio.crash();
      }
    }
  } else {
    // A fast car hitting the player on foot.
    for (const car of G.traffic.cars) {
      if (car.kind === 'parked') continue;
      if (dist(p.x, p.y, car.x, car.y) < 30 && Math.abs(car.speed) > 120 && p.hurtCooldown <= 0) {
        hurtPlayer(G, 10);
        p.hurtCooldown = 1;
        p.x += (p.x - car.x) * 0.4; p.y += (p.y - car.y) * 0.4;
        G.audio.crash();
      }
    }
  }
  // Police cars vs traffic cars.
  for (const cop of G.police.cars) {
    for (const car of G.traffic.cars) {
      if (car.kind === 'parked' || car.kind === 'player') continue;
      if (dist(cop.x, cop.y, car.x, car.y) < 90) collideCars(cop, car);
    }
  }

  // --- camera follows the player, wider when driving ---
  const lookX = p.onFoot ? 0 : Math.cos(p.angle) * Math.abs(p.car ? p.car.speed : 0) * 0.12;
  const lookY = p.onFoot ? 0 : Math.sin(p.angle) * Math.abs(p.car ? p.car.speed : 0) * 0.12;
  G.camera.x = lerp(G.camera.x, p.x + lookX, 1 - Math.pow(0.001, dt));
  G.camera.y = lerp(G.camera.y, p.y + lookY, 1 - Math.pow(0.001, dt));
  G.camera.zoom = lerp(G.camera.zoom, p.onFoot ? 1 : 0.82, 1 - Math.pow(0.01, dt));

  // Autosave.
  G.saveTimer += dt;
  if (G.saveTimer > 30) { G.saveTimer = 0; G.saveGame(); }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  update(dt);
  drawWorld(G, ctx, W, H);
  if (G.state === 'playing' || G.state === 'paused' || G.state === 'busted' || G.state === 'wasted') {
    drawHUD(G, ctx, W, H);
  }
  G.input.endFrame();
  if (!window.__rustportReady) {
    window.__rustportReady = true;
    window.__rustport = { G, version: 'rustport-1' };
  }
}

// --- menus ---
document.getElementById('btn-start').addEventListener('click', () => {
  G.audio.unlock();
  G.audio.click();
  newGame();
});
document.getElementById('btn-continue').addEventListener('click', () => {
  G.audio.unlock();
  G.audio.click();
  continueGame();
});
document.getElementById('btn-resume').addEventListener('click', () => {
  G.audio.click();
  G.state = 'playing';
  showOverlay(null);
});
document.getElementById('btn-save').addEventListener('click', () => {
  G.saveGame();
  G.audio.click();
  document.getElementById('pause-info').textContent = 'Saved.';
});
document.getElementById('btn-restart').addEventListener('click', () => {
  G.audio.click();
  newGame();
});
document.getElementById('btn-again').addEventListener('click', () => {
  G.audio.click();
  respawn();
});
canvas.addEventListener('mousedown', () => G.audio.unlock());
document.getElementById('btn-continue').disabled = !loadSave();

// --- screenshot presets: ?shot=cover|mission|chase|night ---
function applyShot(shot) {
  G.shot = shot;
  const p = G.player;
  showOverlay(null);
  G.state = 'playing';
  if (shot === 'cover') {
    G.dayTime = 18.2;
    startMission(G, 0);
    putPlayerInCar(G, 1920, 1680, 0, 'sports', '#d8202e');
    spawnNearbyTraffic(G, 6);
    clearCorridor(G, 1850, 2950, 1600, 1780);
  } else if (shot === 'mission') {
    G.dayTime = 10.0;
    p.x = 660; p.y = 1850; p.angle = Math.PI;
    p.onFoot = true; p.car = null;
    G.camera.x = p.x; G.camera.y = p.y;
    startMission(G, 0);
    spawnNearbyTraffic(G, 2);
  } else if (shot === 'chase') {
    G.dayTime = 15.0;
    putPlayerInCar(G, 2100, 1680, 0, 'sports', '#d8202e');
    G.wanted.stars = 3;
    startMission(G, 1);
    // Pre-place three police cars in pursuit so the shot shows the chase.
    for (const [dx, dy] of [[-260, -120], [-200, 140], [240, -160]]) {
      const car = { x: p.x + dx, y: p.y + dy };
      G.police.cars.push(Object.assign(
        { kind: 'police', model: 'police', color: '#1a2f4a', angle: 0, speed: 300, maxSpeed: 570, accel: 390, turn: 2.9, len: 48, wid: 22, owned: false, driver: null, brakeLight: false, crashed: false, skid: false, bustTimer: 0, ix: 4, iy: 3, dir: 0, tx: p.x, ty: p.y, id: 'shot' + dx },
        car,
      ));
    }
    spawnNearbyTraffic(G, 4);
  } else if (shot === 'night') {
    G.dayTime = 23.0;
    putPlayerInCar(G, 720, 1850, Math.PI / 2, 'sedan', '#2e5fa3');
    startMission(G, 3);
    spawnNearbyTraffic(G, 3);
    clearCorridor(G, 640, 800, 1850, 2950);
  }
}

// Remove traffic and pedestrians from a rectangle (the player's path in a shot),
// so the shot's car drives cleanly instead of piling into crossing traffic.
function clearCorridor(G, x0, x1, y0, y1) {
  const inside = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  G.traffic.cars = G.traffic.cars.filter((c) => c.kind === 'player' || !inside(c.x, c.y));
  G.traffic.peds = G.traffic.peds.filter((p) => !inside(p.x, p.y));
}

function putPlayerInCar(G, x, y, angle, model, color) {
  const p = G.player;
  const car = createCar(x, y, angle, model, color, 'player');
  car.speed = 120;
  car.owned = true;
  G.traffic.cars.push(car);
  p.car = car;
  p.onFoot = false;
  p.x = x; p.y = y; p.angle = angle;
  G.camera.x = x; G.camera.y = y;
}

function spawnNearbyTraffic(G, n) {
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 200 + Math.random() * 500;
    const pt = G.world.nearestIntersection(G.player.x + Math.cos(a) * r, G.player.y + Math.sin(a) * r);
    const d = Math.floor(Math.random() * 4);
    const [dx, dy] = dirs[d];
    const car = createCar(
      pt.x, pt.y, Math.atan2(dy, dx),
      ['sedan', 'hatch', 'van'][i % 3], ['#c23b2e', '#2e5fa3', '#e8e8e8'][i % 3], 'traffic',
    );
    car.speed = 150;
    car.ix = streetIndex(pt.x);
    car.iy = streetIndex(pt.y);
    car.dir = d;
    const nx = car.ix + dx, ny = car.iy + dy;
    if (nx >= 0 && nx <= 7 && ny >= 0 && ny <= 7) {
      const lp = lanePoint(nx, ny, d);
      car.tx = lp.x; car.ty = lp.y;
    } else {
      car.tx = pt.x + dx * 480; car.ty = pt.y + dy * 480;
    }
    G.traffic.cars.push(car);
  }
}

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
let last = performance.now();
if (shot) {
  applyShot(shot);
} else {
  showOverlay('menu');
}
requestAnimationFrame(frame);
