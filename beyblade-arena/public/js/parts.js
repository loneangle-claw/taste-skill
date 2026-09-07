// Part catalogue. A top is Layer + Disc + Driver; stats are the sum of the three.
// Ratings are on a 0-10 scale and get converted to physics numbers in buildSpec().

export const LAYERS = [
  { id: 'valkyr',  name: '瓦爾凱',   kind: 'attack',  attack: 6, defense: 2, stamina: 2, burstRes: 2, blades: 3, color: '#3f8cff', accent: '#bfe0ff' },
  { id: 'aegis',   name: '神盾',     kind: 'defense', attack: 1, defense: 5, stamina: 3, burstRes: 4, blades: 8, color: '#ff5f6d', accent: '#ffc2c6' },
  { id: 'perpeta', name: '永動',     kind: 'stamina', attack: 1, defense: 3, stamina: 7, burstRes: 2, blades: 6, color: '#31d0aa', accent: '#c4fff0' },
  { id: 'equinox', name: '均衡',     kind: 'balance', attack: 3, defense: 3, stamina: 3, burstRes: 3, blades: 5, color: '#c07bff', accent: '#e8d4ff' },
  { id: 'ripper',  name: '裂空',     kind: 'attack',  attack: 7, defense: 1, stamina: 1, burstRes: 1, blades: 2, color: '#ffa53f', accent: '#ffe2bb' },
];

export const DISCS = [
  { id: 'light',   name: '輕量盤',   weight: 1.0, attack: 2, defense: 0, stamina: 2, burstRes: 0, size: 0 },
  { id: 'heavy',   name: '重量盤',   weight: 1.45, attack: 1, defense: 2, stamina: 1, burstRes: 1, size: 3 },
  { id: 'guard',   name: '護盾盤',   weight: 1.3, attack: 0, defense: 3, stamina: 1, burstRes: 2, size: 4 },
  { id: 'ring',    name: '外環盤',   weight: 1.35, attack: 1, defense: 1, stamina: 4, burstRes: 0, size: 2 },
];

export const DRIVERS = [
  // grip = how much sideways control the player gets. drag = floor friction.
  { id: 'flat',    name: '平軸',     grip: 1.35, drag: 0.30, attack: 3, defense: 0, stamina: 1, burstRes: 0 },
  { id: 'rubber',  name: '橡膠軸',   grip: 1.6,  drag: 0.46, attack: 4, defense: 0, stamina: -1, burstRes: 1 },
  { id: 'defense', name: '防禦軸',   grip: 0.7,  drag: 0.40, attack: 0, defense: 3, stamina: 1, burstRes: 2 },
  { id: 'needle',  name: '尖針軸',   grip: 0.55, drag: 0.22, attack: 0, defense: 1, stamina: 3, burstRes: 0 },
  { id: 'orb',     name: '圓珠軸',   grip: 0.85, drag: 0.26, attack: 1, defense: 2, stamina: 3, burstRes: 0 },
];

export const PRESETS = [
  { name: '衝鋒型', layer: 'valkyr',  disc: 'light', driver: 'flat' },
  { name: '鐵壁型', layer: 'aegis',   disc: 'guard', driver: 'defense' },
  { name: '持久型', layer: 'perpeta', disc: 'ring',  driver: 'needle' },
  { name: '全能型', layer: 'equinox', disc: 'heavy', driver: 'orb' },
];

const byId = (list, id) => list.find((p) => p.id === id) || list[0];

/**
 * Turn a part combo into the numbers the physics engine actually uses.
 * @param {{layer:string, disc:string, driver:string, spinDir?:number}} combo
 */
export function buildSpec(combo) {
  const layer = byId(LAYERS, combo.layer);
  const disc = byId(DISCS, combo.disc);
  const driver = byId(DRIVERS, combo.driver);

  const attack = layer.attack + disc.attack + driver.attack;
  const defense = layer.defense + disc.defense + driver.defense;
  const stamina = layer.stamina + disc.stamina + driver.stamina;
  const burstRes = layer.burstRes + disc.burstRes + driver.burstRes;

  return {
    parts: { layer: layer.id, disc: disc.id, driver: driver.id },
    name: `${layer.name}${disc.name}${driver.name}`,
    kind: layer.kind,
    color: layer.color,
    accent: layer.accent,
    blades: layer.blades,
    attack, defense, stamina, burstRes,
    mass: disc.weight,
    radius: 26 + disc.size,
    grip: driver.grip,
    drag: driver.drag,
    // A stamina build bleeds spin roughly half as fast as a pure attacker,
    // but the gap is small enough that hits, not the clock, decide most battles.
    spinDecay: 1.30 / (0.62 + stamina * 0.06),
    spinDir: combo.spinDir === -1 ? -1 : 1,
  };
}

export function statBars(spec) {
  return [
    ['攻擊', spec.attack, 14],
    ['防禦', spec.defense, 14],
    ['持久', spec.stamina, 14],
    ['抗爆', spec.burstRes, 12],
  ];
}

/* ── colour separation ─────────────────────────────────────
   Two players can pick the same layer, so side 1 gets its hue rotated when the
   two builds would otherwise be indistinguishable on the arena floor. */

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

const hsl = ([h, s, l], shift, dl = 0) =>
  `hsl(${(h + shift + 360) % 360} ${Math.round(s * 100)}% ${Math.round(Math.min(0.92, l + dl) * 100)}%)`;

export function separateColors(specA, specB) {
  const a = hexToHsl(specA.color);
  const b = hexToHsl(specB.color);
  const gap = Math.abs(((a[0] - b[0] + 540) % 360) - 180);
  if (gap > 45) return;
  const shift = 165;
  specB.color = hsl(b, shift);
  specB.accent = hsl(b, shift, 0.28);
}
