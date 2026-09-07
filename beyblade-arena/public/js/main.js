// DOM wiring: menu, garage, online lobby and the in-game HUD.

import { LAYERS, DISCS, DRIVERS, PRESETS, buildSpec, statBars } from './parts.js';
import { createGame, startMatch, stopMatch, applyGuestInput, applyGuestLaunch, applyHostState, WIN_POINTS } from './game.js';
import { createNet, connect, on, send, disconnect, isHost } from './net.js';

const $ = (id) => document.getElementById(id);
const screens = {
  menu: $('screen-menu'),
  lobby: $('screen-lobby'),
  game: $('screen-game'),
};

const state = {
  mode: 'solo',
  difficulty: 'normal',
  combo: { layer: 'valkyr', disc: 'light', driver: 'flat', spinDir: 1 },
  opponentCombo: null,
};

const net = createNet();
const game = createGame($('arena'), {
  onFrame: updateHud,
  onRound: updateHud,
  onScore: updateHud,
  onMatchEnd: showResult,
});

function show(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

/* ── garage ─────────────────────────────────────────────── */

function chipRow(container, items, key) {
  container.innerHTML = '';
  items.forEach((item) => {
    const b = document.createElement('button');
    b.className = 'chip' + (state.combo[key] === item.id ? ' active' : '');
    b.textContent = item.name;
    b.dataset.id = item.id;
    b.onclick = () => {
      state.combo[key] = item.id;
      [...container.children].forEach((c) => c.classList.toggle('active', c.dataset.id === item.id));
      refreshSpec();
    };
    container.appendChild(b);
  });
}

function buildGarage() {
  chipRow($('pick-layer'), LAYERS, 'layer');
  chipRow($('pick-disc'), DISCS, 'disc');
  chipRow($('pick-driver'), DRIVERS, 'driver');

  const presets = $('presets');
  presets.innerHTML = '';
  PRESETS.forEach((p) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = p.name;
    b.onclick = () => {
      Object.assign(state.combo, { layer: p.layer, disc: p.disc, driver: p.driver });
      buildGarage();
      refreshSpec();
    };
    presets.appendChild(b);
  });

  $('pick-spin').querySelectorAll('.chip').forEach((b) => {
    b.classList.toggle('active', String(state.combo.spinDir) === b.dataset.spin);
    b.onclick = () => {
      state.combo.spinDir = Number(b.dataset.spin);
      $('pick-spin').querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === b));
      refreshSpec();
    };
  });
}

function refreshSpec() {
  const spec = buildSpec(state.combo);
  $('stats').innerHTML = statBars(spec)
    .map(([label, value, max]) => `
      <div class="stat">
        <span>${label}</span>
        <span class="track"><i style="width:${Math.max(4, Math.min(100, (value / max) * 100))}%"></i></span>
        <b>${value}</b>
      </div>`)
    .join('');
  drawPreview(spec);
}

let previewAngle = 0;
let previewSpec = null;
function drawPreview(spec) {
  previewSpec = spec;
}
(function previewLoop() {
  requestAnimationFrame(previewLoop);
  const c = $('preview');
  if (!c || !previewSpec) return;
  const ctx = c.getContext('2d');
  const r = 62;
  previewAngle += 0.06 * previewSpec.spinDir;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.save();
  ctx.translate(c.width / 2, c.height / 2);

  const glow = ctx.createRadialGradient(0, 0, 10, 0, 0, r * 1.6);
  glow.addColorStop(0, previewSpec.color);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.rotate(previewAngle);
  ctx.beginPath();
  for (let i = 0; i <= previewSpec.blades; i++) {
    const a = (i / previewSpec.blades) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(a + Math.PI / previewSpec.blades) * r * 0.55, Math.sin(a + Math.PI / previewSpec.blades) * r * 0.55);
  }
  ctx.closePath();
  ctx.fillStyle = previewSpec.color;
  ctx.fill();
  ctx.strokeStyle = previewSpec.accent;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = '#e8eefc';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = previewSpec.accent;
  ctx.fill();
  ctx.restore();
})();

/* ── HUD ────────────────────────────────────────────────── */

function names() {
  if (state.mode === 'solo') return ['玩家', '電腦'];
  if (state.mode === 'local') return ['玩家 1', '玩家 2'];
  return game.iAm === 0 ? ['你', '對手'] : ['對手', '你'];
}

function dots(el, score) {
  if (el.children.length !== WIN_POINTS) {
    el.innerHTML = Array.from({ length: WIN_POINTS }, () => '<span class="dot"></span>').join('');
  }
  [...el.children].forEach((d, i) => d.classList.toggle('on', i < Math.min(WIN_POINTS, score)));
}

function updateHud() {
  const b = game.battle;
  if (!b) return;
  const [n1, n2] = names();
  $('p1-name').textContent = n1;
  $('p2-name').textContent = n2;
  $('round-label').textContent = `ROUND ${game.round}`;
  $('timer').textContent = Math.ceil(b.timeLeft);

  b.tops.forEach((t, i) => {
    $(`p${i + 1}-spin`).style.width = `${Math.max(0, Math.min(100, t.spin))}%`;
    $(`p${i + 1}-burst`).style.width = `${Math.max(0, Math.min(100, t.burst))}%`;
    dots($(`p${i + 1}-dots`), game.score[i]);
  });

  const launching = game.phase === 'launch';
  $('launcher').hidden = !launching;
  if (launching) {
    const mine = state.mode === 'online' ? game.iAm : 0;
    const c = game.charge[mine];
    $('meter-fill').style.width = `${Math.round(c.power * 100)}%`;
    const other = game.charge[1 - mine];
    $('launch-sub').textContent = c.locked
      ? (other.locked ? '' : '等待對手發射…')
      : (state.mode === 'local' ? '1P：空白鍵　2P：Enter' : '量表越滿，初速與迴轉力越高');
  }

  const banner = $('banner');
  if (game.banner && game.phase === 'roundEnd') {
    banner.hidden = false;
    $('banner-title').textContent = game.banner.title;
    $('banner-sub').textContent = game.banner.sub;
    $('banner-title').style.color = game.banner.winner === 0 ? 'var(--p1)' : game.banner.winner === 1 ? 'var(--p2)' : 'var(--ink)';
  } else {
    banner.hidden = true;
  }
}

function showResult(g, winner) {
  const [n1, n2] = names();
  $('result').hidden = false;
  $('result-title').textContent = `${winner === 0 ? n1 : n2} 獲勝！`;
  $('result-title').style.color = winner === 0 ? 'var(--p1)' : 'var(--p2)';
  $('result-score').textContent = `${g.score[0]} : ${g.score[1]}`;
  $('btn-rematch').hidden = state.mode === 'online' && !isHost(net);
}

/* ── match start ────────────────────────────────────────── */

function cpuCombo() {
  // Never mirror the player's layer: same-build matches are far less interesting.
  const pool = PRESETS.filter((p) => p.layer !== state.combo.layer);
  const p = (pool.length ? pool : PRESETS)[Math.floor(Math.random() * (pool.length || PRESETS.length))];
  return { layer: p.layer, disc: p.disc, driver: p.driver, spinDir: Math.random() < 0.35 ? -1 : 1 };
}

function begin(mode, extra = {}) {
  state.mode = mode;
  $('result').hidden = true;
  $('banner').hidden = true;
  show('game');
  const mine = { ...state.combo };
  let combos;
  if (mode === 'online') {
    const peer = state.opponentCombo || cpuCombo();
    combos = isHost(net) ? [mine, peer] : [peer, mine];
  } else if (mode === 'local') {
    combos = [mine, { ...cpuCombo(), spinDir: -state.combo.spinDir }];
  } else {
    combos = [mine, cpuCombo()];
  }
  startMatch(game, {
    mode,
    difficulty: state.difficulty,
    combos,
    net: mode === 'online' ? net : null,
    iAm: mode === 'online' ? net.you : 0,
    ...extra,
  });
  updateHud();
}

/* ── online lobby ───────────────────────────────────────── */

function wireNet() {
  on(net, 'created', (m) => {
    $('room-info').hidden = false;
    $('room-code').textContent = m.code;
    $('room-status').textContent = '等待對手加入…';
  });
  on(net, 'joined', () => {
    $('room-info').hidden = false;
    $('room-code').textContent = net.code;
    $('room-status').textContent = '已連線，準備開始…';
    state.opponentCombo = net.peer && net.peer.combo ? net.peer.combo : null;
    begin('online');
  });
  on(net, 'peerJoined', (m) => {
    state.opponentCombo = m.peer && m.peer.combo ? m.peer.combo : null;
    $('room-status').textContent = '對手已加入！';
    begin('online');
  });
  on(net, 'input', (m) => applyGuestInput(game, m));
  on(net, 'launch', (m) => applyGuestLaunch(game, m));
  on(net, 'state', (m) => applyHostState(game, m));
  on(net, 'rematch', () => { if (isHost(net)) begin('online'); });
  on(net, 'error', (m) => {
    $('lobby-error').textContent = m.reason === 'no-room' ? '找不到這個房號' : '房間已滿';
  });
  on(net, 'peerLeft', () => {
    if (screens.game.classList.contains('active')) {
      stopMatch(game);
      alert('對手已離開房間');
    }
    disconnect(net);
    show('menu');
  });
  on(net, 'closed', () => {
    if (screens.lobby.classList.contains('active')) $('lobby-error').textContent = '連線已中斷';
  });
}

/* ── events ─────────────────────────────────────────────── */

document.querySelectorAll('.mode').forEach((b) => {
  b.onclick = () => {
    const mode = b.dataset.mode;
    if (mode === 'online') {
      $('lobby-error').textContent = '';
      $('room-info').hidden = true;
      show('lobby');
      return;
    }
    begin(mode);
  };
});

$('difficulty').querySelectorAll('.chip').forEach((b) => {
  b.onclick = () => {
    state.difficulty = b.dataset.diff;
    $('difficulty').querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === b));
  };
});

$('btn-create').onclick = async () => {
  $('lobby-error').textContent = '';
  try {
    await connect(net);
    send(net, { t: 'create', info: { combo: state.combo } });
  } catch {
    $('lobby-error').textContent = '無法連線到伺服器';
  }
};

$('btn-join').onclick = async () => {
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length < 4) {
    $('lobby-error').textContent = '請輸入 4 位房號';
    return;
  }
  $('lobby-error').textContent = '';
  try {
    await connect(net);
    send(net, { t: 'join', code, info: { combo: state.combo } });
  } catch {
    $('lobby-error').textContent = '無法連線到伺服器';
  }
};

$('btn-lobby-back').onclick = () => {
  disconnect(net);
  show('menu');
};

$('btn-rematch').onclick = () => {
  if (state.mode === 'online' && !isHost(net)) {
    send(net, { t: 'rematch' });
    return;
  }
  if (state.mode === 'online') send(net, { t: 'rematch' });
  begin(state.mode);
};

const quit = () => {
  stopMatch(game);
  if (state.mode === 'online') disconnect(net);
  show('menu');
};
$('btn-quit').onclick = quit;
$('btn-back').onclick = quit;

// Exposed for debugging and for the browser tests in scripts/.
window.__game = game;
window.__net = net;

wireNet();
buildGarage();
refreshSpec();
