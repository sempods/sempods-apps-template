#!/usr/bin/env node
// Checks the template tooling itself: the script tests and the Markdown links
// of every document. The template repository runs it in CI; a copy's check
// covers only the owner's apps. self-test.mjs exercises the tooling in an
// isolated copy.
// Usage: node .sempods/scripts/check-tooling.mjs
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { checkLinks } from './lib/links.mjs';
import { TOOLING } from './lib/paths.mjs';

const root = join(TOOLING, '..');
let failed = false;
const step = (label, ok) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failed = true;
};

const tests = spawnSync(
  process.execPath,
  ['--test', '.sempods/scripts/test/*.test.mjs'],
  { cwd: root, stdio: 'inherit' },
);
step('script tests', tests.status === 0);
step(
  'Markdown links',
  await checkLinks(root).catch((error) => {
    console.error(error.message);
    return false;
  }),
);

if (failed) {
  console.error('\ntooling check failed.');
  process.exit(1);
}
console.log('\ntooling check passed.');
