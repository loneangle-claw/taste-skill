// Headless balance harness: runs CPU-vs-CPU battles across every preset matchup
// and prints a win matrix plus the distribution of finish types.
//   node scripts/balance.mjs [gamesPerMatchup]
import { buildSpec, PRESETS } from '../public/js/parts.js';
import { createBattle, launchTop, stepBattle, TUNE } from '../public/js/physics.js';
import { createAI, aiLaunch, think } from '../public/js/ai.js';

const DT = 1 / 60;

export function simulate(comboA, comboB, level = 'normal') {
  const battle = createBattle(buildSpec(comboA), buildSpec(comboB));
  battle.phase = 'battle';
  const ais = [createAI(level), createAI(level)];
  battle.tops.forEach((t, i) => {
    const l = aiLaunch(ais[i]);
    launchTop(t, l.power, l.aim);
  });
  let frames = 0;
  let hits = 0;
  while (battle.phase === 'battle' && frames < 60 * (TUNE.roundTime + 5)) {
    think(ais[0], battle.tops[0], battle.tops[1], DT);
    think(ais[1], battle.tops[1], battle.tops[0], DT);
    for (const e of stepBattle(battle, DT)) if (e.type === 'clash') hits++;
    frames++;
  }
  return {
    winner: battle.result ? battle.result.winner : -1,
    reason: battle.result ? battle.result.reason : 'hang',
    time: battle.time,
    hits,
  };
}

export function report(games = 40, level = 'normal') {
  const wins = PRESETS.map(() => 0);
  const played = PRESETS.map(() => 0);
  const reasons = {};
  const matrix = [];
  let time = 0;
  let hits = 0;
  let n = 0;

  PRESETS.forEach((a, i) => {
    const row = [];
    PRESETS.forEach((b, j) => {
      let w = 0;
      for (let g = 0; g < games; g++) {
        const r = simulate(a, b, level);
        reasons[r.reason] = (reasons[r.reason] || 0) + 1;
        time += r.time;
        hits += r.hits;
        n++;
        played[i]++; played[j]++;
        if (r.winner === 0) { w++; wins[i]++; } else if (r.winner === 1) wins[j]++;
      }
      row.push(Math.round((w / games) * 100));
    });
    matrix.push(row);
  });

  return { matrix, wins, played, reasons, avgTime: time / n, avgHits: hits / n, n };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const games = Number(process.argv[2] || 40);
  const r = report(games);
  const pad = (s, w) => String(s).padEnd(w);
  console.log(`\n${r.n} battles · avg ${r.avgTime.toFixed(1)}s · avg ${r.avgHits.toFixed(1)} clashes`);
  console.log('finishes:', Object.entries(r.reasons).map(([k, v]) => `${k} ${Math.round(v / r.n * 100)}%`).join('  '));
  console.log('\nrow win% vs column');
  console.log(pad('', 10) + PRESETS.map((p) => pad(p.name, 8)).join(''));
  r.matrix.forEach((row, i) => {
    console.log(pad(PRESETS[i].name, 10) + row.map((v) => pad(v + '%', 8)).join(''));
  });
  console.log('\noverall win rate');
  PRESETS.forEach((p, i) => console.log(pad(p.name, 10) + Math.round(r.wins[i] / r.played[i] * 100) + '%'));
}
