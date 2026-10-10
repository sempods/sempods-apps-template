#!/usr/bin/env node
// Tests the template tooling in an isolated copy of the repository, so the
// owner's apps and apps.json are never touched and a fixture can never collide
// with a real app: generate an app, require a refused rerun without changes,
// check it including a standalone install/build, then publish it: configure a
// site, build it and assert the profile each build mode selects.
// Usage: node packages/apps/maintainer/self-test.mjs
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../scripts/lib/json.mjs';
import { pnpm } from '../scripts/lib/pnpm.mjs';

const FIXTURE = 'self-test';
const root = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

function run(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }).status;
}

// The runtime options a mode selects, asserted inside the fixture's own test
// runner: the bundle holds every profile, so only the selection proves one.
const PROFILE_TEST = `import { expect, it } from 'vitest';
import { profile, runtimeOptions } from './sempods.generated.ts';

it('selects the profile of the build mode', () => {
  const expected = JSON.parse(process.env.SEMPODS_EXPECTED ?? 'null');
  expect(profile).toBe(expected.profile);
  expect(runtimeOptions.identity.kind).toBe(expected.kind);
  expect(runtimeOptions.development).toBe(expected.development);
  if (expected.clientId) {
    expect(runtimeOptions.identity).toEqual({
      kind: 'did-web',
      clientId: expected.clientId,
      redirectUri: expected.redirectUri,
    });
  }
});
`;

/** Configures a site, builds it for real and checks the profiles. */
function publish(copy) {
  const dir = join(copy, 'apps', FIXTURE);
  // Relative to the copy, as the other script runs: the temporary directory
  // can sit behind a symlink.
  const scripts = join('packages', 'apps', 'scripts');
  const production = 'https://apps.example.org';
  const preview = 'https://preview--apps.example.org';
  // check built the local profile into dist/; build-site must leave it there.
  const assets = (path) => readdirSync(join(path, 'assets')).sort();
  const localBuild = assets(join(dir, 'dist')).join();
  // One real build; the routing per host is covered by build-site's tests.
  const configure = [join(scripts, 'configure-site.mjs'), '--host', 'static'];
  configure.push('--production', production, '--preview', preview);
  if (run(process.execPath, configure, copy) !== 0)
    throw new Error('configure-site failed');
  if (run(process.execPath, [join(scripts, 'build-site.mjs')], copy) !== 0)
    throw new Error('build-site failed');
  const site = join(copy, 'site-dist');
  for (const file of [
    'index.html',
    '404.html',
    `${FIXTURE}/index.html`,
    `${FIXTURE}/callback.html`,
    `${FIXTURE}/sw.js`,
    `${FIXTURE}/manifest.webmanifest`,
    `${FIXTURE}/licenses/app-sdk/NOTICE`,
  ])
    if (!existsSync(join(site, file)))
      throw new Error(`build-site wrote no ${file}`);
  const did = readJson(join(site, FIXTURE, 'did.json'));
  if (did.id !== `did:web:apps.example.org:${FIXTURE}`)
    throw new Error(`unexpected did.json id ${did.id}`);
  if (assets(join(dir, 'dist')).join() !== localBuild)
    throw new Error('build-site changed the local build in dist/');
  // The shipped bundle itself must select the profile: Vite inlines the build
  // mode as the key that picks it (`production` in a plain build).
  const SELECTS_PRODUCTION = /\[\s*[`'"]sempods-production[`'"]\s*\]/;
  const selects = (path) =>
    assets(path)
      .filter((file) => file.endsWith('.js'))
      .some((file) =>
        SELECTS_PRODUCTION.test(
          readFileSync(join(path, 'assets', file), 'utf8'),
        ),
      );
  if (!selects(join(site, FIXTURE)))
    throw new Error('the site bundle does not select the production profile');
  if (selects(join(dir, 'dist')))
    throw new Error('the local bundle selects a published profile');

  const test = join(dir, 'src', 'site-profile.test.ts');
  writeFileSync(test, PROFILE_TEST);
  const callback = (origin) => `${origin}/${FIXTURE}/callback`;
  const cases = [
    [[], { profile: 'local', kind: 'dynamic', development: 'loopback-http' }],
    [
      ['--mode', 'sempods-production'],
      {
        profile: 'production',
        kind: 'did-web',
        clientId: `did:web:apps.example.org:${FIXTURE}`,
        redirectUri: callback(production),
      },
    ],
    [
      ['--mode', 'sempods-preview'],
      {
        profile: 'preview',
        kind: 'did-web',
        clientId: `did:web:preview--apps.example.org:${FIXTURE}`,
        redirectUri: callback(preview),
      },
    ],
  ];
  try {
    for (const [args, expected] of cases) {
      const result = pnpm(
        ['exec', 'vitest', 'run', 'src/site-profile.test.ts', ...args],
        {
          cwd: dir,
          env: { ...process.env, SEMPODS_EXPECTED: JSON.stringify(expected) },
        },
      );
      if (result.status !== 0)
        throw new Error(`the ${expected.profile} profile was not selected`);
    }
  } finally {
    rmSync(test);
  }
  console.log('✓ site build and profile selection');
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
  const newApp = join('packages', 'apps', 'scripts', 'new-app.mjs');
  if (
    run(process.execPath, [newApp, FIXTURE, '--title', 'Self test'], copy) !== 0
  )
    throw new Error('new-app could not create the fixture');
  // Verify the executable pnpm selects, not just the installed package version.
  // Different root/app compiler versions must not let a workspace build
  // silently run the root's older compiler.
  const expectedCompiler = readJson(join(copy, 'apps', FIXTURE, 'package.json')).devDependencies.typescript;
  const compiler = pnpm(['exec', 'tsc', '--version'], {
    cwd: join(copy, 'apps', FIXTURE),
    encoding: 'utf8',
    stdio: 'pipe',
  });
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
  const check = join('packages', 'apps', 'scripts', 'check.mjs');
  if (run(process.execPath, [check, '--standalone', FIXTURE], copy) !== 0)
    throw new Error('check failed for the fixture');
  publish(copy);
} catch (error) {
  console.error(`self-test: ${error.message}`);
  failed = true;
} finally {
  rmSync(copy, { recursive: true, force: true });
}
console.log(failed ? 'self-test failed.' : 'self-test passed.');
process.exit(failed ? 1 : 0);
