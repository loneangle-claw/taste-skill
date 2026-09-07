// Headless battle simulation. No DOM access here so it can also run under Node
// for tests and, in online play, on the host client as the authority.

export const ARENA = {
  cx: 450,
  cy: 450,
  R: 360,          // rim radius
  escapeSpeed: 100, // outward speed needed to fly out of the stadium
};

// All battle balance lives here so it can be swept by scripts/balance.mjs.
export const TUNE = {
  bowlG: 1000,        // inward pull at the rim (px/s^2)
  bowlExp: 2.0,       // shallow in the middle, steep at the wall
  precession: 0.45,   // rad/s of orbital curl caused by the spin
  steerAcc: 420,      // px/s^2 available to the player, scaled by driver grip
  dashImpulse: 250,
  dashCost: 6,
  dashCooldown: 3.2,
  roundTime: 90,
  restitution: 0.6,
  shove: 78,          // knockback the higher-attack top applies
  damage: 0.038,      // spin lost per unit of impact speed
  damageExp: 1.4,     // how sharply an attack/defense mismatch is punished
  burstGain: 0.046,
  burstDecay: 0.8,
  steerCost: 0.40,    // spin per second burned while steering
  selfOutSpeed: 400,  // you can only ring yourself out at absurd speed
  launchGrace: 1.2,   // no ring-outs while the launch dive is still playing out
  jitter: 0.16,       // contact-angle luck; keeps mirror matches from being perfectly symmetric
  spinDrag: 0.0007,   // extra spin decay per px/s of travel
};

export const POINTS = { spin: 1, ring: 2, burst: 3, timeout: 1 };

const len = (x, y) => Math.hypot(x, y);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createTop(spec, side) {
  return {
    spec,
    side,
    x: ARENA.cx, y: ARENA.cy,
    vx: 0, vy: 0,
    spin: 100,
    burst: 0,
    angle: Math.random() * Math.PI * 2,
    alive: true,
    outReason: null,
    dashCd: 0,
    hitTimer: 0,
    grace: 0,
    launched: false,
    input: { x: 0, y: 0, dash: false },
  };
}

/**
 * Put a top on the rim and fire it into the stadium.
 * @param {number} power 0..1 launcher charge
 * @param {number} aim   -1..1 shifts the entry angle (steeper = more aggressive)
 */
export function launchTop(top, power, aim = 0) {
  const side = top.side === 0 ? Math.PI * 0.82 : -Math.PI * 0.18;
  const r = ARENA.R * 0.82;
  top.x = ARENA.cx + Math.cos(side) * r;
  top.y = ARENA.cy + Math.sin(side) * r;

  const toCenter = Math.atan2(ARENA.cy - top.y, ARENA.cx - top.x);
  const curl = top.spec.spinDir * (Math.PI * 0.30 + aim * Math.PI * 0.14);
  const dir = toCenter + curl;
  const speed = 200 + 260 * clamp(power, 0, 1);

  top.vx = Math.cos(dir) * speed;
  top.vy = Math.sin(dir) * speed;
  top.spin = 82 + 18 * clamp(power, 0, 1);
  top.grace = TUNE.launchGrace;
  top.burst = 0;
  top.alive = true;
  top.outReason = null;
  top.dashCd = 0;
  top.launched = true;
}

export function createBattle(specA, specB) {
  return {
    tops: [createTop(specA, 0), createTop(specB, 1)],
    time: 0,
    timeLeft: TUNE.roundTime,
    phase: 'launch', // launch -> battle -> result
    result: null,    // { winner: 0|1|-1, reason, points }
    events: [],
  };
}

function integrate(top, dt, other) {
  const dx = top.x - ARENA.cx;
  const dy = top.y - ARENA.cy;
  const dist = len(dx, dy) || 0.0001;
  const nx = dx / dist;
  const ny = dy / dist;

  const spinFactor = clamp(top.spin / 100, 0, 1);

  // Bowl floor pulls everything back toward the middle.
  const slope = TUNE.bowlG * Math.pow(dist / ARENA.R, TUNE.bowlExp);
  let ax = -nx * slope;
  let ay = -ny * slope;

  // A spinning top does not travel straight: curl the velocity.
  const curl = top.spec.spinDir * TUNE.precession * spinFactor;
  ax += -top.vy * curl;
  ay += top.vx * curl;

  // Player / AI steering. Costs a little spin, and fades as the top slows down.
  const ix = top.input.x;
  const iy = top.input.y;
  const im = len(ix, iy);
  if (im > 0.01) {
    const s = TUNE.steerAcc * top.spec.grip * spinFactor / Math.max(1, im);
    ax += ix * s;
    ay += iy * s;
    top.spin -= TUNE.steerCost * Math.min(1, im) * dt;
  }

  // Dash: a committed lunge at the opponent.
  top.dashCd = Math.max(0, top.dashCd - dt);
  top.hitTimer = Math.max(0, top.hitTimer - dt);
  top.grace = Math.max(0, top.grace - dt);
  if (top.input.dash && top.dashCd <= 0 && top.spin > TUNE.dashCost + 2) {
    const ddx = other.x - top.x;
    const ddy = other.y - top.y;
    const d = len(ddx, ddy) || 1;
    const power = TUNE.dashImpulse * (0.6 + top.spec.attack * 0.05);
    top.vx += (ddx / d) * power;
    top.vy += (ddy / d) * power;
    top.spin -= TUNE.dashCost;
    top.dashCd = TUNE.dashCooldown;
    return { dash: { x: top.x, y: top.y, side: top.side } };
  }
  top.input.dash = false;

  top.vx += ax * dt;
  top.vy += ay * dt;

  const damp = Math.exp(-top.spec.drag * dt);
  top.vx *= damp;
  top.vy *= damp;

  top.x += top.vx * dt;
  top.y += top.vy * dt;

  const speed = len(top.vx, top.vy);
  top.spin -= top.spec.spinDecay * (1 + speed * TUNE.spinDrag) * dt;
  top.burst = Math.max(0, top.burst - TUNE.burstDecay * dt);
  top.angle += top.spec.spinDir * (2 + spinFactor * 26) * dt;
  return null;
}

function wall(top, events) {
  const dx = top.x - ARENA.cx;
  const dy = top.y - ARENA.cy;
  const dist = len(dx, dy);
  const limit = ARENA.R - top.spec.radius * 0.35;
  if (dist < limit) return;

  const nx = dx / dist;
  const ny = dy / dist;
  const outward = top.vx * nx + top.vy * ny;

  const knocked = top.hitTimer > 0 || outward > TUNE.selfOutSpeed;
  if (outward > ARENA.escapeSpeed && knocked && top.grace <= 0) {
    top.alive = false;
    top.outReason = 'ring';
    events.push({ type: 'ringout', side: top.side, x: top.x, y: top.y });
    return;
  }
  // Bounce off the rim and shed a bit of spin on the scrape.
  top.x = ARENA.cx + nx * limit;
  top.y = ARENA.cy + ny * limit;
  top.vx -= 1.55 * outward * nx;
  top.vy -= 1.55 * outward * ny;
  top.spin -= Math.max(0, outward) * 0.004;
  if (outward > 90) events.push({ type: 'scrape', x: top.x, y: top.y, power: outward });
}

function collide(a, b, events) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = len(dx, dy) || 0.0001;
  const minDist = a.spec.radius + b.spec.radius;
  if (dist >= minDist) return;

  const nx = dx / dist;
  const ny = dy / dist;

  // Separate them so they do not stick together.
  const overlap = minDist - dist;
  const totalMass = a.spec.mass + b.spec.mass;
  a.x -= nx * overlap * (b.spec.mass / totalMass);
  a.y -= ny * overlap * (b.spec.mass / totalMass);
  b.x += nx * overlap * (a.spec.mass / totalMass);
  b.y += ny * overlap * (a.spec.mass / totalMass);

  const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rvn > 0) return; // already separating

  const j = (-(1 + TUNE.restitution) * rvn) / (1 / a.spec.mass + 1 / b.spec.mass);
  a.vx -= (j / a.spec.mass) * nx;
  a.vy -= (j / a.spec.mass) * ny;
  b.vx += (j / b.spec.mass) * nx;
  b.vy += (j / b.spec.mass) * ny;

  // The harder-hitting top also shoves the other one: this is what wins ring-outs.
  const powerA = a.spec.attack * (a.spin / 100);
  const powerB = b.spec.attack * (b.spin / 100);
  // The stronger top drives the weaker one outward; the attacker only recoils
  // slightly. Written symmetrically so neither side gets a free advantage.
  const diff = powerA - powerB;
  const mag = Math.abs(diff) * TUNE.shove;
  if (diff >= 0) {
    b.vx += nx * mag;
    b.vy += ny * mag;
    a.vx -= nx * mag * 0.2;
    a.vy -= ny * mag * 0.2;
  } else {
    a.vx -= nx * mag;
    a.vy -= ny * mag;
    b.vx += nx * mag * 0.2;
    b.vy += ny * mag * 0.2;
  }

  const impact = Math.abs(rvn);
  const opposite = a.spec.spinDir !== b.spec.spinDir ? 1.35 : 1; // spin steal hurts both
  const base = impact * TUNE.damage * opposite;
  const ratio = (atk, def) => Math.pow((3 + atk) / (3 + def), TUNE.damageExp);
  // Two identical tops would otherwise trade damage in lockstep forever and
  // every mirror match would end in a draw, so each side rolls its own luck.
  const luck = () => 1 - TUNE.jitter / 2 + Math.random() * TUNE.jitter;
  const dmgB = base * ratio(a.spec.attack, b.spec.defense) * luck();
  const dmgA = base * ratio(b.spec.attack, a.spec.defense) * luck();
  a.spin -= dmgA;
  b.spin -= dmgB;

  a.hitTimer = 1.2;
  b.hitTimer = 1.2;

  b.burst += impact * TUNE.burstGain * ratio(a.spec.attack, b.spec.burstRes) * luck();
  a.burst += impact * TUNE.burstGain * ratio(b.spec.attack, a.spec.burstRes) * luck();

  events.push({
    type: 'clash',
    x: a.x + nx * a.spec.radius,
    y: a.y + ny * a.spec.radius,
    power: impact,
    nx, ny,
  });
}

function finish(battle, winner, reason) {
  battle.phase = 'result';
  battle.result = { winner, reason, points: winner < 0 ? 0 : POINTS[reason] };
  battle.events.push({ type: 'finish', winner, reason });
}

/** Advance the battle by dt seconds. Returns the events produced this step. */
export function stepBattle(battle, dt) {
  battle.events = [];
  if (battle.phase !== 'battle') return battle.events;

  const [a, b] = battle.tops;
  battle.time += dt;
  battle.timeLeft = Math.max(0, battle.timeLeft - dt);

  // Both tops read the same pre-step positions, otherwise whichever moves first
  // gets a small but measurable advantage when aiming its dash.
  const prev = battle.tops.map((t) => ({ x: t.x, y: t.y, vx: t.vx, vy: t.vy }));
  for (let i = 0; i < battle.tops.length; i++) {
    const t = battle.tops[i];
    if (!t.alive) continue;
    const ev = integrate(t, dt, prev[1 - i]);
    if (ev && ev.dash) battle.events.push({ type: 'dash', ...ev.dash });
    wall(t, battle.events);
  }
  if (a.alive && b.alive) collide(a, b, battle.events);

  for (const t of battle.tops) {
    if (!t.alive) continue;
    if (t.burst >= 100) {
      t.alive = false;
      t.outReason = 'burst';
      battle.events.push({ type: 'burst', side: t.side, x: t.x, y: t.y });
    } else if (t.spin <= 0) {
      t.spin = 0;
      t.alive = false;
      t.outReason = 'spin';
      battle.events.push({ type: 'spinout', side: t.side, x: t.x, y: t.y });
    }
  }

  if (!a.alive && !b.alive) {
    // Double knock-out: the top that was closer to surviving takes the round.
    const score = (t) => (t.outReason === 'burst' ? -1000 : 0) + t.spin - t.burst * 0.01;
    const sa = score(a);
    const sb = score(b);
    const reason = (sa > sb ? b : a).outReason;
    finish(battle, Math.abs(sa - sb) < 1e-6 ? -1 : sa > sb ? 0 : 1, reason === 'ring' ? 'ring' : reason);
  } else if (!a.alive) {
    finish(battle, 1, a.outReason);
  } else if (!b.alive) {
    finish(battle, 0, b.outReason);
  } else if (battle.timeLeft <= 0) {
    if (Math.abs(a.spin - b.spin) < 1) finish(battle, -1, 'timeout');
    else finish(battle, a.spin > b.spin ? 0 : 1, 'timeout');
  }

  return battle.events;
}

/** Compact snapshot used by the online host to sync the guest. */
export function snapshot(battle) {
  return {
    t: battle.time,
    tl: battle.timeLeft,
    ph: battle.phase,
    rs: battle.result,
    tops: battle.tops.map((t) => [
      Math.round(t.x * 10) / 10, Math.round(t.y * 10) / 10,
      Math.round(t.vx), Math.round(t.vy),
      Math.round(t.spin * 10) / 10, Math.round(t.burst * 10) / 10,
      Math.round(t.angle * 100) / 100, t.alive ? 1 : 0, Math.round(t.dashCd * 10) / 10,
    ]),
  };
}

export function applySnapshot(battle, s) {
  battle.time = s.t;
  battle.timeLeft = s.tl;
  battle.phase = s.ph;
  battle.result = s.rs;
  s.tops.forEach((d, i) => {
    const t = battle.tops[i];
    t.x = d[0]; t.y = d[1]; t.vx = d[2]; t.vy = d[3];
    t.spin = d[4]; t.burst = d[5]; t.angle = d[6]; t.alive = !!d[7]; t.dashCd = d[8];
  });
}
