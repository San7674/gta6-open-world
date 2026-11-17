// Rustport itself: a deterministic rust-belt port city built from one seed.
// Streets form an 8x8 grid; blocks between them hold buildings, parks and lots.
// Districts: docks (west, by the harbor), downtown (center), industrial (east),
// suburbs (north and south), beach (the southern strip, sand and sea).
import { mulberry32, pick, range, rangeInt, clamp, pushCircleOutOfRect } from './util.js';

export const WORLD_SIZE = 3840;
export const STREETS = [240, 720, 1200, 1680, 2160, 2640, 3120, 3600];
export const STREET_HALF = 50; // asphalt half-width
export const LANE = 26; // lane offset from a street's center line

const TOWER_COLORS = ['#7d8aa0', '#8a7f74', '#6f7f8c', '#9a8a6a', '#5f7484', '#84707a'];
const HOUSE_COLORS = ['#b5764f', '#8a6f5c', '#7a8a6b', '#a08a5a', '#96605a'];
const WARE_COLORS = ['#8c7a5c', '#7a6a58', '#96705a', '#6b7a72'];
const FACT_COLORS = ['#7d7468', '#6e6a72', '#8a7a62', '#5f6b62'];

function districtOf(bx, by) {
  if (bx <= 1) return 'docks';
  if (bx >= 5) return 'industrial';
  if (by === 0 || by >= 5) return 'suburbs';
  return 'downtown';
}

export function createWorld() {
  const rng = mulberry32(1337);
  const buildings = [];
  const props = [];
  const parkedCars = [];
  const parks = [];

  const blockRect = (bx, by) => ({
    x: STREETS[bx] + STREET_HALF,
    y: STREETS[by] + STREET_HALF,
    w: 380, h: 380,
  });

  // Choose 3 park blocks (never a mission block).
  const parkKeys = new Set();
  while (parkKeys.size < 3) {
    const bx = rangeInt(rng, 1, 6), by = rangeInt(rng, 0, 6);
    if ((bx === 3 && by === 2) || (bx === 0 && by === 3) || (bx === 6 && by === 3) || (bx === 3 && by === 5)) continue;
    parkKeys.add(bx + ',' + by);
  }

  for (let bx = 0; bx < 7; bx++) {
    for (let by = 0; by < 7; by++) {
      const b = blockRect(bx, by);
      const district = districtOf(bx, by);
      if (parkKeys.has(bx + ',' + by)) {
        parks.push({ ...b, district });
        for (let i = 0; i < 7; i++) {
          props.push({ kind: 'tree', x: b.x + 30 + rng() * 320, y: b.y + 30 + rng() * 320, r: 12 + rng() * 8 });
        }
        props.push({ kind: 'bench', x: b.x + 190, y: b.y + 190 });
        continue;
      }
      if (district === 'downtown') {
        const two = rng() < 0.45;
        if (two) {
          buildings.push({ x: b.x + 20, y: b.y + 30, w: 150, h: 320, kind: 'tower', color: pick(rng, TOWER_COLORS), floors: rangeInt(rng, 4, 9) });
          buildings.push({ x: b.x + 210, y: b.y + 30, w: 150, h: 320, kind: 'tower', color: pick(rng, TOWER_COLORS), floors: rangeInt(rng, 3, 8) });
        } else {
          buildings.push({ x: b.x + 40, y: b.y + 40, w: 300, h: 300, kind: 'tower', color: pick(rng, TOWER_COLORS), floors: rangeInt(rng, 5, 10) });
        }
      } else if (district === 'suburbs') {
        const n = rangeInt(rng, 2, 4);
        for (let i = 0; i < n; i++) {
          const w = rangeInt(rng, 70, 120), h = rangeInt(rng, 60, 100);
          buildings.push({
            x: b.x + 25 + rng() * (330 - w), y: b.y + 25 + rng() * (330 - h),
            w, h, kind: 'house', color: pick(rng, HOUSE_COLORS), floors: 1,
          });
        }
        for (let i = 0; i < 5; i++) {
          props.push({ kind: 'tree', x: b.x + 30 + rng() * 320, y: b.y + 30 + rng() * 320, r: 10 + rng() * 8 });
        }
      } else if (district === 'industrial') {
        buildings.push({ x: b.x + 30, y: b.y + 40, w: rangeInt(rng, 200, 300), h: rangeInt(rng, 130, 200), kind: 'factory', color: pick(rng, FACT_COLORS), floors: 2 });
        for (let i = 0; i < rangeInt(rng, 1, 3); i++) {
          props.push({ kind: 'silo', x: b.x + 60 + rng() * 260, y: b.y + 240 + rng() * 100, r: 16 + rng() * 8 });
        }
        for (let i = 0; i < rangeInt(rng, 2, 4); i++) {
          props.push({ kind: 'container', x: b.x + 30 + rng() * 280, y: b.y + 260 + rng() * 80, w: 62, h: 26, color: pick(rng, ['#a34d2e', '#2e6b8a', '#7a8a2e', '#8a2e5a']) });
        }
      } else { // docks
        buildings.push({ x: b.x + 30, y: b.y + 40, w: rangeInt(rng, 240, 310), h: rangeInt(rng, 140, 190), kind: 'warehouse', color: pick(rng, WARE_COLORS), floors: 1 });
        for (let i = 0; i < rangeInt(rng, 3, 5); i++) {
          props.push({ kind: 'container', x: b.x + 25 + rng() * 280, y: b.y + 250 + rng() * 90, w: 62, h: 26, color: pick(rng, ['#a34d2e', '#2e6b8a', '#7a8a2e', '#8a2e5a', '#5a7a8a']) });
        }
        for (let i = 0; i < 3; i++) {
          props.push({ kind: 'crate', x: b.x + 40 + rng() * 280, y: b.y + 230 + rng() * 110, s: 18 + rng() * 10 });
        }
      }
      // A few blocks get a small parking lot with stealable cars.
      if (rng() < 0.25) {
        const models = ['sedan', 'sedan', 'van', 'hatch'];
        const n = rangeInt(rng, 1, 2);
        for (let i = 0; i < n; i++) {
          parkedCars.push({
            x: b.x + 60 + rng() * 260, y: b.y + 300 + rng() * 50,
            angle: rng() < 0.5 ? 0 : Math.PI, model: pick(rng, models),
            color: pick(rng, ['#c23b2e', '#2e5fa3', '#d8c33a', '#e8e8e8', '#222831', '#3a7a4d', '#c26a1e', '#7a3aa0']),
          });
        }
      }
    }
  }

  // Named places the story and the HUD refer to.
  const places = {
    garage: { name: "Mara's Garage", x: 1680, y: 1300, district: 'downtown' },
    warehouse: { name: 'Dock Warehouse 7', x: 480, y: 1740, district: 'docks' },
    chopshop: { name: 'Chop Shop', x: 3120, y: 1740, district: 'industrial' },
    hideout: { name: "Rook's Hideout", x: 1680, y: 2700, district: 'suburbs' },
    hospital: { name: 'Rustport General', x: 2160, y: 820, district: 'downtown' },
    policeHQ: { name: 'RPD Central', x: 1200, y: 1740, district: 'downtown' },
    ember: { name: 'Ember GT', x: 2220, y: 1150, district: 'downtown' },
    crates: { name: 'Dock Crates', x: 330, y: 1850, district: 'docks' },
  };

  // The Ember GT: a sports car parked downtown, waiting to be stolen (mission 2).
  parkedCars.push({ x: places.ember.x, y: places.ember.y, angle: Math.PI / 2, model: 'sports', color: '#d8202e', special: 'ember' });

  // Piers over the harbor (walkable decks; the water around them is solid).
  const piers = [
    { x: 120, y: 700, w: 120, h: 240 },
    { x: 120, y: 1700, w: 120, h: 260 },
    { x: 120, y: 2700, w: 120, h: 240 },
  ];
  const water = [
    { x: 0, y: 0, w: 180, h: WORLD_SIZE },      // harbor channel
    { x: 0, y: 3740, w: WORLD_SIZE, h: 100 },   // sea, south
  ];
  const sand = { x: 0, y: 3650, w: WORLD_SIZE, h: 90 };

  const solids = buildings.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  for (const w of water) solids.push(w);

  const world = {
    size: WORLD_SIZE, buildings, props, parkedCars, parks, places, piers, water, sand, solids,
    rng,

    districtAt(x, y) {
      if (y >= 3650) return 'beach';
      if (x < 180) return 'harbor';
      const bx = clamp(Math.floor((x - 240) / 480), 0, 6);
      const by = clamp(Math.floor((y - 240) / 480), 0, 6);
      return districtOf(bx, by);
    },

    onPier(x, y) { return piers.some((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h); },

    isWater(x, y) {
      if (!water.some((w) => x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h)) return false;
      return !this.onPier(x, y);
    },

    isRoad(x, y) {
      const onH = STREETS.some((sy) => Math.abs(y - sy) <= STREET_HALF);
      const onV = STREETS.some((sx) => Math.abs(x - sx) <= STREET_HALF);
      return onH || onV;
    },

    // Nearest intersection point to (x, y).
    nearestIntersection(x, y) {
      let bx = STREETS[0], by = STREETS[0];
      for (const s of STREETS) { if (Math.abs(x - s) < Math.abs(x - bx)) bx = s; if (Math.abs(y - s) < Math.abs(y - by)) by = s; }
      return { x: bx, y: by };
    },

    // Push a circle out of every solid it overlaps. Returns true when it moved.
    resolveCircle(pos, r) {
      let moved = false;
      for (let pass = 0; pass < 2; pass++) {
        for (const s of solids) {
          if (pushCircleOutOfRect(pos, r, s)) moved = true;
        }
      }
      // Keep inside the world.
      pos.x = clamp(pos.x, r, WORLD_SIZE - r);
      pos.y = clamp(pos.y, r, WORLD_SIZE - r);
      return moved;
    },

    hitsSolid(x, y, r) {
      for (const s of solids) {
        const nx = clamp(x, s.x, s.x + s.w), ny = clamp(y, s.y, s.y + s.h);
        const dx = x - nx, dy = y - ny;
        if (dx * dx + dy * dy < r * r) return true;
      }
      return false;
    },

    // A random point on a street, away from the player's start, for spawning traffic.
    randomStreetPoint(rngFn) {
      const horizontal = rngFn() < 0.5;
      const s = pick(rngFn, STREETS);
      const t = 100 + rngFn() * (WORLD_SIZE - 200);
      return horizontal ? { x: t, y: s } : { x: s, y: t };
    },
  };
  return world;
}
