// Tests the tester: the clean fixture must pass every rule, and the broken
// fixture must trip every rule. Run with `node --test`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { audit } from './preflight.mjs';
import { RULES } from './checks.mjs';

const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const flagged = (report) => report.rules.filter((r) => r.status === 'fail' || r.status === 'warn').map((r) => r.id);

test('a page that follows the skill passes every rule', async () => {
  const report = await audit(fixture('pass.html'));
  assert.deepEqual(flagged(report), []);
  assert.equal(report.summary.skip, 0, 'every rule should apply to the fixture');
});

test('a page that breaks the skill trips every rule', async () => {
  const report = await audit(fixture('fail.html'));
  assert.deepEqual(flagged(report).sort(), RULES.map((r) => r.id).sort());
});
