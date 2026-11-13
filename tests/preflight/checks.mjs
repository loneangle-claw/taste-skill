// Mechanical subset of the taste-skill Pre-Flight Check (skills/taste-skill/SKILL.md).
// Each rule points at the SKILL.md section it enforces. `fail` rules are hard
// bans in the skill; `warn` rules are heuristics or rules with an override path.

export const RULES = [
  { id: 'em-dash', section: '9.G', severity: 'fail', title: 'Zero em-dashes or en-dashes in visible text' },
  { id: 'overflow-x', section: '3.E', severity: 'fail', title: 'No horizontal scroll at any viewport' },
  { id: 'cta-contrast', section: '4.5', severity: 'fail', title: 'Button text passes WCAG AA against its background' },
  { id: 'cta-wrap', section: '4.5', severity: 'fail', title: 'Button labels stay on one line at desktop' },
  { id: 'cta-duplicate-intent', section: '4.5', severity: 'fail', title: 'One label per CTA intent' },
  { id: 'form-contrast', section: '4.5', severity: 'fail', title: 'Form text and placeholders pass WCAG AA' },
  { id: 'form-label', section: '4.6', severity: 'fail', title: 'Every input has a visible label (no placeholder-as-label)' },
  { id: 'nav-single-line', section: '4.7', severity: 'fail', title: 'Navigation renders on one line at desktop' },
  { id: 'nav-height', section: '4.7', severity: 'fail', title: 'Navigation is at most 80px tall at desktop' },
  { id: 'hero-headline-lines', section: '4.7', severity: 'fail', title: 'Hero headline is at most 2 lines at desktop' },
  { id: 'hero-subtext-words', section: '4.7', severity: 'fail', title: 'Hero subtext is at most 20 words' },
  { id: 'hero-cta-in-viewport', section: '4.7', severity: 'fail', title: 'Hero CTA is visible without scrolling' },
  { id: 'eyebrow-count', section: '4.7', severity: 'fail', title: 'At most 1 eyebrow per 3 sections' },
  { id: 'section-number-eyebrow', section: '9.F', severity: 'fail', title: 'No section-number eyebrows' },
  { id: 'three-equal-cards', section: '9.C', severity: 'fail', title: 'No row of three identical feature cards' },
  { id: 'banned-font', section: '4.1', severity: 'fail', title: 'No Fraunces or Instrument Serif' },
  { id: 'pure-black', section: '9.A', severity: 'fail', title: 'No pure black (#000000)' },
  { id: 'gradient-headline', section: '9.A', severity: 'fail', title: 'No gradient text on large headers' },
  { id: 'custom-cursor', section: '9.A', severity: 'fail', title: 'No custom mouse cursors' },
  { id: 'banned-copy', section: '9.D', severity: 'fail', title: 'No filler verbs, generic names, or slop brand names' },
  { id: 'scroll-cue', section: '9.F', severity: 'fail', title: 'No scroll cues' },
  { id: 'generic-step-label', section: '9.F', severity: 'fail', title: 'No "Step 1 / Stage 2" labels' },
  { id: 'broken-image', section: '9.E', severity: 'fail', title: 'No broken images' },
  { id: 'scroll-listener', section: '5.D', severity: 'fail', title: 'No window scroll listeners' },
  { id: 'reduced-motion', section: '6.B', severity: 'fail', title: 'Infinite animations stop under prefers-reduced-motion' },
  { id: 'stuck-invisible', section: '5.C', severity: 'fail', title: 'No content left invisible after scrolling the whole page' },
  { id: 'page-error', section: '9.E', severity: 'fail', title: 'No uncaught JavaScript errors' },
  { id: 'premium-palette', section: '4.2', severity: 'warn', title: 'Not the banned beige, brass and espresso palette' },
  { id: 'inter-default', section: '4.1', severity: 'warn', title: 'Inter is not the default font' },
  { id: 'emoji', section: '3.D', severity: 'warn', title: 'No emoji in visible text' },
  { id: 'neon-glow', section: '9.A', severity: 'warn', title: 'No neon outer glows' },
  { id: 'button-radius', section: '4.4', severity: 'warn', title: 'Buttons share one corner radius' },
  { id: 'image-alt', section: '6', severity: 'warn', title: 'Images have alt text' },
  { id: 'dark-mode', section: '6.C', severity: 'warn', title: 'Page responds to prefers-color-scheme: dark' },
];

// Runs inside the page. Must stay self-contained: Playwright serializes it.
// `desktop` enables the checks the skill scopes to desktop widths.
export function probe({ desktop }) {
  const findings = [];
  const skipped = [];
  const add = (rule, message, el) => findings.push({ rule, message, where: el ? describe(el) : '' });

  function describe(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
    const text = (el.innerText || el.getAttribute('alt') || '').trim().replace(/\s+/g, ' ');
    return text ? `${s} "${text.slice(0, 50)}"` : s;
  }

  const styleOf = (el) => getComputedStyle(el);

  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = styleOf(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    return true;
  }

  // Any CSS color (rgb, oklch, color-mix...) -> [r, g, b, a] via a 1x1 canvas.
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const colorCache = new Map();
  function rgba(color) {
    if (colorCache.has(color)) return colorCache.get(color);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    const out = [r, g, b, a / 255];
    colorCache.set(color, out);
    return out;
  }
  const over = (top, bottom) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1);
  };

  // Solid color actually painted behind `el`, or null when an image or
  // gradient sits in the stack and the color cannot be known.
  function backgroundBehind(el) {
    const layers = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = styleOf(e);
      if (s.backgroundImage !== 'none') return null;
      const c = rgba(s.backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] === 1) break;
    }
    let base = [255, 255, 255, 1];
    for (const layer of layers.reverse()) base = over(layer, base);
    return base;
  }

  function luminance([r, g, b]) {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function contrast(fg, bg) {
    const a = luminance(over(fg, bg));
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }
  function requiredContrast(el) {
    const s = styleOf(el);
    const size = parseFloat(s.fontSize);
    return size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700) ? 3 : 4.5;
  }

  function lineCount(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
    rects.sort((a, b) => a.top - b.top);
    let lines = 0;
    let lastBottom = -Infinity;
    for (const r of rects) {
      if (r.top + r.height / 2 > lastBottom) lines++;
      lastBottom = Math.max(lastBottom, r.bottom);
    }
    return lines;
  }

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  const wordCount = (text) => [...segmenter.segment(text)].filter((s) => s.isWordLike).length;

  // Reveal-on-scroll content that never appeared. Checked before the visibility
  // filter below, which would otherwise hide it from every other rule.
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || !el.innerText?.trim() || el.closest('[aria-hidden="true"]')) continue;
    if (Number(styleOf(el).opacity) === 0 && Number(styleOf(el.parentElement).opacity) !== 0) {
      add('stuck-invisible', 'opacity is still 0', el);
    }
  }

  const all = [document.body, ...document.body.querySelectorAll('*')].filter(
    (el) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName) && visible(el),
  );
  const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const textEls = all.filter(hasOwnText);

  // ---- Copy -------------------------------------------------------------
  const strings = textEls.map((el) => ({
    el,
    text: [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim(),
  }));
  for (const el of all) {
    for (const attr of ['alt', 'aria-label', 'placeholder', 'title']) {
      const v = el.getAttribute(attr);
      if (v && v.trim()) strings.push({ el, text: v.trim() });
    }
  }
  const copyBans = [
    [/\b(elevate|seamless(ly)?|unleash|next-gen|revolutioni[sz]e)\b/i, 'filler verb'],
    [/\b(john|jane) doe\b/i, 'generic name'],
    [/\b(acme|nexus|smartflow|cloudly)\b/i, 'slop brand name'],
    [/\bquietly (in use at|trusted by)\b/i, 'marketing tell'],
  ];
  for (const { el, text } of strings) {
    if (/[—–]/.test(text)) add('em-dash', `"${text.slice(0, 60)}"`, el);
    if (/\p{Extended_Pictographic}/u.test(text)) add('emoji', `"${text.slice(0, 60)}"`, el);
    for (const [re, kind] of copyBans) {
      const m = text.match(re);
      if (m) add('banned-copy', `${kind}: "${m[0]}"`, el);
    }
    if (/^[↓\s]*scroll(\s+to\s+.+|\s+down)?[↓\s]*$/i.test(text)) add('scroll-cue', `"${text}"`, el);
    if (/^(step|stage|phase|pass)\s+(0?\d|one|two|three)\b/i.test(text)) add('generic-step-label', `"${text.slice(0, 40)}"`, el);
  }

  // ---- Fonts, color, cursor, glow ---------------------------------------
  const fonts = new Map();
  let blackCount = 0;
  let blackExample = null;
  for (const el of all) {
    const s = styleOf(el);
    // Cursor inherits, so report only where it is first set.
    if (s.cursor.includes('url(') && (el === document.body || styleOf(el.parentElement).cursor !== s.cursor)) {
      add('custom-cursor', 'cursor uses a custom image', el);
    }
    const bg = rgba(s.backgroundColor);
    const isBlack = (c) => c[3] === 1 && c[0] === 0 && c[1] === 0 && c[2] === 0;
    if (isBlack(bg) || (hasOwnText(el) && isBlack(rgba(s.color)))) {
      blackCount++;
      blackExample ??= el;
    }
    if (hasOwnText(el)) {
      const family = s.fontFamily.split(',')[0].trim().replace(/["']/g, '').toLowerCase();
      if (!fonts.has(family)) fonts.set(family, el);
    }
    const glow = s.boxShadow !== 'none' && s.boxShadow.match(/^(.+?\)|#\w+|\w+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/);
    if (glow) {
      const c = rgba(glow[1]);
      const saturated = Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) > 80;
      if (saturated && c[3] >= 0.3 && Number(glow[4]) >= 20) add('neon-glow', s.boxShadow.slice(0, 60), el);
    }
  }
  // Exact hex values the skill bans as the default premium-consumer palette.
  const bannedHex = [
    '#f5f1ea', '#f7f5f1', '#fbf8f1', '#efeae0', '#ece6db', '#faf7f1', '#e8dfcb',
    '#b08947', '#b6553a', '#9a2436', '#9c6e2a', '#bc7c3a', '#7d5621',
    '#1a1714', '#1a1814', '#1b1814',
  ];
  const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  const paletteHits = new Map();
  for (const el of all) {
    const s = styleOf(el);
    const used = [s.backgroundColor, s.borderTopColor, s.borderLeftColor];
    if (hasOwnText(el)) used.push(s.color);
    for (const c of used) {
      const v = rgba(c);
      if (v[3] < 1) continue;
      const h = hex(v);
      if (bannedHex.includes(h) && !paletteHits.has(h)) paletteHits.set(h, el);
    }
  }
  for (const [h, el] of paletteHits) add('premium-palette', `uses ${h}`, el);

  if (blackCount) add('pure-black', `${blackCount} element(s) use #000000`, blackExample);
  for (const [family, el] of fonts) {
    if (family === 'fraunces' || family === 'instrument serif') add('banned-font', family, el);
    if (family === 'inter') add('inter-default', 'Inter is the first font in the stack', el);
  }
  for (const h of all.filter((el) => /^H[12]$/.test(el.tagName))) {
    const s = styleOf(h);
    if (s.backgroundImage.includes('gradient') && (s.webkitBackgroundClip === 'text' || s.backgroundClip === 'text')) {
      add('gradient-headline', 'gradient clipped to text', h);
    }
  }

  // ---- Layout -----------------------------------------------------------
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) {
    const widest = all.reduce((a, b) => (b.getBoundingClientRect().right > a.getBoundingClientRect().right ? b : a));
    add('overflow-x', `page is ${document.documentElement.scrollWidth}px wide in a ${vw}px viewport`, widest);
  }

  for (const img of all.filter((el) => el.tagName === 'IMG')) {
    if (img.complete && img.naturalWidth === 0) add('broken-image', img.getAttribute('src') || '(no src)', img);
    if (!img.hasAttribute('alt')) add('image-alt', img.getAttribute('src') || '(no src)', img);
  }

  // ---- Buttons ----------------------------------------------------------
  const isButtonLike = (el) => {
    if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') return true;
    if (el.tagName === 'INPUT') return ['submit', 'button'].includes(el.type);
    if (el.tagName !== 'A') return false;
    const s = styleOf(el);
    const boxed = rgba(s.backgroundColor)[3] > 0 || (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none');
    return boxed && parseFloat(s.paddingLeft) >= 8;
  };
  const buttons = all.filter(isButtonLike);
  const labelOf = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');

  const radii = new Map();
  for (const b of buttons) {
    const bg = backgroundBehind(b);
    if (bg && labelOf(b)) {
      const ratio = contrast(rgba(styleOf(b).color), bg);
      const need = requiredContrast(b);
      if (ratio < need) add('cta-contrast', `contrast ${ratio.toFixed(2)}:1, needs ${need}:1`, b);
    }
    if (desktop && b.tagName !== 'INPUT' && lineCount(b) > 1) add('cta-wrap', `label wraps to ${lineCount(b)} lines`, b);
    const radius = styleOf(b).borderTopLeftRadius;
    if (!radii.has(radius)) radii.set(radius, b);
  }
  if (radii.size > 1) add('button-radius', `buttons use ${radii.size} radii: ${[...radii.keys()].join(', ')}`, [...radii.values()][1]);

  const intents = {
    contact: /^(get in touch|contact( us)?|let'?s talk|start a project|start something|reach out|talk to us|book a call)$/i,
    signup: /^(try( it)?( for)? free|get started( free)?|sign up( free)?|start free( trial)?|create( an)? account)$/i,
    portfolio: /^(view( selected)? work|see( selected)? work|browse projects|see projects)$/i,
  };
  for (const [intent, re] of Object.entries(intents)) {
    const labels = new Set(buttons.map(labelOf).filter((l) => re.test(l)).map((l) => l.toLowerCase()));
    if (labels.size > 1) add('cta-duplicate-intent', `${intent} intent has ${labels.size} labels: ${[...labels].join(' / ')}`);
  }

  // ---- Forms ------------------------------------------------------------
  const fields = all.filter(
    (el) => (el.tagName === 'INPUT' && !['submit', 'button', 'hidden', 'checkbox', 'radio'].includes(el.type)) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT',
  );
  for (const field of fields) {
    const label = (field.id && document.querySelector(`label[for="${CSS.escape(field.id)}"]`)) || field.closest('label');
    if (!label || !visible(label)) add('form-label', 'no visible <label>', field);
    const bg = backgroundBehind(field);
    if (!bg) continue;
    const textRatio = contrast(rgba(styleOf(field).color), bg);
    if (textRatio < 4.5) add('form-contrast', `input text contrast ${textRatio.toFixed(2)}:1`, field);
    if (field.placeholder) {
      const ratio = contrast(rgba(getComputedStyle(field, '::placeholder').color), bg);
      if (ratio < 4.5) add('form-contrast', `placeholder contrast ${ratio.toFixed(2)}:1`, field);
    }
    if (label && visible(label)) {
      const labelBg = backgroundBehind(label);
      const ratio = labelBg ? contrast(rgba(styleOf(label).color), labelBg) : Infinity;
      if (ratio < 4.5) add('form-contrast', `label contrast ${ratio.toFixed(2)}:1`, label);
    }
  }

  // ---- Eyebrows and sections --------------------------------------------
  const sections = all.filter((el) => el.tagName === 'SECTION' && !el.parentElement.closest('section'));
  const sectionCount = sections.length || all.filter((el) => el.tagName === 'H2').length + 1;
  const eyebrows = textEls.filter((el) => {
    const s = styleOf(el);
    const size = parseFloat(s.fontSize);
    const next = el.nextElementSibling;
    return (
      s.textTransform === 'uppercase' && size <= 14 && parseFloat(s.letterSpacing) / size >= 0.08 &&
      el.innerText.trim().length <= 48 && next && /^H[1-4]$/.test(next.tagName)
    );
  });
  const eyebrowLimit = Math.ceil(sectionCount / 3);
  if (eyebrows.length > eyebrowLimit) {
    add('eyebrow-count', `${eyebrows.length} eyebrows across ${sectionCount} sections, limit ${eyebrowLimit}`, eyebrows[eyebrowLimit]);
  }
  for (const el of eyebrows) {
    if (/^\d{2,3}\s*[/·.\-]/.test(el.innerText.trim())) add('section-number-eyebrow', `"${el.innerText.trim()}"`, el);
  }

  if (!desktop) return { findings, skipped };

  // ---- Desktop-only: cards, nav, hero -----------------------------------
  for (const el of all) {
    const display = styleOf(el).display;
    if (!display.includes('grid') && !display.includes('flex')) continue;
    const kids = [...el.children].filter(visible);
    if (kids.length !== 3) continue;
    const rects = kids.map((k) => k.getBoundingClientRect());
    const same = (a, b) => Math.abs(a - b) <= 2;
    const identical = rects.every((r) => r.width >= 200 && same(r.width, rects[0].width) && same(r.top, rects[0].top));
    if (identical && kids.every((k) => k.querySelector('h2, h3, h4') && k.querySelector('p'))) {
      add('three-equal-cards', `three ${Math.round(rects[0].width)}px columns, each heading + text`, el);
    }
  }

  const nav = all.find((el) => el.tagName === 'NAV');
  if (!nav) skipped.push('nav-single-line', 'nav-height');
  else {
    const bar = nav.closest('header') || nav;
    const height = bar.getBoundingClientRect().height;
    if (height > 80) add('nav-height', `navigation is ${Math.round(height)}px tall`, bar);
    const items = [...bar.querySelectorAll('a, button')].filter(visible).map((el) => el.getBoundingClientRect());
    const oneLine = Math.max(...items.map((r) => r.top)) < Math.min(...items.map((r) => r.bottom));
    if (items.length > 1 && !oneLine) add('nav-single-line', 'navigation items sit on more than one line', bar);
    for (const el of [...bar.querySelectorAll('a')].filter(visible)) {
      if (lineCount(el) > 1) add('nav-single-line', 'navigation label wraps', el);
    }
  }

  const h1 = all.find((el) => el.tagName === 'H1');
  if (!h1) skipped.push('hero-headline-lines', 'hero-subtext-words', 'hero-cta-in-viewport');
  else {
    const lines = lineCount(h1);
    if (lines > 2) add('hero-headline-lines', `headline runs to ${lines} lines`, h1);
    const hero = h1.closest('section, header') || h1.parentElement;
    const sub = [...hero.querySelectorAll('p')].find(
      (p) => visible(p) && h1.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING && !eyebrows.includes(p),
    );
    if (!sub) skipped.push('hero-subtext-words');
    else if (wordCount(sub.innerText) > 20) add('hero-subtext-words', `subtext is ${wordCount(sub.innerText)} words`, sub);
    const cta = buttons.find((b) => hero.contains(b) && !b.closest('nav'));
    if (!cta) skipped.push('hero-cta-in-viewport');
    else {
      const bottom = cta.getBoundingClientRect().bottom + window.scrollY;
      if (bottom > window.innerHeight) add('hero-cta-in-viewport', `CTA ends at ${Math.round(bottom)}px, viewport is ${window.innerHeight}px`, cta);
    }
  }

  return { findings, skipped };
}
