// Canvas renderer. Owns nothing about the rules - it draws whatever battle
// state it is handed, plus its own particles, trails and screen shake.

import { ARENA } from './physics.js';

const TAU = Math.PI * 2;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  return {
    canvas,
    ctx,
    trails: [[], []],
    particles: [],
    shake: 0,
    flash: 0,
    flashColor: '#ffffff',
    time: 0,
  };
}

export function resetFx(r) {
  r.trails = [[], []];
  r.particles.length = 0;
  r.shake = 0;
  r.flash = 0;
}

function spark(r, x, y, color, opts = {}) {
  const count = opts.count || 10;
  for (let i = 0; i < count; i++) {
    const a = opts.angle !== undefined
      ? opts.angle + (Math.random() - 0.5) * (opts.spread || 1.6)
      : Math.random() * TAU;
    const speed = (opts.speed || 180) * (0.35 + Math.random() * 0.9);
    r.particles.push({
      x, y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: opts.life || 0.5,
      max: opts.life || 0.5,
      size: opts.size || 2.4,
      color,
      gravity: opts.gravity || 0,
    });
  }
}

/** Feed physics events to the renderer so it can react with juice. */
export function handleEvents(r, events, tops) {
  for (const e of events) {
    if (e.type === 'clash') {
      const p = Math.min(1, e.power / 420);
      spark(r, e.x, e.y, '#fff3c4', { count: 8 + Math.round(p * 18), speed: 120 + p * 380, life: 0.35 + p * 0.3, size: 1.6 + p * 2 });
      r.shake = Math.min(22, r.shake + 4 + p * 16);
    } else if (e.type === 'scrape') {
      spark(r, e.x, e.y, '#9fd8ff', { count: 4, speed: 90, life: 0.25, size: 1.4 });
    } else if (e.type === 'dash') {
      const t = tops[e.side];
      spark(r, e.x, e.y, t.spec.accent, { count: 14, speed: 220, life: 0.4, size: 2 });
    } else if (e.type === 'ringout') {
      spark(r, e.x, e.y, '#ffd166', { count: 46, speed: 460, life: 0.9, size: 3, gravity: 260 });
      r.shake = 26;
      r.flash = 0.5;
      r.flashColor = '#ffd166';
    } else if (e.type === 'burst') {
      spark(r, e.x, e.y, '#ff6b8b', { count: 70, speed: 560, life: 1.1, size: 3.4 });
      r.shake = 30;
      r.flash = 0.7;
      r.flashColor = '#ff6b8b';
    } else if (e.type === 'spinout') {
      spark(r, e.x, e.y, '#8fa3c8', { count: 20, speed: 120, life: 0.8, size: 2 });
    }
  }
}

function drawArena(ctx, t) {
  const { cx, cy, R } = ARENA;

  const bowl = ctx.createRadialGradient(cx, cy - R * 0.25, R * 0.1, cx, cy, R);
  bowl.addColorStop(0, '#1b2440');
  bowl.addColorStop(0.55, '#141b31');
  bowl.addColorStop(1, '#0b1020');
  ctx.fillStyle = bowl;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();

  // Contour rings.
  ctx.lineWidth = 1;
  for (let i = 1; i <= 6; i++) {
    const rr = (R * i) / 6.6;
    ctx.strokeStyle = `rgba(120,160,255,${0.05 + i * 0.012})`;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, TAU);
    ctx.stroke();
  }

  // Slowly rotating guide spokes: sells the idea of a spinning stadium.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * 0.06);
  ctx.strokeStyle = 'rgba(120,160,255,0.06)';
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.rotate(TAU / 12);
    ctx.moveTo(R * 0.18, 0);
    ctx.lineTo(R * 0.95, 0);
    ctx.stroke();
  }
  ctx.restore();

  // Rim.
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#0e1526';
  ctx.beginPath();
  ctx.arc(cx, cy, R + 4, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(140,190,255,0.35)';
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.stroke();

  // Centre marker.
  ctx.strokeStyle = 'rgba(140,190,255,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0, TAU);
  ctx.stroke();
}

function drawTrail(ctx, trail, color) {
  if (trail.length < 2) return;
  ctx.lineCap = 'round';
  for (let i = 1; i < trail.length; i++) {
    const a = i / trail.length;
    ctx.strokeStyle = color;
    ctx.globalAlpha = a * 0.35;
    ctx.lineWidth = 1 + a * 7;
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawTop(ctx, top, t) {
  const { spec } = top;
  const spinFactor = Math.max(0, Math.min(1, top.spin / 100));
  const r = spec.radius;

  ctx.save();
  ctx.translate(top.x, top.y);

  // Contact shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(2, 5, r * 0.95, r * 0.75, 0, 0, TAU);
  ctx.fill();

  // Motion blur disc: faster spin means a smoother, brighter ring.
  ctx.globalAlpha = 0.25 + spinFactor * 0.35;
  const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.5);
  glow.addColorStop(0, spec.color);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.5, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.rotate(top.angle);

  // Energy layer: one wedge per blade.
  ctx.beginPath();
  for (let i = 0; i <= spec.blades; i++) {
    const a = (i / spec.blades) * TAU;
    const outer = r;
    const inner = r * 0.55;
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.lineTo(Math.cos(a + TAU / spec.blades / 2) * inner, Math.sin(a + TAU / spec.blades / 2) * inner);
  }
  ctx.closePath();
  ctx.fillStyle = spec.color;
  ctx.fill();
  ctx.strokeStyle = spec.accent;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Forge disc.
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.6, 0, TAU);
  ctx.fillStyle = '#e8eefc';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.45, 0, TAU);
  ctx.fillStyle = spec.accent;
  ctx.fill();

  // Driver tip.
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.16, 0, TAU);
  ctx.fillStyle = '#101827';
  ctx.fill();

  ctx.restore();

  // Burst gauge arc: the ring tightening around a top about to pop.
  if (top.burst > 3) {
    ctx.save();
    ctx.translate(top.x, top.y);
    ctx.rotate(-Math.PI / 2);
    ctx.strokeStyle = top.burst > 70 ? '#ff5470' : '#ffb44d';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, r + 8, 0, TAU * Math.min(1, top.burst / 100));
    ctx.stroke();
    ctx.restore();
  }

  // Wobble marker when a top is about to stop spinning.
  if (spinFactor < 0.22 && top.alive) {
    ctx.save();
    ctx.globalAlpha = 0.5 + Math.sin(t * 12) * 0.3;
    ctx.strokeStyle = '#ff9f4d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(top.x, top.y, r + 14, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

function drawParticles(ctx, r, dt) {
  for (let i = r.particles.length - 1; i >= 0; i--) {
    const p = r.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      r.particles.splice(i, 1);
      continue;
    }
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.97;
    p.vy *= 0.97;
    const a = p.life / p.max;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * a, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function render(r, battle, dt, opts = {}) {
  const { ctx, canvas } = r;
  r.time += dt;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#070a14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  r.shake = Math.max(0, r.shake - dt * 55);
  const sx = (Math.random() - 0.5) * r.shake;
  const sy = (Math.random() - 0.5) * r.shake;
  ctx.save();
  ctx.translate(sx, sy);

  drawArena(ctx, r.time);

  battle.tops.forEach((top, i) => {
    if (!top.alive) return;
    const trail = r.trails[i];
    trail.push({ x: top.x, y: top.y });
    if (trail.length > 26) trail.shift();
    drawTrail(ctx, trail, top.spec.color);
  });

  battle.tops.forEach((top) => {
    if (top.alive || opts.showDead) drawTop(ctx, top, r.time);
  });

  drawParticles(ctx, r, dt);
  ctx.restore();

  if (r.flash > 0) {
    r.flash = Math.max(0, r.flash - dt * 1.6);
    ctx.globalAlpha = r.flash * 0.6;
    ctx.fillStyle = r.flashColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }
}
