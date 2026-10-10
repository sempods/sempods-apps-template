#!/usr/bin/env node
// Acceptance test of the packed packages, as an owner gets them: pack
// @sempods/apps and @sempods/create-apps, check what the tarball contains,
// create a repository with the creator, install the tooling from its tarball,
// then create an app, refuse a rerun, check it including a standalone
// install/build, regenerate, configure a site, build it and assert the
// profile each build mode selects. Source-workspace tests alone can miss a
// file the package forgets to ship or a dependency only this repository
// provides. Needs the npm registry.
// Usage: pnpm run self-test
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
import { join } from 'node:path';
import { readJson, writeJson } from '../scripts/lib/json.mjs';
import { TOOLING } from '../scripts/lib/paths.mjs';
import { pnpm } from '../scripts/lib/pnpm.mjs';
import {
  baselineSnapshot,
  readBaseline,
  readSnapshot,
} from '../scripts/lib/shared.mjs';
import { checkLinks } from './lib/links.mjs';

const FIXTURE = 'self-test';
const CREATOR = join(TOOLING, '..', 'create-apps');
// Files the CLI needs at run time, and sources that must stay out.
const REQUIRED = [
  'package.json',
  'bin/sempods-apps.mjs',
  'scripts/check.mjs',
  'scripts/create.mjs',
  'scripts/lib/paths.mjs',
  'skeleton/app/package.json',
  'skeleton/app/.oxlintrc.json',
  'instructions/app-workflow.md',
  'instructions/setup.md',
  'skills/app-workflow/SKILL.md',
  'shared/snapshot.json',
  'update-policy.json',
  'LICENSE',
];
const EXCLUDED = ['test/', 'maintainer/', 'starter/'];

function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}`);
  return result.stdout;
}
const pnpmRun = (repo, ...args) => run('pnpm', ['run', ...args], repo);

function pack(dir, out) {
  const before = new Set(readdirSync(out));
  run('pnpm', ['pack', '--pack-destination', out], dir);
  return join(
    out,
    readdirSync(out).find((name) => !before.has(name) && name.endsWith('.tgz')),
  );
}

function unpack(tarball, dir) {
  mkdirSync(dir, { recursive: true });
  run('tar', ['-xzf', tarball, '-C', dir], dir);
  return join(dir, 'package');
}

/** The snapshot an unpacked package ships, resolved as a baseline would be. */
function checkSnapshot(dir, label) {
  const { version } = readJson(join(dir, 'package.json'));
  const { revision, files } = readSnapshot(join(dir, 'shared'));
  baselineSnapshot(
    { version, revision },
    {
      installed: dir,
      download: () => {
        throw new Error('the installed version needs no download');
      },
    },
  );
  console.log(`✓ ${label}: ${Object.keys(files).length} starter files`);
  return revision;
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
function publish(repo) {
  const dir = join(repo, 'apps', FIXTURE);
  const production = 'https://apps.example.org';
  const preview = 'https://preview--apps.example.org';
  // check built the local profile into dist/; build-site must leave it there.
  const assets = (path) => readdirSync(join(path, 'assets')).sort();
  const localBuild = assets(join(dir, 'dist')).join();
  // One real build; the routing per host is covered by build-site's tests.
  pnpmRun(
    repo,
    'configure-site',
    '--host',
    'static',
    '--production',
    production,
    '--preview',
    preview,
  );
  pnpmRun(repo, 'build-site');
  const site = join(repo, 'site-dist');
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

const work = mkdtempSync(join(tmpdir(), 'sempods-self-test-'));
let failed = false;
try {
  const tooling = pack(TOOLING, work);
  const creator = pack(CREATOR, work);
  const listed = run('tar', ['-tzf', tooling], work, true)
    .split('\n')
    .filter(Boolean)
    .map((entry) => entry.replace(/^package\//, ''));
  const missing = REQUIRED.filter((file) => !listed.includes(file));
  const leaked = listed.filter((file) =>
    EXCLUDED.some((prefix) => file.startsWith(prefix)),
  );
  if (missing.length || leaked.length)
    throw new Error(
      `tarball: missing ${missing.join(', ') || 'nothing'}; must not contain ${leaked.join(', ') || 'nothing'}`,
    );
  console.log(`✓ tarball contents (${listed.length} files)`);
  const unpacked = unpack(tooling, join(work, 'unpacked'));
  const revision = checkSnapshot(unpacked, 'tarball snapshot');
  // Packaged instructions and skills link only within the package.
  if (!(await checkLinks(unpacked)))
    throw new Error('links in the packed package do not resolve');
  console.log('✓ links inside the package');

  // pnpm create @sempods/apps runs the creator with its exact @sempods/apps.
  const runner = join(work, 'runner', 'node_modules', '@sempods');
  cpSync(unpack(tooling, join(work, 'u-apps')), join(runner, 'apps'), {
    recursive: true,
  });
  cpSync(unpack(creator, join(work, 'u-create')), join(runner, 'create-apps'), {
    recursive: true,
  });
  const repo = join(work, 'my-apps');
  run(process.execPath, [join(runner, 'create-apps', 'index.mjs'), repo], work);
  const { version } = readJson(join(TOOLING, 'package.json'));
  const baseline = readBaseline(repo);
  if (baseline?.version !== version || baseline.revision !== revision)
    throw new Error('the new repository records another baseline');
  for (const path of ['LICENSE', 'CONTRIBUTING.md', 'packages', '.sempods'])
    if (existsSync(join(repo, path)))
      throw new Error(`the new repository must not contain ${path}`);
  if (!(await checkLinks(repo)))
    throw new Error('links in the new repository do not resolve');
  console.log('✓ creator writes the starter and its baseline');

  // The version is not on the registry yet: install it from its tarball.
  const manifest = readJson(join(repo, 'package.json'));
  manifest.devDependencies['@sempods/apps'] = `file:${tooling}`;
  writeJson(join(repo, 'package.json'), manifest);
  run('pnpm', ['install', '--no-frozen-lockfile'], repo);
  checkSnapshot(
    join(repo, 'node_modules', '@sempods', 'apps'),
    'installed snapshot',
  );

  pnpmRun(repo, 'new-app', FIXTURE, '--title', 'Self test');
  // Verify the executable pnpm selects, not just the installed package
  // version: the tooling's TypeScript 6 must not shadow the app's compiler.
  const app = join(repo, 'apps', FIXTURE);
  const expected = readJson(join(app, 'package.json')).devDependencies
    .typescript;
  const compiler = pnpm(['exec', 'tsc', '--version'], {
    cwd: app,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (compiler.status !== 0 || compiler.stdout.trim() !== `Version ${expected}`)
    throw new Error(
      `app compiler: expected ${expected}, got ${compiler.stdout.trim() || compiler.stderr.trim()}`,
    );
  const before = readFileSync(join(repo, 'apps.json'), 'utf8');
  const rerun = spawnSync(
    'pnpm',
    ['run', 'new-app', FIXTURE, '--skip-install'],
    { cwd: repo, stdio: 'ignore', shell: process.platform === 'win32' },
  );
  if (rerun.status === 0) throw new Error('a rerun of new-app must be refused');
  if (readFileSync(join(repo, 'apps.json'), 'utf8') !== before)
    throw new Error('a refused rerun changed apps.json');
  pnpmRun(repo, 'check', '--standalone', FIXTURE);
  pnpmRun(repo, 'regenerate');
  console.log('✓ installed package creates and checks an app');
  publish(repo);

  // The starter offers no update-template script; the command still says why.
  const update = spawnSync(
    'pnpm',
    ['exec', 'sempods-apps', 'update-template'],
    { cwd: repo, encoding: 'utf8', shell: process.platform === 'win32' },
  );
  if (
    update.status === 0 ||
    !/not supported yet/.test(`${update.stdout}${update.stderr}`)
  )
    throw new Error('update-template must refuse the installed package');
  console.log('✓ update-template refuses the installed package');
} catch (error) {
  console.error(`self-test: ${error.message}`);
  failed = true;
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(failed ? 'self-test failed.' : 'self-test passed.');
process.exit(failed ? 1 : 0);
