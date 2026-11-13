# Pre-flight audit

Opens a rendered page in Chromium with Playwright and checks the part of the
taste-skill Pre-Flight Check (`skills/taste-skill/SKILL.md`, section 14) that a
machine can verify. Use it on any page the skill generated.

## Run

```bash
cd tests/preflight
npm install && npx playwright install chromium   # first time only

node preflight.mjs http://localhost:3000          # a running dev server
node preflight.mjs path/to/page.html              # or a static file
```

It prints one line per rule, writes `report.json` plus full-page screenshots to
`preflight-report/` (change with `--out <dir>`), and exits `1` if any hard rule
fails, so it can gate CI.

The page is loaded four times: desktop light, desktop dark, mobile (390px), and
desktop with `prefers-reduced-motion: reduce`.

## What it checks

32 rules, listed with their SKILL.md section in `checks.mjs`. In short:

- **Copy**: em-dashes, filler verbs, generic names, scroll cues, step labels, emoji.
- **Layout**: horizontal overflow, nav height and wrapping, hero headline lines,
  hero subtext length, hero CTA above the fold, eyebrow count, three equal cards.
- **Contrast**: button text, form text, placeholders, and labels against WCAG AA,
  in both light and dark mode.
- **Style bans**: banned fonts, pure black, gradient headlines, custom cursors,
  neon glows, mixed button radii.
- **Behaviour**: window scroll listeners, animations that keep looping under
  reduced motion, uncaught JS errors, broken images, missing dark mode.

`FAIL` rules are hard bans in the skill. `WARN` rules are heuristics or rules
the skill allows a brief to override.

## What it does not check

Anything that needs judgment: whether the design direction fits the brief,
layout variety across sections, image quality, copy quality, motion that is
motivated. A green run means the page avoided the measurable tells, not that it
is good. Contrast is skipped for text over images or gradients.

## Test the tester

```bash
npm test
```

`fixtures/pass.html` must pass every rule and `fixtures/fail.html` must trip
every rule. Add a violation to `fail.html` whenever you add a rule.
