// Missions and side work: Mara Kessler's five-job story, taxi fares and rust coins.
import { mulberry32, dist, rangeInt } from './util.js';
import { STREETS } from './world.js';

export const MISSION_LIST = [
  {
    id: 1, title: 'First Shift', reward: 150,
    briefing: "Mara Kessler: pick up the crate at Dock Warehouse 7, then bring it to my garage. Don't be late.",
    steps: [
      { type: 'goto', x: 330, y: 1850, label: 'Pick up the crate at Dock Warehouse 7', radius: 60 },
      { type: 'goto', x: 1680, y: 1300, label: "Deliver the crate to Mara's Garage", radius: 70 },
    ],
  },
  {
    id: 2, title: 'Hot Wheels', reward: 300,
    briefing: 'An Ember GT is parked downtown, cherry red. Take it. Bring it to the Chop Shop — no questions.',
    steps: [
      { type: 'steal', special: 'ember', label: 'Steal the Ember GT downtown' },
      { type: 'goto', x: 3120, y: 1740, label: 'Deliver the Ember to the Chop Shop', radius: 80, needCar: true },
    ],
  },
  {
    id: 3, title: 'The Getaway', reward: 400,
    briefing: 'The deal went bad. RPD is rolling in. Lose them and stay alive for 60 seconds.',
    steps: [
      { type: 'evade', seconds: 60, stars: 3, label: 'Lose the cops — survive 60 seconds' },
    ],
  },
  {
    id: 4, title: 'Night Run', reward: 600,
    briefing: 'Three drops, one night. Docks, northside, midtown, east side. Four minutes. The city sleeps — use it.',
    timeLimit: 240,
    steps: [
      { type: 'goto', x: 330, y: 1850, label: 'Pick up the crates at the docks', radius: 60 },
      { type: 'goto', x: 2400, y: 700, label: 'Drop 1 — Northside', radius: 70 },
      { type: 'goto', x: 2400, y: 2400, label: 'Drop 2 — Midtown', radius: 70 },
      { type: 'goto', x: 3200, y: 2900, label: 'Drop 3 — Eastside', radius: 70 },
    ],
  },
  {
    id: 5, title: 'The Double-Cross', reward: 1000,
    briefing: "Mara sold you out. The crew's money is in Warehouse 7. Take it back, then get to your hideout.",
    steps: [
      { type: 'goto', x: 480, y: 1740, label: 'Get the money from Warehouse 7', radius: 70 },
      { type: 'goto', x: 1680, y: 2700, label: 'Escape to your hideout', radius: 80 },
    ],
  },
];

export function createMissions() {
  const rng = mulberry32(777);
  const coins = [];
  for (let i = 0; i < 20; i++) {
    const horizontal = rng() < 0.5;
    const s = STREETS[Math.floor(rng() * STREETS.length)];
    const t = 200 + rng() * 3440;
    coins.push({
      x: horizontal ? t : s + (rng() < 0.5 ? -64 : 64),
      y: horizontal ? s + (rng() < 0.5 ? -64 : 64) : t,
      taken: false,
    });
  }
  return {
    current: 0, step: 0, active: false,
    timer: 0, stepTimer: 0, missionTimer: 0,
    target: null, done: [],
    coins, coinsGot: 0,
    fare: null, fareCooldown: 12,
    nextDelay: 0,
  };
}

export function startMission(G, idx) {
  const m = G.missions;
  if (idx >= MISSION_LIST.length) return;
  m.current = idx; m.step = 0; m.active = true;
  m.missionTimer = MISSION_LIST[idx].timeLimit || 0;
  const mission = MISSION_LIST[idx];
  if (mission.id === 4) G.dayTime = 22.0; // Night Run happens at night.
  G.addToast(`Job ${mission.id}: ${mission.title}`);
  G.addToast(mission.briefing);
  G.audio.phone();
}

function stepTarget(G) {
  const m = G.missions;
  const mission = MISSION_LIST[m.current];
  if (!mission || !m.active) return null;
  const step = mission.steps[m.step];
  if (!step) return null;
  if (step.type === 'goto') return { x: step.x, y: step.y, label: step.label };
  if (step.type === 'steal') {
    const ember = G.world.places.ember;
    return { x: ember.x, y: ember.y, label: step.label };
  }
  if (step.type === 'evade') return { x: G.player.x, y: G.player.y, label: step.label, self: true };
  return null;
}

export function updateMissions(G, dt) {
  const m = G.missions;
  const p = G.player;

  // Auto-start the next job a few seconds after the last one ends.
  if (!m.active && m.current < MISSION_LIST.length && m.nextDelay > 0) {
    m.nextDelay -= dt;
    if (m.nextDelay <= 0) startMission(G, m.current);
  }

  if (m.active) {
    const mission = MISSION_LIST[m.current];
    const step = mission.steps[m.step];
    m.target = stepTarget(G);

    // Night Run clock.
    if (mission.timeLimit) {
      m.missionTimer -= dt;
      if (m.missionTimer <= 0) {
        G.addToast("Too slow — Mara's not happy. Run it again.");
        startMission(G, m.current); // retry the same job from step 0
        return;
      }
    }

    let done = false;
    if (step.type === 'goto') {
      if (dist(p.x, p.y, step.x, step.y) < (step.radius || 60)) {
        if (step.needCar && p.onFoot) {
          // Must arrive in a car: hold the step.
        } else done = true;
      }
    } else if (step.type === 'steal') {
      if (p.car && p.car.special === 'ember') done = true;
    } else if (step.type === 'evade') {
      if (m.stepTimer === 0) {
        G.wanted.stars = step.stars;
        G.wanted.calmTimer = 0;
        m.stepTimer = step.seconds;
      }
      m.stepTimer -= dt;
      if (m.stepTimer <= 0 || G.wanted.stars === 0) done = true;
    }

    if (done) {
      G.audio.pickup();
      m.step++;
      m.stepTimer = 0;
      if (m.step >= mission.steps.length) {
        // Job complete.
        p.money += mission.reward;
        m.done.push(mission.id);
        m.active = false;
        m.target = null;
        G.addToast(`Job done: ${mission.title} — +$${mission.reward}`);
        G.audio.mission();
        G.saveGame();
        if (m.current + 1 >= MISSION_LIST.length) {
          G.addToast('Story complete — Rustport is yours. Free roam.');
        } else {
          m.current++;
          m.nextDelay = 4;
        }
      }
    }
  }

  // --- rust coins ---
  for (const coin of m.coins) {
    if (coin.taken) continue;
    if (dist(p.x, p.y, coin.x, coin.y) < 32) {
      coin.taken = true;
      m.coinsGot++;
      p.money += 50;
      G.audio.coin();
      if (m.coinsGot % 5 === 0) G.addToast(`Rust coins: ${m.coinsGot}/20 — +$50`);
    }
  }

  // --- taxi fares ---
  m.fareCooldown -= dt;
  if (!m.fare && m.fareCooldown <= 0 && !p.onFoot) {
    const a = Math.random() * Math.PI * 2;
    const r = 260 + Math.random() * 260;
    const s = STREETS[Math.floor(Math.random() * STREETS.length)];
    const horizontal = Math.random() < 0.5;
    const fx = horizontal ? p.x + Math.cos(a) * r : s;
    const fy = horizontal ? s : p.y + Math.sin(a) * r;
    m.fare = {
      stage: 'pickup', x: fx, y: fy, destX: 0, destY: 0,
      reward: 0, timer: 30,
    };
    m.fareCooldown = 999; // one fare at a time; reset on resolve
  }
  if (m.fare) {
    const f = m.fare;
    f.timer -= dt;
    if (f.timer <= 0) {
      m.fare = null;
      m.fareCooldown = 20;
      G.addToast('Fare left — too slow');
    } else if (f.stage === 'pickup') {
      if (dist(p.x, p.y, f.x, f.y) < 55 && G.input.pressed('taxi')) {
        const s = STREETS[Math.floor(Math.random() * STREETS.length)];
        const horizontal = Math.random() < 0.5;
        const t = 300 + Math.random() * 3200;
        f.destX = horizontal ? t : s;
        f.destY = horizontal ? s : t;
        f.stage = 'dropoff';
        f.timer = 95;
        f.reward = 25 + rangeInt(Math.random, 0, 35);
        G.audio.pickup();
        G.addToast('Passenger in — take them to the marker');
      }
    } else if (dist(p.x, p.y, f.destX, f.destY) < 60) {
      p.money += f.reward;
      G.audio.coin();
      G.addToast(`Fare paid — +$${f.reward}`);
      m.fare = null;
      m.fareCooldown = 18;
    }
  }
}
