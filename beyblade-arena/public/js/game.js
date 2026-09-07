// Match flow: launch phase -> battle -> round result -> next round, plus the
// input layer and the online sync glue. The host client owns the simulation.

import { buildSpec, separateColors } from './parts.js';
import { ARENA, createBattle, launchTop, stepBattle, snapshot, applySnapshot, POINTS, TUNE } from './physics.js';
import { createAI, aiLaunch, think } from './ai.js';
import { createRenderer, render, handleEvents, resetFx } from './render.js';
import { send, isHost } from './net.js';

const STEP = 1 / 60;
const WIN_POINTS = 4;
const SNAPSHOT_HZ = 30;

export const FINISH_TEXT = {
  spin: ['迴轉結束', 'SPIN FINISH'],
  ring: ['場外結束', 'OVER FINISH'],
  burst: ['爆裂結束', 'BURST FINISH'],
  timeout: ['時間到', 'TIME UP'],
};

const KEYMAP = {
  0: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], dash: ['Space'] },
  1: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], dash: ['Enter', 'NumpadEnter'] },
  // Online / solo players may use either cluster.
  both: {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    dash: ['Space', 'Enter', 'NumpadEnter'],
  },
};

export function createGame(canvas, hooks = {}) {
  const game = {
    canvas,
    renderer: createRenderer(canvas),
    hooks,
    keys: new Set(),
    pointer: { active: false, x: 0, y: 0, dash: false },
    running: false,
    raf: 0,
    last: 0,
    acc: 0,
    netAcc: 0,
    mode: 'solo',
    net: null,
    iAm: 0,
    ai: null,
    battle: null,
    specs: [],
    score: [0, 0],
    round: 1,
    phase: 'idle',
    banner: null,
    bannerTimer: 0,
    charge: [{ held: false, t: 0, power: 0, aim: 0, locked: false }, { held: false, t: 0, power: 0, aim: 0, locked: false }],
    cpuLaunchAt: 0,
    guestTarget: null,
  };

  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    game.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => game.keys.delete(e.code));
  window.addEventListener('blur', () => game.keys.clear());

  // Touch / mouse steering: drag anywhere on the arena to point your top,
  // which also doubles as the launcher charge in the launch phase.
  const point = (e) => {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    game.pointer.x = ((t.clientX - rect.left) / rect.width) * canvas.width;
    game.pointer.y = ((t.clientY - rect.top) / rect.height) * canvas.height;
  };
  const start = (e) => { game.pointer.active = true; point(e); e.preventDefault(); };
  const move = (e) => { if (game.pointer.active) point(e); };
  const end = () => { game.pointer.active = false; };
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);

  return game;
}

const held = (game, codes) => codes.some((c) => game.keys.has(c));

function readKeys(game, map) {
  let x = 0;
  let y = 0;
  if (held(game, map.left)) x -= 1;
  if (held(game, map.right)) x += 1;
  if (held(game, map.up)) y -= 1;
  if (held(game, map.down)) y += 1;
  return { x, y, dash: held(game, map.dash) };
}

/** Which key cluster drives side `side` in the current mode. */
function mapFor(game, side) {
  if (game.mode === 'local') return KEYMAP[side];
  return KEYMAP.both;
}

function localInput(game, side) {
  const k = readKeys(game, mapFor(game, side));
  // Pointer steering wins when the player is actually dragging.
  if (game.pointer.active && (game.mode !== 'local' || side === 0)) {
    const top = game.battle.tops[side];
    const dx = game.pointer.x - top.x;
    const dy = game.pointer.y - top.y;
    const d = Math.hypot(dx, dy);
    if (d > 12) {
      k.x = dx / d;
      k.y = dy / d;
    }
  }
  return k;
}

export function startMatch(game, opts) {
  game.mode = opts.mode;
  game.net = opts.net || null;
  game.iAm = opts.iAm || 0;
  game.specs = opts.combos.map(buildSpec);
  separateColors(game.specs[0], game.specs[1]);
  game.ai = opts.mode === 'solo' ? createAI(opts.difficulty || 'normal') : null;
  game.score = [0, 0];
  game.round = 1;
  startRound(game);
  if (!game.running) {
    game.running = true;
    game.last = performance.now();
    game.raf = requestAnimationFrame((t) => loop(game, t));
  }
}

export function stopMatch(game) {
  game.running = false;
  cancelAnimationFrame(game.raf);
  game.phase = 'idle';
}

function startRound(game) {
  game.battle = createBattle(game.specs[0], game.specs[1]);
  game.battle.phase = 'launch';
  game.phase = 'launch';
  game.charge.forEach((c) => Object.assign(c, { held: false, t: 0, power: 0, aim: 0, locked: false }));
  game.cpuLaunchAt = 0.5 + Math.random() * 0.9;
  game.banner = null;
  game.guestTarget = null;
  resetFx(game.renderer);
  if (game.hooks.onRound) game.hooks.onRound(game);
}

function chargeSide(game, side, dt, wantsCharge, aimDir) {
  const c = game.charge[side];
  if (c.locked) return;
  if (wantsCharge) {
    c.held = true;
    c.t += dt;
    // Ping-pong meter: stopping it near the top is the skill test.
    const cycle = (c.t / 1.15) % 2;
    c.power = cycle <= 1 ? cycle : 2 - cycle;
    c.aim = Math.max(-1, Math.min(1, c.aim + aimDir * dt * 1.6));
  } else if (c.held) {
    c.locked = true;
    launchTop(game.battle.tops[side], Math.max(0.15, c.power), c.aim);
    if (game.mode === 'online' && side === game.iAm) {
      send(game.net, { t: 'launch', power: Math.max(0.15, c.power), aim: c.aim });
    }
  }
}

function updateLaunch(game, dt) {
  const b = game.battle;

  if (game.mode === 'online') {
    const map = KEYMAP.both;
    const wants = held(game, map.dash) || game.pointer.active;
    const aim = (held(game, map.right) ? 1 : 0) - (held(game, map.left) ? 1 : 0);
    chargeSide(game, game.iAm, dt, wants, aim);
  } else if (game.mode === 'local') {
    for (const side of [0, 1]) {
      const map = KEYMAP[side];
      const wants = held(game, map.dash) || (side === 0 && game.pointer.active);
      const aim = (held(game, map.right) ? 1 : 0) - (held(game, map.left) ? 1 : 0);
      chargeSide(game, side, dt, wants, aim);
    }
  } else {
    const map = KEYMAP.both;
    const wants = held(game, map.dash) || game.pointer.active;
    const aim = (held(game, map.right) ? 1 : 0) - (held(game, map.left) ? 1 : 0);
    chargeSide(game, 0, dt, wants, aim);
    game.cpuLaunchAt -= dt;
    if (game.cpuLaunchAt <= 0 && !game.charge[1].locked) {
      const l = aiLaunch(game.ai);
      game.charge[1].locked = true;
      game.charge[1].power = l.power;
      launchTop(b.tops[1], l.power, l.aim);
    }
  }

  if (b.tops.every((t) => t.launched)) {
    b.phase = 'battle';
    game.phase = 'battle';
  }
}

function awardPoints(game) {
  const r = game.battle.result;
  if (!r) return;
  if (r.winner >= 0) game.score[r.winner] += r.points || POINTS[r.reason] || 1;
  const [zh, en] = FINISH_TEXT[r.reason] || FINISH_TEXT.spin;
  game.banner = {
    title: r.winner < 0 ? '平手' : `${zh} +${r.points}`,
    sub: r.winner < 0 ? 'DRAW' : en,
    winner: r.winner,
  };
  game.bannerTimer = 2.6;
  game.phase = 'roundEnd';
  if (game.hooks.onScore) game.hooks.onScore(game);
}

function afterRound(game, dt) {
  game.bannerTimer -= dt;
  if (game.bannerTimer > 0) return;
  const done = game.score.some((s) => s >= WIN_POINTS);
  if (done) {
    game.phase = 'matchEnd';
    if (game.hooks.onMatchEnd) game.hooks.onMatchEnd(game, game.score[0] > game.score[1] ? 0 : 1);
  } else {
    game.round++;
    startRound(game);
  }
}

function simulate(game, dt) {
  const b = game.battle;
  if (game.mode === 'solo') {
    Object.assign(b.tops[0].input, localInput(game, 0));
    think(game.ai, b.tops[1], b.tops[0], dt);
  } else if (game.mode === 'local') {
    Object.assign(b.tops[0].input, localInput(game, 0));
    Object.assign(b.tops[1].input, localInput(game, 1));
  } else if (isHost(game.net)) {
    Object.assign(b.tops[0].input, localInput(game, 0));
    // tops[1].input is written by the guest's input messages.
  }
  const events = stepBattle(b, dt);
  handleEvents(game.renderer, events, b.tops);
  if (b.phase === 'result' && game.phase === 'battle') awardPoints(game);
}

/** Guests do not simulate: they smooth toward the host's snapshots. */
function followHost(game, dt) {
  const b = game.battle;
  const target = game.guestTarget;
  for (const t of b.tops) {
    if (!t.alive) continue;
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    t.angle += t.spec.spinDir * (2 + Math.max(0, t.spin / 100) * 26) * dt;
  }
  if (!target) return;
  target.tops.forEach((d, i) => {
    const t = b.tops[i];
    const k = 0.25;
    t.x += (d[0] - t.x) * k;
    t.y += (d[1] - t.y) * k;
    t.vx = d[2];
    t.vy = d[3];
    t.spin = d[4];
    t.burst = d[5];
    t.alive = !!d[7];
    t.dashCd = d[8];
  });
}

function pushNet(game, dt) {
  if (game.mode !== 'online') return;
  game.netAcc += dt;
  if (game.netAcc < 1 / SNAPSHOT_HZ) return;
  game.netAcc = 0;
  if (isHost(game.net)) {
    send(game.net, { t: 'state', s: snapshot(game.battle), score: game.score, round: game.round, banner: game.banner, phase: game.phase });
  } else {
    const i = localInput(game, game.iAm);
    send(game.net, { t: 'input', x: i.x, y: i.y, dash: i.dash });
  }
}

/** Host side: apply an input message from the guest. */
export function applyGuestInput(game, msg) {
  if (!game.battle || !isHost(game.net)) return;
  const t = game.battle.tops[1];
  t.input.x = msg.x || 0;
  t.input.y = msg.y || 0;
  if (msg.dash) t.input.dash = true;
}

/** Host side: the guest released its launcher. */
export function applyGuestLaunch(game, msg) {
  if (!game.battle || !isHost(game.net)) return;
  if (game.charge[1].locked) return;
  game.charge[1].locked = true;
  game.charge[1].power = msg.power;
  launchTop(game.battle.tops[1], msg.power, msg.aim || 0);
}

/** Guest side: adopt the host's authoritative state. */
export function applyHostState(game, msg) {
  if (!game.battle || isHost(game.net)) return;
  game.guestTarget = msg.s;
  game.score = msg.score || game.score;
  game.battle.timeLeft = msg.s.tl;
  game.battle.result = msg.s.rs;
  if (msg.s.ph === 'battle' && game.phase === 'launch') {
    game.phase = 'battle';
    game.battle.phase = 'battle';
    game.battle.tops.forEach((t) => { t.launched = true; });
  }
  if (msg.phase === 'roundEnd' && game.phase !== 'roundEnd') {
    game.phase = 'roundEnd';
    game.banner = msg.banner;
    game.bannerTimer = 2.6;
    if (game.hooks.onScore) game.hooks.onScore(game);
  }
  if (msg.round !== game.round && msg.phase === 'launch') {
    game.round = msg.round;
    startRound(game);
  }
}

function loop(game, now) {
  if (!game.running) return;
  const dt = Math.min(0.05, (now - game.last) / 1000);
  game.last = now;
  game.raf = requestAnimationFrame((t) => loop(game, t));

  const guest = game.mode === 'online' && !isHost(game.net);

  if (game.phase === 'launch') {
    updateLaunch(game, dt);
  } else if (game.phase === 'battle') {
    if (guest) {
      followHost(game, dt);
    } else {
      game.acc += dt;
      let steps = 0;
      while (game.acc >= STEP && steps < 5) {
        simulate(game, STEP);
        game.acc -= STEP;
        steps++;
      }
    }
  } else if (game.phase === 'roundEnd') {
    if (guest) followHost(game, dt);
    else afterRound(game, dt);
  }

  pushNet(game, dt);
  render(game.renderer, game.battle, dt, { showDead: game.phase !== 'battle' });
  if (game.hooks.onFrame) game.hooks.onFrame(game);
}

export { ARENA, WIN_POINTS, TUNE };
