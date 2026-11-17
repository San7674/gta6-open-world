// The HUD: wanted stars, health, money, minimap, mission objective, toasts,
// the off-screen waypoint arrow — and the menu / pause / end overlays (DOM).
import { clamp, dist, lerp } from './util.js';
import { MISSION_LIST } from './missions.js';

const MINIMAP = 190;

function drawStar(ctx, x, y, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? '#ffd23a' : 'rgba(20,22,30,0.7)';
  ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke();
}

function drawMinimap(G, ctx, x, y) {
  const s = MINIMAP / G.world.size;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, MINIMAP, MINIMAP);
  ctx.clip();
  ctx.fillStyle = '#20261f';
  ctx.fillRect(x, y, MINIMAP, MINIMAP);
  // Water.
  ctx.fillStyle = '#2e6b8a';
  for (const w of G.world.water) ctx.fillRect(x + w.x * s, y + w.y * s, w.w * s, w.h * s);
  // Parks.
  ctx.fillStyle = '#3f6b35';
  for (const pk of G.world.parks) ctx.fillRect(x + pk.x * s, y + pk.y * s, pk.w * s, pk.h * s);
  // Roads.
  ctx.strokeStyle = '#4a4f58';
  ctx.lineWidth = 4;
  for (const sx of [240, 720, 1200, 1680, 2160, 2640, 3120, 3600]) {
    ctx.beginPath(); ctx.moveTo(x + sx * s, y); ctx.lineTo(x + sx * s, y + MINIMAP); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + sx * s); ctx.lineTo(x + MINIMAP, y + sx * s); ctx.stroke();
  }
  // Buildings.
  ctx.fillStyle = '#8a8f98';
  for (const b of G.world.buildings) {
    ctx.fillRect(x + b.x * s, y + b.y * s, Math.max(1, b.w * s), Math.max(1, b.h * s));
  }
  // Coins.
  ctx.fillStyle = '#ffd23a';
  for (const c of G.missions.coins) {
    if (!c.taken) ctx.fillRect(x + c.x * s - 1, y + c.y * s - 1, 2, 2);
  }
  // Fare.
  if (G.missions.fare) {
    const f = G.missions.fare;
    ctx.fillStyle = '#3ad83a';
    const fx = f.stage === 'pickup' ? f.x : f.destX;
    const fy = f.stage === 'pickup' ? f.y : f.destY;
    ctx.beginPath(); ctx.arc(x + fx * s, y + fy * s, 4, 0, Math.PI * 2); ctx.fill();
  }
  // Mission target.
  const t = G.missions.target;
  if (t && !t.self) {
    const pulse = 3 + Math.sin(G.time * 5) * 1.5;
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath(); ctx.arc(x + t.x * s, y + t.y * s, pulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.stroke();
  }
  // Police.
  ctx.fillStyle = '#3a7ad8';
  for (const c of G.police.cars) {
    ctx.beginPath(); ctx.arc(x + c.x * s, y + c.y * s, 3, 0, Math.PI * 2); ctx.fill();
  }
  for (const c of G.police.foot) {
    ctx.beginPath(); ctx.arc(x + c.x * s, y + c.y * s, 2, 0, Math.PI * 2); ctx.fill();
  }
  // Player arrow.
  const px = x + G.player.x * s, py = y + G.player.y * s;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(G.player.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
  ctx.restore();
  // Frame.
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
  ctx.strokeRect(x, y, MINIMAP, MINIMAP);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('RUSTPORT', x + 6, y + 15);
}

export function drawHUD(G, ctx, W, H) {
  const p = G.player;
  ctx.textBaseline = 'alphabetic';

  // --- top-left: wanted, health, money ---
  ctx.textAlign = 'left';
  for (let i = 0; i < 5; i++) drawStar(ctx, 28 + i * 30, 30, 12, i < G.wanted.stars);
  // Health bar.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(14, 52, 204, 18);
  ctx.fillStyle = p.health > 50 ? '#3ad83a' : p.health > 25 ? '#ffb340' : '#e83a2e';
  ctx.fillRect(16, 54, 200 * clamp(p.health / 100, 0, 1), 14);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(14, 52, 204, 18);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
  ctx.fillText(`$${p.money}`, 16, 96);
  ctx.font = '13px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(`Coins ${G.missions.coinsGot}/20`, 16, 116);

  // --- top-right: minimap + clock ---
  drawMinimap(G, ctx, W - MINIMAP - 14, 14);
  const hh = Math.floor(G.dayTime) % 24;
  const mm = Math.floor((G.dayTime % 1) * 60);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
  ctx.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  ·  Day ${G.day}`, W - 16, MINIMAP + 36);
  ctx.font = '13px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(G.world.districtAt(p.x, p.y).toUpperCase(), W - 16, MINIMAP + 56);

  // --- mission timers (Night Run / getaway) ---
  const m = G.missions;
  if (m.active) {
    const mission = MISSION_LIST[m.current];
    let timerText = '';
    if (mission.timeLimit) timerText = `⏱ ${Math.max(0, Math.ceil(m.missionTimer))}s`;
    if (mission.steps[m.step] && mission.steps[m.step].type === 'evade') {
      timerText = `⏱ ${Math.max(0, Math.ceil(m.stepTimer))}s`;
    }
    if (timerText) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = m.missionTimer < 30 || m.stepTimer < 10 ? '#ff5a3a' : '#fff';
      ctx.fillText(timerText, W / 2, 44);
    }
  }

  // --- bottom-left: mission objective ---
  ctx.textAlign = 'left';
  if (m.active && m.target) {
    const mission = MISSION_LIST[m.current];
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const label = m.target.label;
    ctx.fillRect(14, H - 66, Math.min(560, 24 + ctx.measureText(label).width), 52);
    ctx.fillStyle = '#ffb340';
    ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`JOB ${mission.id}/5 — ${mission.title}`, 24, H - 46);
    ctx.fillStyle = '#fff';
    ctx.font = '14px "Segoe UI", Arial, sans-serif';
    const d = m.target.self ? '' : `  ·  ${Math.round(dist(p.x, p.y, m.target.x, m.target.y))}m`;
    ctx.fillText(label + d, 24, H - 26);
  } else if (!m.active && m.current < MISSION_LIST.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '14px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Next job coming — Mara will call.', 16, H - 30);
  } else if (m.current >= MISSION_LIST.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '14px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Story complete — free roam. Find coins, run fares, stay out of trouble.', 16, H - 30);
  }

  // --- bottom-right: speed ---
  if (!p.onFoot && p.car) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`${Math.round(Math.abs(p.car.speed) * 0.12)} mph`, W - 16, H - 24);
    ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(p.car.model.toUpperCase(), W - 16, H - 46);
  }

  // --- toasts ---
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
  let ty = 84;
  for (const toast of G.toasts) {
    const alpha = clamp(toast.life / 1, 0, 1);
    ctx.globalAlpha = alpha;
    const w = ctx.measureText(toast.text).width + 28;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(W / 2 - w / 2, ty - 20, w, 28);
    ctx.fillStyle = '#fff';
    ctx.fillText(toast.text, W / 2, ty);
    ctx.globalAlpha = 1;
    ty += 34;
  }

  // --- contextual hint ---
  let hint = '';
  if (p.onFoot) {
    const near = G.traffic.cars.some((c) => c.kind !== 'police' && c.kind !== 'player' && dist(p.x, p.y, c.x, c.y) < 68);
    if (near) hint = 'E — Get in the car';
  } else if (m.fare && m.fare.stage === 'pickup' && dist(p.x, p.y, m.fare.x, m.fare.y) < 60) {
    hint = 'T — Pick up the fare';
  } else if (!p.onFoot) {
    hint = 'E — Get out   ·   Space — Handbrake';
  }
  if (hint) {
    ctx.textAlign = 'center';
    ctx.font = '14px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(hint, W / 2, H - 14);
  }

  // --- off-screen waypoint arrow ---
  const t = m.target;
  if (t && !t.self) {
    const cam = G.camera;
    const sx = (t.x - cam.x) * cam.zoom + W / 2;
    const sy = (t.y - cam.y) * cam.zoom + H / 2;
    if (sx < 0 || sx > W || sy < 0 || sy > H) {
      const ang = Math.atan2(sy - H / 2, sx - W / 2);
      const ax = W / 2 + Math.cos(ang) * (Math.min(W, H) / 2 - 70);
      const ay = H / 2 + Math.sin(ang) * (Math.min(W, H) / 2 - 70);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -11); ctx.lineTo(-10, 11); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#ffd23a';
      ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(dist(p.x, p.y, t.x, t.y))}m`, ax, ay + 28);
    }
  }

  // --- low-health vignette ---
  if (p.health < 30) {
    const a = 0.25 + Math.sin(G.time * 6) * 0.12;
    ctx.strokeStyle = `rgba(232,58,46,${a})`;
    ctx.lineWidth = 26;
    ctx.strokeRect(0, 0, W, H);
  }
  // --- damage flash ---
  if (G.hurtFlash > 0) {
    ctx.fillStyle = `rgba(232,58,46,${clamp(G.hurtFlash, 0, 0.35)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// --- DOM overlays ---
export function showOverlay(id) {
  for (const el of document.querySelectorAll('.overlay')) el.classList.add('hidden');
  if (id) document.getElementById(id).classList.remove('hidden');
}

export function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}
