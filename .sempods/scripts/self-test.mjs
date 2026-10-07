#!/usr/bin/env node
// Tests the template tooling in an isolated copy of the repository, so the
// owner's apps and apps.json are never touched and a fixture can never collide
// with a real app: generate an app, require a refused rerun without changes,
// then check it including a standalone install/build.
// Usage: node .sempods/scripts/self-test.mjs
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = 'self-test';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function run(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }).status;
}

const tracked = spawnSync('git', ['ls-files', '-z'], {
  cwd: root,
  encoding: 'utf8',
});
if (tracked.status !== 0) {
  console.error('self-test: needs a git checkout of the repository');
  process.exit(2);
}

const copy = mkdtempSync(join(tmpdir(), 'sempods-self-test-'));
let failed = false;
try {
  for (const file of tracked.stdout.split('\0').filter(Boolean)) {
    if (file.startsWith('apps/')) continue;
    mkdirSync(dirname(join(copy, file)), { recursive: true });
    cpSync(join(root, file), join(copy, file));
  }
  mkdirSync(join(copy, 'apps'), { recursive: true });
  writeFileSync(
    join(copy, 'apps.json'),
    '{\n  "schemaVersion": 1,\n  "apps": []\n}\n',
  );
  const newApp = join('.sempods', 'scripts', 'new-app.mjs');
  if (
    run(process.execPath, [newApp, FIXTURE, '--title', 'Self test'], copy) !== 0
  )
    throw new Error('new-app could not create the fixture');
  // Verify the executable npm selects, not just the installed package version.
  // Different root/app compiler versions and npm bin collisions must not let
  // a workspace build silently run an older compiler.
  const expectedCompiler = JSON.parse(
    readFileSync(join(copy, 'apps', FIXTURE, 'package.json'), 'utf8'),
  ).devDependencies.typescript;
  const compiler = spawnSync(
    'npm',
    ['exec', '--workspace', `apps/${FIXTURE}`, '--', 'tsc', '--version'],
    { cwd: copy, encoding: 'utf8', shell: process.platform === 'win32' },
  );
  if (
    compiler.status !== 0 ||
    compiler.stdout.trim() !== `Version ${expectedCompiler}`
  )
    throw new Error(
      `workspace compiler: expected ${expectedCompiler}, got ${compiler.stdout.trim() || compiler.stderr.trim()}`,
    );
  console.log(`Workspace compiler: ${compiler.stdout.trim()}`);
  const before = readFileSync(join(copy, 'apps.json'), 'utf8');
  if (run(process.execPath, [newApp, FIXTURE, '--skip-install'], copy) === 0)
    throw new Error('a rerun of new-app must be refused');
  if (readFileSync(join(copy, 'apps.json'), 'utf8') !== before)
    throw new Error('a refused rerun changed apps.json');
  const check = join('.sempods', 'scripts', 'check.mjs');
  if (run(process.execPath, [check, '--standalone', FIXTURE], copy) !== 0)
    throw new Error('check failed for the fixture');
} catch (error) {
  console.error(`self-test: ${error.message}`);
  failed = true;
} finally {
  rmSync(copy, { recursive: true, force: true });
}
console.log(failed ? 'self-test failed.' : 'self-test passed.');
process.exit(failed ? 1 : 0);
