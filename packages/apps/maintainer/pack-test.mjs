#!/usr/bin/env node
// Acceptance test of the packed tooling package: pack it, check what the
// tarball contains, install it into a fresh repository without any template
// files, then create an app, check, regenerate, configure a site and build it.
// The shared-file snapshot must be complete in the tarball and in the
// installation, and update-template must refuse the installed package.
// Source-workspace tests alone can miss a file the package forgets to ship or
// a dependency only the template root provides. Needs the npm registry.
// Usage: node packages/apps/maintainer/pack-test.mjs
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJson, writeJson } from '../scripts/lib/json.mjs';
import { TOOLING } from '../scripts/lib/paths.mjs';
import { SDK } from '../scripts/lib/sdk.mjs';
import { baselineSnapshot, readSnapshot } from '../scripts/lib/shared.mjs';

const root = join(TOOLING, '..', '..');
// Files the CLI needs at run time, and sources that must stay out.
const REQUIRED = [
  'package.json',
  'bin/sempods-apps.mjs',
  'scripts/check.mjs',
  'scripts/lib/paths.mjs',
  'skeleton/app/package.json',
  'skeleton/app/.oxlintrc.json',
  'instructions/app-workflow.md',
  'skills/app-workflow/SKILL.md',
  'shared/snapshot.json',
  'update-policy.json',
  'LICENSE',
];
const EXCLUDED = ['test/', 'maintainer/'];

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
  console.log(`✓ ${label}: ${Object.keys(files).length} shared files`);
}

const work = mkdtempSync(join(tmpdir(), 'sempods-pack-test-'));
try {
  run('pnpm', ['pack', '--pack-destination', work], TOOLING);
  const tarball = join(
    work,
    readdirSync(work).find((name) => name.endsWith('.tgz')),
  );
  const listed = run('tar', ['-tzf', tarball], work, true)
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
  const unpacked = join(work, 'unpacked');
  mkdirSync(unpacked);
  run('tar', ['-xzf', tarball, '-C', unpacked], work);
  checkSnapshot(join(unpacked, 'package'), 'tarball snapshot');

  // A repository with the owner's files only: no tooling sources, no
  // template documents.
  const repo = join(work, 'repo');
  mkdirSync(repo);
  const template = readJson(join(root, 'package.json'));
  writeJson(join(repo, 'package.json'), {
    name: 'pack-test',
    private: true,
    type: 'module',
    packageManager: template.packageManager,
    engines: template.engines,
    scripts: template.scripts,
    devDependencies: {
      ...Object.fromEntries(
        SDK.map((name) => [name, template.devDependencies[name]]),
      ),
      '@sempods/apps': `file:${tarball}`,
    },
  });
  cpSync(join(root, 'pnpm-workspace.yaml'), join(repo, 'pnpm-workspace.yaml'));
  cpSync(join(root, '.node-version'), join(repo, '.node-version'));
  writeFileSync(
    join(repo, 'apps.json'),
    '{\n  "schemaVersion": 1,\n  "apps": []\n}\n',
  );
  run('pnpm', ['install', '--no-frozen-lockfile'], repo);
  checkSnapshot(
    join(repo, 'node_modules', '@sempods', 'apps'),
    'installed snapshot',
  );
  run('pnpm', ['run', 'new-app', 'demo', '--title', 'Demo'], repo);
  run('pnpm', ['run', 'check', '--standalone', 'demo'], repo);
  run('pnpm', ['run', 'regenerate'], repo);
  run(
    'pnpm',
    [
      'run',
      'configure-site',
      '--production',
      'https://apps.example.org',
      '--host',
      'static',
    ],
    repo,
  );
  run('pnpm', ['run', 'build-site'], repo);
  for (const path of ['site-dist/index.html', 'site-dist/demo/did.json'])
    if (!existsSync(join(repo, path)))
      throw new Error(`build-site wrote no ${path}`);
  for (const path of ['.sempods', 'packages'])
    if (existsSync(join(repo, path)))
      throw new Error(`the repository must not need ${path}`);
  console.log('✓ installed package creates, checks and builds an app');
  const update = spawnSync('pnpm', ['run', 'update-template'], {
    cwd: repo,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (
    update.status === 0 ||
    !/not supported yet/.test(`${update.stdout}${update.stderr}`)
  )
    throw new Error('update-template must refuse the installed package');
  console.log('✓ update-template refuses the installed package');
  console.log('\npack test passed.');
} catch (error) {
  console.error(`pack-test: ${error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
