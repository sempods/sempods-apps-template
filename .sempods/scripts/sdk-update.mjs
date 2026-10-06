#!/usr/bin/env node
// One release for the root tooling, skeleton and every registered app.
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readApps } from './lib/apps.mjs';

export const SDK = ['@sempods/app-sdk', '@sempods/client-sdk'];
// SemVer 2.0: numeric identifiers cannot have leading zeroes.
export const EXACT_VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function compareVersions(a, b) {
  const left = EXACT_VERSION.exec(a);
  const right = EXACT_VERSION.exec(b);
  if (!left || !right) throw new Error('SDK versions must be exact semver');
  for (let i = 1; i <= 3; i++) {
    if (BigInt(left[i]) !== BigInt(right[i]))
      return BigInt(left[i]) > BigInt(right[i]) ? 1 : -1;
  }
  if (left[4] === right[4]) return 0;
  if (!left[4]) return 1;
  if (!right[4]) return -1;
  const l = left[4].split('.');
  const r = right[4].split('.');
  for (let i = 0; i < Math.max(l.length, r.length); i++) {
    if (l[i] === r[i]) continue;
    if (l[i] === undefined) return -1;
    if (r[i] === undefined) return 1;
    const ln = /^\d+$/.test(l[i]);
    const rn = /^\d+$/.test(r[i]);
    if (ln && rn) return BigInt(l[i]) > BigInt(r[i]) ? 1 : -1;
    if (ln !== rn) return ln ? -1 : 1;
    return l[i] > r[i] ? 1 : -1;
  }
  return 0;
}

function npm(root, args, capture = false) {
  const result = spawnSync('npm', args, {
    cwd: root,
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0)
    throw new Error(
      `npm ${args.join(' ')} failed${capture ? `: ${result.stderr.trim()}` : '; fix the reported problem and rerun'}`,
    );
  return capture ? JSON.parse(result.stdout) : undefined;
}

export function registryLookup(root, name, version) {
  try {
    return npm(
      root,
      ['view', `${name}@${version}`, 'version', 'dependencies', '--json'],
      true,
    );
  } catch (error) {
    throw new Error(
      `Cannot resolve ${name}@${version} from npm (missing version or registry unavailable): ${error.message}`,
    );
  }
}

export function releaseLinks(version) {
  return {
    release: `https://github.com/sempods/sempods-typescript/releases/tag/v${version}`,
    migration: `https://github.com/sempods/sempods-typescript/blob/v${version}/docs/migration.md`,
  };
}

/** Plan everything before writing. Registry injection keeps tests offline. */
export function planUpdate(
  root,
  requested = 'latest',
  {
    allowDowngrade = false,
    lookup = (name, version) => registryLookup(root, name, version),
  } = {},
) {
  if (requested !== 'latest' && !EXACT_VERSION.test(requested))
    throw new Error(
      'Use latest or an exact semver (for example 0.3.0), not a range or another dist-tag',
    );
  const app = lookup(SDK[0], requested);
  const version = app?.version;
  if (
    !EXACT_VERSION.test(version ?? '') ||
    (requested !== 'latest' && version !== requested)
  )
    throw new Error(
      `${SDK[0]}@${requested} is missing or returned an unexpected version`,
    );
  const client = lookup(SDK[1], version);
  if (client?.version !== version)
    throw new Error(
      `${SDK[1]}@${version} is missing or returned an unexpected version`,
    );
  if (app.dependencies?.[SDK[1]] !== version)
    throw new Error(
      `${SDK[0]}@${version} must depend on exactly ${SDK[1]}@${version}; found ${JSON.stringify(app.dependencies?.[SDK[1]])}`,
    );

  const entries = [
    ['package.json', 'devDependencies'],
    ['.sempods/skeleton/app/package.json', 'dependencies'],
    ...readApps(root).apps.map(({ id }) => [
      `apps/${id}/package.json`,
      'dependencies',
    ]),
  ];
  const changes = [];
  for (const [file, section] of entries) {
    const path = join(root, file);
    const original = readFileSync(path, 'utf8');
    const manifest = JSON.parse(original);
    for (const name of SDK) {
      const current = manifest[section]?.[name];
      if (!EXACT_VERSION.test(current ?? ''))
        throw new Error(
          `${file}: ${section}.${name} must already be an exact semver`,
        );
      if (!allowDowngrade && compareVersions(version, current) < 0)
        throw new Error(
          `${file}: downgrade from ${current} to ${version} requires --allow-downgrade`,
        );
    }
    if (SDK.every((name) => manifest[section][name] === version)) continue;
    for (const name of SDK) manifest[section][name] = version;
    changes.push({
      path,
      original,
      updated: `${JSON.stringify(manifest, null, 2)}\n`,
    });
  }
  return { version, changes, ...releaseLinks(version) };
}

// A failed check can leave manifests, lockfile and installed packages at the
// target already. Keep a local checkpoint until the entire update passes.
export const PENDING_UPDATE = '.sempods/.sdk-update-pending';

export function lockStateComplete(root, version) {
  try {
    const lock = JSON.parse(
      readFileSync(join(root, 'package-lock.json'), 'utf8'),
    );
    const entries = [
      ['', 'devDependencies'],
      ...readApps(root).apps.map(({ id }) => [`apps/${id}`, 'dependencies']),
    ];
    return (
      entries.every(([path, section]) =>
        SDK.every(
          (name) => lock.packages?.[path]?.[section]?.[name] === version,
        ),
      ) &&
      SDK.every(
        (name) => lock.packages?.[`node_modules/${name}`]?.version === version,
      )
    );
  } catch {
    return false;
  }
}

export function installedStateComplete(root, version) {
  try {
    return (
      SDK.every(
        (name) =>
          JSON.parse(
            readFileSync(
              join(root, 'node_modules', name, 'package.json'),
              'utf8',
            ),
          ).version === version,
      ) &&
      existsSync(
        join(root, 'node_modules/@sempods/app-sdk/docs/ai-app-builder.md'),
      )
    );
  } catch {
    return false;
  }
}

/** On a failed install/check leave a reviewable diff and report the failure. */
export function applyUpdate(
  root,
  plan,
  {
    run = (args) => npm(root, args),
    referenceExists = () =>
      existsSync(
        join(root, 'node_modules/@sempods/app-sdk/docs/ai-app-builder.md'),
      ),
  } = {},
) {
  const pending = join(root, PENDING_UPDATE);
  if (
    plan.changes.length === 0 &&
    !existsSync(pending) &&
    lockStateComplete(root, plan.version) &&
    installedStateComplete(root, plan.version)
  )
    return false;
  writeFileSync(pending, `${plan.version}\n`);
  for (const { path, updated } of plan.changes) writeFileSync(path, updated);
  run(['install', '--no-audit', '--no-fund']);
  if (!referenceExists())
    throw new Error(
      'node_modules/@sempods/app-sdk/docs/ai-app-builder.md is missing: this SDK release ships no app-author reference',
    );
  run(['run', 'check']);
  rmSync(pending);
  return true;
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'allow-downgrade': { type: 'boolean' },
      'resolve-only': { type: 'boolean' },
    },
  });
  if (positionals.length !== 1)
    throw new Error(
      'Usage: npm run sdk-update -- <version|latest> [--allow-downgrade]',
    );
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const plan = planUpdate(root, positionals[0], {
    allowDowngrade: values['allow-downgrade'],
  });
  if (values['resolve-only']) {
    // A fresh Actions checkout has no node_modules; committed dependency state
    // determines whether a release branch is needed there.
    const changed =
      plan.changes.length > 0 || !lockStateComplete(root, plan.version);
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `version=${plan.version}\nchanged=${changed}\n`,
      );
    console.log(
      JSON.stringify({
        version: plan.version,
        changed,
      }),
    );
  } else {
    const changed = applyUpdate(root, plan);
    console.log(
      changed
        ? `Updated SDK to ${plan.version}.`
        : `Already at SDK ${plan.version}; nothing changed.`,
    );
  }
  console.log(
    `SDK release: ${plan.release}\nMigration guide: ${plan.migration}`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(`sdk-update: ${error.message}`);
    process.exitCode = 1;
  }
}
