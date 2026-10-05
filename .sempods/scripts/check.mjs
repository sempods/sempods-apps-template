#!/usr/bin/env node
// Checks the whole repository: manifest, generated configuration, the shared
// SDK version and its reference snapshot, declared dependencies, Markdown
// links, script tests, and lint, typecheck, build and tests of every app.
// Usage: npm run check [-- --standalone <id>]
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readApps } from './lib/apps.mjs';
import { staleGenerated } from './lib/generate.mjs';

const SDK = ['@sempods/app-sdk', '@sempods/client-sdk'];
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const BUILTIN = new Set(builtinModules);

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// Build output, installed packages and static files are not app source.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dev-dist', 'public']);

function sourceFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return SKIP_DIRS.has(name) || name.startsWith('.')
        ? []
        : sourceFiles(path);
    return SOURCE_EXT.test(name) ? [path] : [];
  });
}

let typescript;
function scanner() {
  // TypeScript's own import scanner: it skips comments and strings and finds
  // static and dynamic imports, re-exports and require() calls.
  typescript ??= createRequire(import.meta.url)('typescript');
  return typescript;
}

/** Package names imported by a source file (bare specifiers only). */
export function importedPackages(source) {
  const names = new Set();
  const { importedFiles } = scanner().preProcessFile(source, true, true);
  for (const { fileName: spec } of importedFiles) {
    if (/^(\.|\/|node:|virtual:|[a-z]+:\/\/)/.test(spec)) continue;
    const parts = spec.split('/');
    const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    if (!BUILTIN.has(name)) names.add(name);
  }
  return names;
}

/** Problems found without running any tool: manifest, generation, versions, imports. */
export function staticProblems(root) {
  const problems = [];
  let manifest;
  try {
    manifest = readApps(root);
  } catch (error) {
    return [error.message];
  }
  const appsDir = join(root, 'apps');
  // Every directory counts, with or without package.json: an unlisted one
  // would also block new-app for that ID.
  const dirs = existsSync(appsDir)
    ? readdirSync(appsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
    : [];
  for (const dir of dirs)
    if (!manifest.apps.some((app) => app.id === dir))
      problems.push(
        `apps/${dir} is not listed in apps.json; add it there or remove the directory`,
      );

  const snapshotFile = join(root, 'reference', 'sempods-sdk', 'source.json');
  const snapshot = existsSync(snapshotFile)
    ? readJson(snapshotFile).version
    : undefined;
  if (!snapshot)
    problems.push(
      'reference/sempods-sdk/source.json is missing; run the SDK snapshot',
    );
  const skeleton = readJson(
    join(root, '.sempods', 'skeleton', 'app', 'package.json'),
  );

  const versions = new Map();
  const expect = (where, pkg, version) => {
    if (!/^\d+\.\d+\.\d+$/.test(version ?? ''))
      problems.push(
        `${where}: ${pkg} must be an exact version, found ${JSON.stringify(version)}`,
      );
    versions.set(`${where} ${pkg}`, version);
  };
  for (const pkg of SDK) expect('skeleton', pkg, skeleton.dependencies?.[pkg]);

  for (const app of manifest.apps) {
    const dir = join(appsDir, app.id);
    if (!existsSync(join(dir, 'package.json'))) {
      problems.push(`apps/${app.id} is listed in apps.json but missing`);
      continue;
    }
    for (const file of staleGenerated(dir, app))
      problems.push(
        `apps/${app.id}/${file} does not match apps.json; regenerate it instead of editing`,
      );
    const pkg = readJson(join(dir, 'package.json'));
    for (const sdk of SDK)
      expect(`apps/${app.id}`, sdk, pkg.dependencies?.[sdk]);
    const declared = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);
    for (const file of sourceFiles(dir))
      for (const name of importedPackages(readFileSync(file, 'utf8')))
        if (!declared.has(name))
          problems.push(
            `${file.slice(root.length + 1)} imports ${name}, which apps/${app.id}/package.json does not declare`,
          );
  }

  const found = new Set(versions.values());
  if (snapshot) found.add(snapshot);
  for (const sdk of SDK) {
    const installed = join(root, 'node_modules', sdk, 'package.json');
    if (manifest.apps.length > 0 && existsSync(installed))
      found.add(readJson(installed).version);
  }
  if (found.size > 1)
    problems.push(
      `SDK versions differ (${[...found].join(', ')}): all apps, the skeleton, the installed packages and reference/sempods-sdk must use one version`,
    );
  return problems;
}

function npm(args, cwd) {
  const result = spawnSync('npm', args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

function standalone(root, id) {
  const work = mkdtempSync(join(tmpdir(), `sempods-${id}-`));
  try {
    cpSync(join(root, 'apps', id), work, {
      recursive: true,
      filter: (src) =>
        !/[\\/](node_modules|dist)([\\/]|$)/.test(src.slice(root.length)),
    });
    cpSync(join(root, '.npmrc'), join(work, '.npmrc'));
    // Installs, builds and tests without the workspace, so a package that
    // only another app or the root tooling provides fails here.
    return (
      npm(['install', '--no-audit', '--no-fund'], work) &&
      npm(['run', 'build'], work) &&
      npm(['run', 'test'], work)
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function main() {
  const { values } = parseArgs({ options: { standalone: { type: 'string' } } });
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const failures = staticProblems(root);
  for (const problem of failures) console.error(`✗ ${problem}`);

  const step = (label, ok) => {
    console.log(`${ok ? '✓' : '✗'} ${label}`);
    if (!ok) failures.push(label);
  };
  const node = (args) =>
    spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' })
      .status === 0;
  step('script tests', node(['--test', '.sempods/scripts/test/*.test.mjs']));
  step(
    'Markdown links',
    node([
      join(root, 'node_modules', 'remark-cli', 'cli.js'),
      '.',
      '--rc-path',
      '.sempods/remarkrc.json',
      '--quiet',
      '--frail',
      '--no-stdout',
    ]),
  );
  for (const app of readAppsSafe(root)) {
    const ws = ['--workspace', `apps/${app.id}`];
    step(`apps/${app.id}: lint`, npm(['run', 'lint', ...ws], root));
    step(
      `apps/${app.id}: typecheck and build`,
      npm(['run', 'build', ...ws], root),
    );
    step(`apps/${app.id}: tests`, npm(['run', 'test', ...ws], root));
  }
  if (values.standalone)
    step(
      `apps/${values.standalone}: standalone install, build and tests`,
      standalone(root, values.standalone),
    );

  if (failures.length > 0) {
    console.error(`\ncheck failed: ${failures.length} problem(s).`);
    process.exit(1);
  }
  console.log('\ncheck passed.');
}

function readAppsSafe(root) {
  try {
    return readApps(root).apps;
  } catch {
    return [];
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
