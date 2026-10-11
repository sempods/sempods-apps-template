#!/usr/bin/env node
// Checks the tooling itself: the script tests and the Markdown links of every
// document. This repository runs it in CI; an owner repository's check covers
// only its apps. self-test.mjs exercises the packed tooling in a repository
// created from the starter.
// Usage: node packages/apps/maintainer/check-tooling.mjs
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { TOOLING } from '../scripts/lib/paths.mjs';
import { checkLinks } from './lib/links.mjs';

const root = join(TOOLING, '..', '..');
let failed = false;
const step = (label, ok) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failed = true;
};

const tests = spawnSync(
  process.execPath,
  ['--test', 'packages/apps/test/*.test.mjs'],
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
