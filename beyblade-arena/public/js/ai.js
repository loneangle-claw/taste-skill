// CPU opponent. It only ever writes to `me.input`, exactly like a human player,
// so nothing here can cheat the physics.

import { ARENA } from './physics.js';

const LEVELS = {
  easy:   { react: 0.34, noise: 0.55, aggression: 0.55, dashRange: 90,  skill: 0.45 },
  normal: { react: 0.18, noise: 0.30, aggression: 0.80, dashRange: 130, skill: 0.75 },
  hard:   { react: 0.08, noise: 0.12, aggression: 1.00, dashRange: 175, skill: 1.00 },
};

export function createAI(level = 'normal') {
  return { cfg: LEVELS[level] || LEVELS.normal, timer: 0, aim: { x: 0, y: 0 }, level };
}

export function aiLaunch(ai) {
  // Better CPUs charge the launcher closer to full power.
  const s = ai.cfg.skill;
  return {
    power: 0.55 + 0.45 * s * (0.75 + Math.random() * 0.25),
    aim: (Math.random() * 2 - 1) * (1 - s) * 0.8,
  };
}

export function think(ai, me, foe, dt) {
  ai.timer -= dt;
  if (ai.timer > 0) {
    me.input.x = ai.aim.x;
    me.input.y = ai.aim.y;
    return;
  }
  ai.timer = ai.cfg.react;

  const dx = foe.x - me.x;
  const dy = foe.y - me.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;

  const cx = ARENA.cx - me.x;
  const cy = ARENA.cy - me.y;
  const cd = Math.hypot(cx, cy) || 1;

  const kind = me.spec.kind;
  const losing = me.spin < foe.spin * 0.75;
  const nearRim = cd > ARENA.R * 0.72;

  let wx = 0;
  let wy = 0;

  if (kind === 'attack' || (kind === 'balance' && !losing)) {
    // Chase, but lead the target a little so the hit lands.
    const lead = 0.32 * ai.cfg.skill;
    wx = (dx + foe.vx * lead) / dist;
    wy = (dy + foe.vy * lead) / dist;
  } else if (kind === 'defense') {
    // Hold the middle; meet the attacker head-on when it commits.
    const incoming = -(foe.vx * ux + foe.vy * uy);
    wx = (cx / cd) * 0.8 + (incoming > 180 ? ux * 0.6 : 0);
    wy = (cy / cd) * 0.8 + (incoming > 180 ? uy * 0.6 : 0);
  } else {
    // Stamina / losing: sit near the centre and slide away from contact.
    const flee = dist < 190 ? 0.9 : 0.15;
    wx = (cx / cd) * 0.85 - ux * flee;
    wy = (cy / cd) * 0.85 - uy * flee;
  }

  if (nearRim) {
    // Never let the CPU drift into its own ring-out.
    wx += (cx / cd) * 1.1;
    wy += (cy / cd) * 1.1;
  }

  wx += (Math.random() * 2 - 1) * ai.cfg.noise;
  wy += (Math.random() * 2 - 1) * ai.cfg.noise;

  const m = Math.hypot(wx, wy) || 1;
  ai.aim.x = (wx / m) * ai.cfg.aggression;
  ai.aim.y = (wy / m) * ai.cfg.aggression;
  me.input.x = ai.aim.x;
  me.input.y = ai.aim.y;

  const closing = (foe.vx - me.vx) * -ux + (foe.vy - me.vy) * -uy;
  const wantsDash = kind === 'attack' || kind === 'balance' || me.spin > foe.spin * 1.3;
  if (wantsDash && me.dashCd <= 0 && dist < ai.cfg.dashRange && closing > -60 && Math.random() < ai.cfg.skill) {
    me.input.dash = true;
  }
}
