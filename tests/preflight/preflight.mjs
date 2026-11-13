#!/usr/bin/env node
// Audits a rendered page against the mechanical part of the taste-skill
// Pre-Flight Check. Usage: node preflight.mjs <url | file.html> [--out <dir>]

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RULES, probe } from './checks.mjs';

// createRequire so a globally installed Playwright (NODE_PATH) also resolves.
const { chromium } = createRequire(import.meta.url)('playwright');

const VIEWS = [
  { name: 'desktop-light', viewport: { width: 1440, height: 900 }, colorScheme: 'light', desktop: true },
  { name: 'desktop-dark', viewport: { width: 1440, height: 900 }, colorScheme: 'dark', desktop: true },
  { name: 'mobile-light', viewport: { width: 390, height: 844 }, colorScheme: 'light', desktop: false, isMobile: true },
];

const toUrl = (target) => (/^[a-z]+:\/\//i.test(target) ? target : pathToFileURL(path.resolve(target)).href);

// Scroll through the page so scroll-triggered reveals fire, then wait for
// their transitions to finish before anything is measured or captured.
async function settle(page) {
  await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)));
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight / 2) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await frame();
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    await frame();
    const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.race([
      Promise.allSettled(finite.map((a) => a.finished)),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    await document.fonts.ready;
  });
}

export async function audit(target, { outDir } = {}) {
  const url = toUrl(target);
  const browser = await chromium.launch();
  const found = new Map(); // `${rule}|${message}|${where}` -> finding with views[]
  const skipped = new Set();
  const record = (view, f) => {
    const key = `${f.rule}|${f.message}|${f.where}`;
    if (!found.has(key)) found.set(key, { ...f, views: [] });
    found.get(key).views.push(view);
  };

  try {
    if (outDir) await mkdir(outDir, { recursive: true });
    const pageBackgrounds = {};

    for (const view of VIEWS) {
      const context = await browser.newContext({
        viewport: view.viewport,
        colorScheme: view.colorScheme,
        isMobile: view.isMobile,
        hasTouch: view.isMobile,
      });
      await context.addInitScript(() => {
        window.__scrollListeners = 0;
        const original = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, ...rest) {
          if (type === 'scroll' && (this === window || this === document)) window.__scrollListeners++;
          return original.call(this, type, ...rest);
        };
      });
      const page = await context.newPage();
      page.on('pageerror', (err) => record(view.name, { rule: 'page-error', message: err.message, where: '' }));
      await page.goto(url, { waitUntil: 'load' });
      await settle(page);

      const result = await page.evaluate(probe, { desktop: view.desktop });
      result.findings.forEach((f) => record(view.name, f));
      result.skipped.forEach((id) => skipped.add(id));

      const listeners = await page.evaluate(() => window.__scrollListeners);
      if (listeners > 0) record(view.name, { rule: 'scroll-listener', message: `${listeners} scroll listener(s) on window/document`, where: '' });

      pageBackgrounds[view.name] = await page.evaluate(() => {
        const opaque = (el) => {
          const c = getComputedStyle(el).backgroundColor;
          return c === 'rgba(0, 0, 0, 0)' || c === 'transparent' ? null : c;
        };
        return opaque(document.body) || opaque(document.documentElement) || 'rgb(255, 255, 255)';
      });

      if (outDir) await page.screenshot({ path: path.join(outDir, `${view.name}.png`), fullPage: true });
      await context.close();
    }

    if (pageBackgrounds['desktop-light'] === pageBackgrounds['desktop-dark']) {
      record('desktop-dark', { rule: 'dark-mode', message: `page background stays ${pageBackgrounds['desktop-light']} in dark mode`, where: 'body' });
    }

    // Reduced motion: nothing may still be looping.
    const context = await browser.newContext({ viewport: VIEWS[0].viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await settle(page);
    const looping = await page.evaluate(() =>
      document.getAnimations()
        .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity)
        .map((a) => {
          const el = a.effect.target;
          return `${a.animationName || 'animation'} on ${el ? el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(/\s+/)[0] : '') : 'unknown'}`;
        }),
    );
    for (const message of new Set(looping)) record('reduced-motion', { rule: 'reduced-motion', message, where: '' });
    await context.close();
  } finally {
    await browser.close();
  }

  const findings = [...found.values()];
  const rules = RULES.map((rule) => {
    const own = findings.filter((f) => f.rule === rule.id);
    const status = own.length ? rule.severity : skipped.has(rule.id) ? 'skip' : 'pass';
    return { ...rule, status, findings: own };
  });
  const count = (status) => rules.filter((r) => r.status === status).length;
  const report = {
    target: url,
    summary: { pass: count('pass'), fail: count('fail'), warn: count('warn'), skip: count('skip') },
    rules,
  };
  if (outDir) await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  return report;
}

export function format(report) {
  const mark = { pass: 'PASS', fail: 'FAIL', warn: 'WARN', skip: 'SKIP' };
  const lines = [`Pre-flight: ${report.target}`, ''];
  for (const status of ['fail', 'warn', 'skip', 'pass']) {
    for (const rule of report.rules.filter((r) => r.status === status)) {
      lines.push(`${mark[status]}  ${rule.title}  (§${rule.section}, ${rule.id})`);
      for (const f of rule.findings.slice(0, 5)) {
        lines.push(`      ${f.message}${f.where ? `  <- ${f.where}` : ''}  [${f.views.join(', ')}]`);
      }
      if (rule.findings.length > 5) lines.push(`      ...and ${rule.findings.length - 5} more`);
    }
  }
  const s = report.summary;
  lines.push('', `${s.pass} passed, ${s.fail} failed, ${s.warn} warnings, ${s.skip} not applicable`);
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const outFlag = args.indexOf('--out');
  const outDir = outFlag >= 0 ? args.splice(outFlag, 2)[1] : 'preflight-report';
  const target = args[0];
  if (!target) {
    console.error('Usage: node preflight.mjs <url | file.html> [--out <dir>]');
    process.exit(2);
  }
  if (!/^[a-z]+:\/\//i.test(target) && !existsSync(target)) {
    console.error(`File not found: ${target}`);
    process.exit(2);
  }
  const report = await audit(target, { outDir });
  console.log(format(report));
  console.log(`Report and screenshots: ${path.resolve(outDir)}`);
  process.exit(report.summary.fail ? 1 : 0);
}
