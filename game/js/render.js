// Rendering: the city, its cars and people, particles, and the day/night light.
// Everything is drawn on one canvas; only the visible rectangle is painted.
import { clamp, lerp, TAU } from './util.js';
import { STREETS, STREET_HALF, WORLD_SIZE } from './world.js';
import { MODELS } from './cars.js';

let lightCanvas = null;

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCarShape(ctx, car, isPlayer) {
  const m = MODELS[car.model] || MODELS.sedan;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  if (isPlayer) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    roundedRect(ctx, -m.len / 2 - 5, -m.wid / 2 - 5, m.len + 10, m.wid + 10, 10);
    ctx.fill();
  }
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundedRect(ctx, -m.len / 2 + 2, -m.wid / 2 + 3, m.len, m.wid, 7);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.color;
  roundedRect(ctx, -m.len / 2, -m.wid / 2, m.len, m.wid, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Roof + windshield.
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  roundedRect(ctx, -m.len * 0.18, -m.wid / 2 + 3, m.len * 0.36, m.wid - 6, 4);
  ctx.fill();
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(m.len * 0.22, -m.wid / 2 + 3, 5, m.wid - 6);
  ctx.fillRect(-m.len * 0.32, -m.wid / 2 + 3, 4, m.wid - 6);
  // Headlights / taillights.
  ctx.fillStyle = '#ffe9a0';
  ctx.fillRect(m.len / 2 - 2, -m.wid / 2 + 2, 2, 4);
  ctx.fillRect(m.len / 2 - 2, m.wid / 2 - 6, 2, 4);
  ctx.fillStyle = '#e83a2e';
  ctx.fillRect(-m.len / 2, -m.wid / 2 + 2, 2, 4);
  ctx.fillRect(-m.len / 2, m.wid / 2 - 6, 2, 4);
  if (car.model === 'police') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-6, -m.wid / 2 + 2, 12, m.wid - 4);
    const flash = Math.floor(performance.now() / 300) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2e2e' : '#2e6bff';
    ctx.fillRect(-4, -m.wid / 2 - 1, 8, 5);
    ctx.fillStyle = flash ? '#2e6bff' : '#ff2e2e';
    ctx.fillRect(-4, m.wid / 2 - 4, 8, 5);
  }
  if (car.model === 'taxi') {
    ctx.fillStyle = '#222';
    ctx.font = 'bold 7px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, -m.wid / 2 - 3);
  }
  ctx.restore();
}

function drawPerson(ctx, x, y, angle, color, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (opts.down) {
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d8a077';
    ctx.beginPath(); ctx.arc(12, 0, 5, 0, TAU); ctx.fill();
    ctx.restore();
    return;
  }
  const bob = opts.walkPhase ? Math.sin(opts.walkPhase) * 1.5 : 0;
  ctx.rotate(angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 2, 9, 6, 0, 0, TAU); ctx.fill();
  // Body.
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, bob * 0.3, 8, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();
  // Head.
  ctx.fillStyle = opts.skin || '#d8a077';
  ctx.beginPath(); ctx.arc(3, bob * 0.3, 5, 0, TAU); ctx.fill();
  // Facing nub.
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(8, bob * 0.3, 2, 0, TAU); ctx.fill();
  if (opts.punch) {
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(20, 0); ctx.stroke();
  }
  ctx.restore();
}

function darknessAt(dayTime) {
  // 0 = noon, 1 = deep night.
  const h = dayTime % 24;
  if (h >= 6 && h < 17.5) return 0;
  if (h >= 17.5 && h < 19.5) return lerp(0, 0.3, (h - 17.5) / 2);
  if (h >= 19.5 && h < 21) return lerp(0.3, 0.55, (h - 19.5) / 1.5);
  if (h >= 21 || h < 5) return 0.55;
  if (h >= 5 && h < 6) return lerp(0.55, 0, (h - 5) / 1);
  return 0;
}

export function drawWorld(G, ctx, W, H) {
  const world = G.world;
  const cam = G.camera;
  const vx0 = cam.x - W / 2 / cam.zoom, vy0 = cam.y - H / 2 / cam.zoom;
  const vx1 = cam.x + W / 2 / cam.zoom, vy1 = cam.y + H / 2 / cam.zoom;
  const inView = (x, y, m = 80) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;

  ctx.save();
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(W / 2 / cam.zoom - cam.x, H / 2 / cam.zoom - cam.y);

  // --- ground ---
  ctx.fillStyle = '#5d8a4a';
  ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  // District ground tints.
  ctx.fillStyle = '#8a8d90'; // docks concrete
  ctx.fillRect(180, 0, 1070, WORLD_SIZE);
  ctx.fillStyle = '#7a7d72'; // industrial
  ctx.fillRect(2590, 0, 1250, WORLD_SIZE);
  ctx.fillStyle = '#c9b183'; // beach sand
  ctx.fillRect(0, 3650, WORLD_SIZE, 90);
  // Water.
  ctx.fillStyle = '#2e6b8a';
  for (const w of world.water) ctx.fillRect(w.x, w.y, w.w, w.h);
  // Water shimmer lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  for (let y = 120; y < WORLD_SIZE; y += 180) {
    if (y > vy0 && y < vy1) {
      ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(150, y); ctx.stroke();
    }
  }
  // Piers.
  for (const p of world.piers) {
    ctx.fillStyle = '#8a6a42';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = '#6b4f30'; ctx.lineWidth = 2;
    for (let y = p.y + 20; y < p.y + p.h; y += 40) {
      ctx.beginPath(); ctx.moveTo(p.x, y); ctx.lineTo(p.x + p.w, y); ctx.stroke();
    }
  }
  // Parks.
  for (const pk of world.parks) {
    ctx.fillStyle = '#4a7a3d';
    ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
  }

  // --- roads: sidewalk, then asphalt, then dashes ---
  for (const sy of STREETS) {
    ctx.fillStyle = '#b9bcc2';
    ctx.fillRect(0, sy - STREET_HALF - 14, WORLD_SIZE, (STREET_HALF + 14) * 2);
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(0, sy - STREET_HALF, WORLD_SIZE, STREET_HALF * 2);
    ctx.fillStyle = '#c9a13a';
    for (let x = 0; x < WORLD_SIZE; x += 90) {
      if (x > vx0 - 90 && x < vx1) ctx.fillRect(x, sy - 2, 44, 4);
    }
  }
  for (const sx of STREETS) {
    ctx.fillStyle = '#b9bcc2';
    ctx.fillRect(sx - STREET_HALF - 14, 0, (STREET_HALF + 14) * 2, WORLD_SIZE);
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(sx - STREET_HALF, 0, STREET_HALF * 2, WORLD_SIZE);
    ctx.fillStyle = '#c9a13a';
    for (let y = 0; y < WORLD_SIZE; y += 90) {
      if (y > vy0 - 90 && y < vy1) ctx.fillRect(sx - 2, y, 4, 44);
    }
  }

  // --- district labels ---
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.font = 'bold 52px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  const labels = [
    ['RUSTPORT HARBOR', 700, 2600], ['DOWNTOWN', 1920, 1500],
    ['EASTWORKS', 3100, 1500], ['NORTHSIDE', 1920, 480], ['SOUTHSIDE BEACH', 1920, 3560],
  ];
  for (const [text, lx, ly] of labels) {
    if (inView(lx, ly, 400)) ctx.fillText(text, lx, ly);
  }

  // --- buildings ---
  for (const b of world.buildings) {
    if (!inView(b.x + b.w / 2, b.y + b.h / 2, 300)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    if (b.kind === 'tower') {
      ctx.fillStyle = 'rgba(20,30,45,0.55)';
      const cols = Math.floor(b.w / 26), rows = Math.floor(b.h / 26);
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          ctx.fillRect(b.x + 12 + cx * 26, b.y + 12 + cy * 26, 12, 14);
        }
      }
    } else if (b.kind === 'house') {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + b.w / 2 - 10, b.y + b.h - 22, 20, 22);
    } else if (b.kind === 'warehouse' || b.kind === 'factory') {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, 14);
      ctx.fillRect(b.x + 10, b.y + b.h - 24, b.w - 20, 14);
    }
  }

  // --- props ---
  for (const pr of world.props) {
    if (!inView(pr.x, pr.y, 60)) continue;
    if (pr.kind === 'tree') {
      ctx.fillStyle = '#2e5230';
      ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4a7a3d';
      ctx.beginPath(); ctx.arc(pr.x - 3, pr.y - 3, pr.r * 0.75, 0, TAU); ctx.fill();
    } else if (pr.kind === 'container') {
      ctx.fillStyle = pr.color;
      ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(pr.x, pr.y, pr.w, pr.h);
    } else if (pr.kind === 'silo') {
      ctx.fillStyle = '#9aa2ab';
      ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
    } else if (pr.kind === 'crate') {
      ctx.fillStyle = '#8a6a42';
      ctx.fillRect(pr.x - pr.s / 2, pr.y - pr.s / 2, pr.s, pr.s);
      ctx.strokeStyle = '#5f4626'; ctx.strokeRect(pr.x - pr.s / 2, pr.y - pr.s / 2, pr.s, pr.s);
    } else if (pr.kind === 'bench') {
      ctx.fillStyle = '#6b4f30';
      ctx.fillRect(pr.x - 18, pr.y - 5, 36, 10);
    }
  }
  // Street lamps (drawn at intersection corners).
  ctx.fillStyle = '#3a3f47';
  for (const sx of STREETS) {
    for (const sy of STREETS) {
      if (inView(sx, sy, 60)) {
        ctx.beginPath(); ctx.arc(sx + 58, sy + 58, 3, 0, TAU); ctx.fill();
      }
    }
  }

  // --- mission beacon + fare marker + coins ---
  const target = G.missions.target;
  if (target && !target.self && G.missions.active) {
    const pulse = 1 + Math.sin(G.time * 4) * 0.15;
    ctx.fillStyle = 'rgba(255,210,58,0.13)';
    ctx.fillRect(target.x - 26, target.y - 320, 52, 320);
    ctx.strokeStyle = '#ffd23a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(target.x, target.y, 26 * pulse, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath(); ctx.arc(target.x, target.y, 5, 0, TAU); ctx.fill();
  }
  if (G.missions.fare) {
    const f = G.missions.fare;
    const fx = f.stage === 'pickup' ? f.x : f.destX;
    const fy = f.stage === 'pickup' ? f.y : f.destY;
    ctx.strokeStyle = '#3ad83a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(fx, fy, 22 + Math.sin(G.time * 4) * 3, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#3ad83a';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('$', fx, fy + 6);
  }
  for (const c of G.missions.coins) {
    if (c.taken || !inView(c.x, c.y, 40)) continue;
    const tw = 1 + Math.sin(G.time * 5 + c.x) * 0.2;
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath(); ctx.arc(c.x, c.y, 8 * tw, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8a6a00'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#8a6a00';
    ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
    ctx.fillText('R', c.x, c.y + 3);
  }

  // --- cars ---
  for (const car of G.traffic.cars) {
    if (!inView(car.x, car.y, 80)) continue;
    drawCarShape(ctx, car, car === G.player.car);
  }
  for (const car of G.police.cars) {
    if (!inView(car.x, car.y, 80)) continue;
    drawCarShape(ctx, car, false);
  }

  // --- people ---
  for (const ped of G.traffic.peds) {
    if (!inView(ped.x, ped.y, 40)) continue;
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.color, { down: ped.down > 0, walkPhase: G.time * 8 });
  }
  for (const cop of G.police.foot) {
    if (!inView(cop.x, cop.y, 40)) continue;
    drawPerson(ctx, cop.x, cop.y, cop.angle, '#1a2f4a', { down: cop.down > 0, walkPhase: G.time * 10, skin: '#c98a5a' });
  }
  const p = G.player;
  if (p.onFoot) {
    drawPerson(ctx, p.x, p.y, p.angle, '#1f8a70', { walkPhase: p.walkPhase, punch: p.punchAnim > 0 });
  }

  // --- particles ---
  for (const pt of G.particles) {
    const a = clamp(pt.life / pt.max, 0, 1);
    if (pt.kind === 'skid') {
      ctx.fillStyle = `rgba(20,20,20,${a * 0.5})`;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    } else if (pt.kind === 'stars') {
      ctx.fillStyle = `rgba(255,210,58,${a})`;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4 + G.time * 3;
        const r = i % 2 === 0 ? pt.size : pt.size * 0.4;
        const px = pt.x + Math.cos(ang) * r, py = pt.y + Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    } else if (pt.kind === 'smoke') {
      ctx.fillStyle = `rgba(120,120,120,${a * 0.5})`;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (1.6 - a * 0.6), 0, TAU); ctx.fill();
    }
  }

  ctx.restore();

  // --- day/night lighting ---
  const dark = darknessAt(G.dayTime);
  if (dark > 0.01) {
    if (!lightCanvas) {
      lightCanvas = document.createElement('canvas');
    }
    if (lightCanvas.width !== W || lightCanvas.height !== H) {
      lightCanvas.width = W; lightCanvas.height = H;
    }
    const lctx = lightCanvas.getContext('2d');
    lctx.clearRect(0, 0, W, H);
    lctx.globalCompositeOperation = 'source-over';
    lctx.fillStyle = `rgba(8,12,40,${dark})`;
    lctx.fillRect(0, 0, W, H);
    lctx.globalCompositeOperation = 'destination-out';
    // Light around the player.
    const px = W / 2, py = H / 2;
    const grad = lctx.createRadialGradient(px, py, 40, px, py, 260);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    lctx.fillStyle = grad;
    lctx.beginPath(); lctx.arc(px, py, 260, 0, TAU); lctx.fill();
    // Headlight cone while driving.
    if (!p.onFoot && p.car) {
      const hx = px + Math.cos(p.angle) * 60, hy = py + Math.sin(p.angle) * 60;
      const cone = lctx.createRadialGradient(hx, hy, 10, hx, hy, 320);
      cone.addColorStop(0, 'rgba(255,255,255,0.8)');
      cone.addColorStop(1, 'rgba(255,255,255,0)');
      lctx.fillStyle = cone;
      lctx.beginPath(); lctx.arc(hx, hy, 320, 0, TAU); lctx.fill();
    }
    // Lamp glows near the player.
    for (const sx of STREETS) {
      for (const sy of STREETS) {
        const lx = (sx + 58 - cam.x) * cam.zoom + W / 2;
        const ly = (sy + 58 - cam.y) * cam.zoom + H / 2;
        if (lx < -60 || lx > W + 60 || ly < -60 || ly > H + 60) continue;
        const lg = lctx.createRadialGradient(lx, ly, 2, lx, ly, 70);
        lg.addColorStop(0, 'rgba(255,255,255,0.7)');
        lg.addColorStop(1, 'rgba(255,255,255,0)');
        lctx.fillStyle = lg;
        lctx.beginPath(); lctx.arc(lx, ly, 70, 0, TAU); lctx.fill();
      }
    }
    ctx.drawImage(lightCanvas, 0, 0);
  } else if (G.dayTime >= 17 && G.dayTime < 19.5) {
    // Sunset warmth.
    ctx.fillStyle = `rgba(255,110,40,${0.05 + (G.dayTime - 17) * 0.04})`;
    ctx.fillRect(0, 0, W, H);
  }
}
