#!/usr/bin/env node
// Checks the whole repository: manifest, generated configuration, the shared
// SDK version and its shipped app-author reference, declared dependencies, Markdown
// links, script tests, and lint, typecheck, build and tests of every app.
// Usage: pnpm run check [--standalone <id|all>]
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
import { EXACT_VERSION } from './sdk-update.mjs';
import { staleGenerated } from './lib/generate.mjs';
import { checkLinks } from './lib/links.mjs';
import { INSTALL, pnpm, scriptArgs } from './lib/pnpm.mjs';

const SDK = ['@sempods/app-sdk', '@sempods/client-sdk'];
export const REFERENCE = 'node_modules/@sempods/app-sdk/docs/ai-app-builder.md';
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
  // static and dynamic imports, re-exports and require() calls. Keep the root
  // dependency on TypeScript 6: TypeScript 7 does not ship this compiler API.
  // Apps can use the native compiler independently of this scanner.
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

  const rootManifest = readJson(join(root, 'package.json'));
  const skeleton = readJson(
    join(root, '.sempods', 'skeleton', 'app', 'package.json'),
  );

  const versions = new Map();
  const expect = (where, pkg, version) => {
    if (!EXACT_VERSION.test(version ?? ''))
      problems.push(
        `${where}: ${pkg} must be an exact version, found ${JSON.stringify(version)}`,
      );
    versions.set(`${where} ${pkg}`, version);
  };
  for (const pkg of SDK) {
    expect('skeleton', pkg, skeleton.dependencies?.[pkg]);
    // The root installs the SDK too, so its shipped reference is there before any app.
    expect('root', pkg, rootManifest.devDependencies?.[pkg]);
  }

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
  for (const sdk of SDK) {
    const installed = join(root, 'node_modules', sdk, 'package.json');
    if (existsSync(installed)) found.add(readJson(installed).version);
  }
  if (found.size > 1)
    problems.push(
      `SDK versions differ (${[...found].join(', ')}): the root, the skeleton, all apps and the installed packages must use one version`,
    );
  // The app-author reference ships inside the installed SDK (0.3.0 and later).
  if (
    existsSync(join(root, 'node_modules', '@sempods', 'app-sdk')) &&
    !existsSync(join(root, ...REFERENCE.split('/')))
  )
    problems.push(
      `${REFERENCE} is missing: the installed @sempods/app-sdk ships no app-author reference`,
    );
  return problems;
}

const run = (args, cwd) => pnpm(args, { cwd }).status === 0;

function standalone(root, id) {
  const work = mkdtempSync(join(tmpdir(), `sempods-${id}-`));
  try {
    cpSync(join(root, 'apps', id), work, {
      recursive: true,
      filter: (src) =>
        !/[\\/](node_modules|dist)([\\/]|$)/.test(src.slice(root.length)),
    });
    // The workspace settings (no install scripts, Node version, release age)
    // apply here too; its package pattern matches nothing in the copy.
    cpSync(join(root, 'pnpm-workspace.yaml'), join(work, 'pnpm-workspace.yaml'));
    // Installs, lints, builds and tests without the workspace, so a package that
    // only another app or the root tooling provides fails here.
    return (
      run(INSTALL, work) &&
      run(['run', 'lint'], work) &&
      run(['run', 'build'], work) &&
      run(['run', 'test'], work)
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function main() {
  const { values } = parseArgs({
    args: scriptArgs(),
    options: { standalone: { type: 'string' } },
  });
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
    await checkLinks(root).catch((error) => {
      console.error(error.message);
      return false;
    }),
  );
  for (const app of readAppsSafe(root)) {
    const dir = ['--dir', join(root, 'apps', app.id)];
    step(`apps/${app.id}: lint`, run([...dir, 'run', 'lint'], root));
    step(
      `apps/${app.id}: typecheck and build`,
      run([...dir, 'run', 'build'], root),
    );
    step(`apps/${app.id}: tests`, run([...dir, 'run', 'test'], root));
  }
  // Outside the workspace, an app finds only what its own package.json
  // declares, including CLIs its scripts call.
  const apps = readAppsSafe(root).map((app) => app.id);
  const isolated =
    values.standalone === 'all'
      ? apps
      : values.standalone
        ? [values.standalone]
        : [];
  for (const id of isolated)
    step(
      `apps/${id}: standalone install, lint, build and tests`,
      apps.includes(id) && standalone(root, id),
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
  await main();
