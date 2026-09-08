// Bundle the game into one self-contained HTML file (dist/index.html) that
// runs from a plain static host - GitHub Pages, a USB stick, an artifact.
// Online play needs server.js, so the build flags itself and disables it.
//   node scripts/build-single.mjs [--fragment out.html]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = (...p) => path.join(root, 'public', ...p);
const read = (f) => fs.readFileSync(f, 'utf8');

// Dependency order matters: each file may only use names defined above it.
const MODULES = ['parts', 'physics', 'ai', 'render', 'net', 'game', 'main'];

function stripModuleSyntax(src) {
  return src
    .replace(/^import\s[^\n]*\n/gm, '')
    .replace(/^export\s+\{[^}]*\};?\s*\n/gm, '')
    .replace(/^export\s+(?=(const|let|function|class)\b)/gm, '');
}

const seen = new Map();
const js = MODULES.map((name) => {
  const code = stripModuleSyntax(read(pub('js', `${name}.js`)));
  for (const m of code.matchAll(/^(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    if (seen.has(m[1])) throw new Error(`top-level name "${m[1]}" defined in both ${seen.get(m[1])}.js and ${name}.js`);
    seen.set(m[1], name);
  }
  return `// ---- ${name}.js ----\n${code}`;
}).join('\n\n');

const html = read(pub('index.html'));
const css = read(pub('css', 'style.css'));
const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('<script type="module"'));
const title = html.match(/<title>(.*?)<\/title>/)[1];
const favicon = html.match(/<link rel="icon"[^>]*>/)[0];
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com" />\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;800&display=swap" />';

const head = `<title>${title}</title>\n${fonts}\n<style>\n${css}\n</style>`;
const scripts = `<script>window.__STATIC_BUILD = true;</script>\n<script type="module">\n${js}\n</script>`;

const full = `<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8" />\n` +
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />\n` +
  `${favicon}\n${head}\n</head>\n<body>${body}${scripts}\n</body>\n</html>\n`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), full);
console.log(`dist/index.html  ${(full.length / 1024).toFixed(0)} KB`);

const fragIdx = process.argv.indexOf('--fragment');
if (fragIdx > -1) {
  const out = process.argv[fragIdx + 1];
  fs.writeFileSync(out, `${head}\n${body}${scripts}\n`);
  console.log(`${out}  (fragment, no html/head/body wrapper)`);
}
