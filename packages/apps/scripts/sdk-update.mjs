#!/usr/bin/env node
// One SDK release for the root and every registered app: the manifests name
// it for both SDK packages and the UI kit, pnpm installs it, and the update
// counts only once node_modules has it and check passes.
// Usage: pnpm run sdk-update <version|latest>
import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import semver from 'semver';
import { readApps } from './lib/apps.mjs';
import { formatJson, ifPresent, readJson, sortedKeys } from './lib/json.mjs';
import { migrationState } from './migrate.mjs';
import { repositoryRoot } from './lib/paths.mjs';
import { INSTALL, pnpm, pnpmJson, scriptArgs } from './lib/pnpm.mjs';
import {
  appSdk,
  compareVersions,
  EXACT_VERSION,
  PENDING_UPDATE,
  REFERENCE,
  SDK,
  UI_KIT,
} from './lib/sdk.mjs';


function pnpmOrThrow(root, args) {
  if (pnpm(args, { cwd: root }).status !== 0)
    throw new Error(
      `pnpm ${args.join(' ')} failed; fix the reported problem and rerun`,
    );
}

export function registryLookup(root, name, version) {
  try {
    return pnpmJson(root, [
      'view',
      `${name}@${version}`,
      'version',
      'dependencies',
      'peerDependencies',
      '--json',
    ]);
  } catch (error) {
    throw new Error(
      `Cannot resolve ${name}@${version} from the npm registry (missing version or registry unavailable): ${error.message}`,
    );
  }
}

export function releaseLinks(version) {
  return {
    release: `https://github.com/sempods/sempods-typescript/releases/tag/v${version}`,
    migration: `https://github.com/sempods/sempods-typescript/blob/v${version}/docs/migration.md`,
  };
}

// Since 0.6.0 the SDK ships its release notes and migration guide; read the
// installed ones, which match the installed code.
const INSTALLED_DOCS = join('node_modules', '@sempods', 'app-sdk', 'docs');

/**
 * Where to read about `version` after it is installed: the installed notes
 * and guide when the SDK ships them, otherwise the published ones.
 */
export function releaseDocs(root, version) {
  const notes = join(INSTALLED_DOCS, 'releases', `${version}.md`);
  if (!existsSync(join(root, notes))) return releaseLinks(version);
  return { release: notes, migration: join(INSTALLED_DOCS, 'migration.md') };
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
  // The UI kit is released with the SDK, at the same version.
  const kit = lookup(UI_KIT, version);
  if (kit?.version !== version)
    throw new Error(
      `${UI_KIT}@${version} is missing or returned an unexpected version; the UI kit is released with the SDK since 0.7.0`,
    );
  const peer = kit.peerDependencies?.[SDK[0]];
  if (!peer || !semver.satisfies(version, peer, { includePrerelease: true }))
    throw new Error(
      `${UI_KIT}@${version} must support ${SDK[0]}@${version}; it asks for ${JSON.stringify(peer)}`,
    );

  // The root declares every SDK package and gains the UI kit when it lacks
  // it; an app moves only what it declares.
  const entries = [
    ['package.json', 'devDependencies', true],
    ...readApps(root).apps.map(({ id }) => [
      `apps/${id}/package.json`,
      'dependencies',
      false,
    ]),
  ];
  const changes = [];
  for (const [file, section, isRoot] of entries) {
    const path = join(root, file);
    const original = readFileSync(path, 'utf8');
    const manifest = JSON.parse(original);
    const names = isRoot ? SDK : appSdk(manifest[section]);
    for (const name of names) {
      const current = manifest[section]?.[name];
      if (name === UI_KIT && current === undefined) continue;
      if (!EXACT_VERSION.test(current ?? ''))
        throw new Error(
          `${file}: ${section}.${name} must already be an exact semver`,
        );
      if (!allowDowngrade && compareVersions(version, current) < 0)
        throw new Error(
          `${file}: downgrade from ${current} to ${version} requires --allow-downgrade`,
        );
    }
    if (names.every((name) => manifest[section]?.[name] === version)) continue;
    for (const name of names) manifest[section][name] = version;
    manifest[section] = sortedKeys(manifest[section]);
    changes.push({
      path,
      original,
      updated: formatJson(manifest),
    });
  }
  return { version, changes, ...releaseLinks(version) };
}


/** Whether node_modules has the SDK packages at `version` and the reference. */
export function installedStateComplete(root, version) {
  try {
    return (
      SDK.every(
        (name) =>
          readJson(join(root, 'node_modules', name, 'package.json'))
            .version === version,
      ) &&
      existsSync(join(root, REFERENCE))
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
    run = (args) => pnpmOrThrow(root, args),
    installed = () => installedStateComplete(root, plan.version),
    // pnpm confirms that the lockfile matches every manifest.
    locked = () =>
      pnpm(['install', '--frozen-lockfile'], { cwd: root }).status === 0,
    migration = () => migrationState(root),
  } = {},
) {
  const pending = join(root, PENDING_UPDATE);
  // Read rather than tested, so nothing races between check and write.
  const resuming =
    ifPresent(() => readFileSync(pending, 'utf8')) !== undefined;
  if (
    plan.changes.length === 0 &&
    !resuming &&
    installed() &&
    locked()
  )
    return false;
  // Its check would fail on the migration, which waits for this update.
  const open = !resuming && migration();
  if (open)
    throw new Error(
      `finish the tooling migration first: ${open}. Nothing was changed.`,
    );
  writeFileSync(pending, `${plan.version}\n`);
  for (const { path, updated } of plan.changes) writeFileSync(path, updated);
  run(INSTALL);
  if (!installed())
    throw new Error(
      `node_modules does not have ${SDK.join(', ')} at ${plan.version} with ${REFERENCE}; fix the cause and run the same command again`,
    );
  run(['run', 'check']);
  rmSync(pending);
  return true;
}

function main() {
  const { values, positionals } = parseArgs({
    args: scriptArgs(),
    allowPositionals: true,
    options: {
      'allow-downgrade': { type: 'boolean' },
    },
  });
  if (positionals.length !== 1)
    throw new Error(
      'Usage: pnpm run sdk-update <version|latest> [--allow-downgrade]',
    );
  const root = repositoryRoot();
  const plan = planUpdate(root, positionals[0], {
    allowDowngrade: values['allow-downgrade'],
  });
  const changed = applyUpdate(root, plan);
  console.log(
    changed
      ? `Updated SDK to ${plan.version}.`
      : `Already at SDK ${plan.version}; nothing changed.`,
  );
  const docs = releaseDocs(root, plan.version);
  console.log(
    `SDK release notes: ${docs.release}\nMigration guide: ${docs.migration}`,
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
