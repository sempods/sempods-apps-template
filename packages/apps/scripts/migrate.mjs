#!/usr/bin/env node
// Applies the starter of the installed @sempods/apps to this repository, from
// the starter it last applied (.sempods-baseline.json). The script applies
// only what is unambiguous: a file only the starter changed, a new or dropped
// file nobody changed here, seed files, the template entries of the root
// manifest. Everything that needs judgment is a manual case: the file stays
// as it is, and MIGRATION_DIR holds the list, the starter's versions and a
// merge suggestion for the assistant (update skill). With manual cases open,
// `pnpm run migrate --done` confirms that each was decided and completes:
// regenerate the apps' configuration, install, advance the baseline.
// Usage: pnpm run migrate [--done]
import { randomBytes } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  isDirectory,
  isFile,
  readText,
  removeFile,
  replaceFile,
} from './lib/files.mjs';
import { formatJson, ifPresent, readJson, replaceJson } from './lib/json.mjs';
import { mergeManifest, mergeText, withSection } from './lib/merge.mjs';
import { repositoryRoot, TOOLING } from './lib/paths.mjs';
import { INSTALL, pnpm, scriptArgs } from './lib/pnpm.mjs';
import { compareVersions, EXACT_VERSION, PENDING_UPDATE } from './lib/sdk.mjs';
import {
  baselineSnapshot,
  BASELINE_FILE,
  declaredVersion,
  downloadPackage,
  installedVersion,
  PACKAGE,
  readBaseline,
  starterAt,
  writeBaseline,
} from './lib/shared.mjs';
import { regenerate } from './regenerate.mjs';

export const MIGRATION_DIR = '.sempods-migration';
export const MIGRATION_FILE = `${MIGRATION_DIR}/migration.json`;
const label = (migration) => `sempods-migration:${migration.id}`;

/**
 * The migration recorded in MIGRATION_DIR while it is open: from the current
 * baseline. A record whose target the baseline already is was completed.
 */
export function openMigration(root, baseline) {
  const migration = ifPresent(() => readJson(join(root, MIGRATION_FILE)));
  return migration && migration.from.revision === baseline.revision
    ? migration
    : undefined;
}

/**
 * Stops a tooling update or migration that would be unsafe, before anything
 * changes: during an unfinished SDK update, toward a version older than the
 * repository's, or toward another version than an open migration's.
 */
export function refuseUnsafe(root, version) {
  if (existsSync(join(root, PENDING_UPDATE)))
    throw new Error(
      `an SDK update is unfinished (${PENDING_UPDATE}); complete it with pnpm run sdk-update first. Nothing was changed.`,
    );
  const baseline = readBaseline(root);
  for (const current of [
    baseline?.version,
    declaredVersion(root),
    installedVersion(root),
  ])
    if (
      EXACT_VERSION.test(current ?? '') &&
      compareVersions(version, current) < 0
    )
      throw new Error(
        `${PACKAGE} ${version} is older than this repository's ${current}; updates do not go back. Nothing was changed.`,
      );
  const open = baseline && openMigration(root, baseline);
  if (open && open.to.version !== version)
    throw new Error(
      `an open migration to ${PACKAGE} ${open.to.version} is recorded in ${MIGRATION_FILE}. Finish it with that version installed (pnpm run migrate, or --done once its manual cases are decided), then update. Nothing was changed.`,
    );
}

/** What `check` reports about the repository's starter state. */
export function migrationState(root, installed = TOOLING) {
  const baseline = readBaseline(root);
  if (!baseline || !existsSync(join(installed, 'shared', 'snapshot.json')))
    return undefined;
  const migration = openMigration(root, baseline);
  if (migration)
    return migration.manual.length > 0
      ? `the migration to ${PACKAGE} ${migration.to.version} is open: decide the manual cases in ${MIGRATION_FILE} (${migration.manual.map(({ file }) => file).join(', ')}), then run pnpm run migrate --done`
      : `the migration to ${PACKAGE} ${migration.to.version} is unfinished: run pnpm run migrate`;
  const { revision } = readJson(join(installed, 'shared', 'snapshot.json'));
  if (revision !== baseline.revision)
    return `the shared files are from ${PACKAGE} ${baseline.version}, but the installed ${readJson(join(installed, 'package.json')).version} ships another starter: run pnpm run migrate`;
  return undefined;
}

/**
 * What the starter change means for each file: automatic writes (content, or
 * null to remove) and manual cases with their reason and texts. Reads only;
 * files of an open migration's manual cases (`skip`) are left to it.
 */
function plan(root, { base, snapshot, policy, seeds, skip }) {
  const auto = [];
  const manual = [];
  const sections = (text, ours, file) => {
    let result = text;
    for (const markers of policy.sections?.[file] ?? []) {
      result = withSection(result, markers, ours);
      if (result === null) return null;
    }
    return result;
  };
  const texts = (file) => ({
    baseText: base.files[file] ? readText(base.path(file)) : null,
    theirs: snapshot.files[file] ? readText(snapshot.path(file)) : null,
    ours: readText(join(root, file)),
  });
  const files = [
    ...new Set([...Object.keys(base.files), ...Object.keys(snapshot.files)]),
  ].sort();
  // Starter paths that change between file and directory here. Nothing at or
  // below them is written automatically, on this run or a later one.
  const blocked = new Map();
  for (const file of Object.keys(snapshot.files)) {
    const parts = file.split('/');
    const obstacle = parts
      .slice(0, -1)
      .map((_, i) => parts.slice(0, i + 1).join('/'))
      .find((dir) => isFile(join(root, dir)));
    if (obstacle)
      blocked.set(
        file,
        `the starter needs a directory where ${obstacle} is a file here`,
      );
    else if (isDirectory(join(root, file)))
      blocked.set(file, 'a directory here, a file in the starter');
  }
  const below = (file) =>
    [...blocked.keys()].some((path) => file.startsWith(`${path}/`));

  for (const file of files) {
    if (file === policy.rootManifest || skip.has(file) || below(file)) continue;
    const { baseText, theirs, ours } = texts(file);
    const add = (reason) =>
      manual.push({ file, reason, baseText, theirs, ours });
    if (blocked.has(file)) {
      add(blocked.get(file));
      continue;
    }
    if (seeds.has(file)) {
      // Written once, when a starter first brings it; the owner's from then on.
      if (theirs !== null && ours === null && baseText === null)
        auto.push({ file, content: theirs, kind: 'added' });
      continue;
    }
    if (theirs === null) {
      if (ours === baseText)
        auto.push({ file, content: null, kind: 'removed' });
      else if (ours !== null) add('the starter dropped it; changed here');
      continue;
    }
    if (ours === null) {
      if (baseText === null)
        auto.push({ file, content: theirs, kind: 'added' });
      else if (baseText !== theirs) add('removed here; the starter changed it');
      continue;
    }
    // Compared with this repository's owner sections kept, so a changed owner
    // section alone is no change to merge.
    const expected = sections(theirs, ours, file);
    if (expected === null) {
      add('an owner section is incomplete here or in the starter');
      continue;
    }
    // Already applied, or changed only here.
    if (ours === expected || theirs === baseText) continue;
    if (baseText !== null && ours === sections(baseText, ours, file))
      auto.push({ file, content: expected, kind: 'updated' });
    else
      add(
        baseText === null
          ? 'added here and by the starter'
          : 'changed here and by the starter',
      );
  }
  return { auto, manual };
}

/**
 * Adds manual cases to the migration record, with the starter's versions and
 * a merge suggestion in MIGRATION_DIR, and saves it before anything changes.
 */
function record(root, migration, cases, labels) {
  const work = join(root, MIGRATION_DIR);
  for (const { file, reason, baseText, theirs, ours } of cases) {
    if (baseText !== null) replaceFile(join(work, 'base', file), baseText);
    if (theirs !== null) replaceFile(join(work, 'starter', file), theirs);
    if (ours !== null && theirs !== null)
      replaceFile(
        join(work, 'suggestion', file),
        mergeText(ours, baseText ?? '', theirs, labels).text,
      );
    migration.manual.push({ file, reason });
  }
  replaceJson(join(root, MIGRATION_FILE), migration);
}

/** The root manifest with the starter's tooling, SDK and script entries. */
function mergedManifest(root, { base, snapshot, policy, from, to }, notes) {
  const file = policy.rootManifest;
  const ours = readJson(join(root, file));
  const starter = (snap, version) => {
    const manifest = readJson(snap.path(file));
    manifest.devDependencies[PACKAGE] = version;
    return manifest;
  };
  // The SDK stays at the repository's version; sdk-update moves it.
  const merged = formatJson(
    mergeManifest(
      ours,
      [starter(base, from)],
      starter(snapshot, to),
      policy.sdk,
      ours.devDependencies?.[policy.sdk[0]],
      notes,
      file,
    ),
  );
  return merged === formatJson(ours) ? null : merged;
}

/**
 * Migrates `root` from its baseline to the starter of the installed package.
 * With `done`, the open manual cases count as decided. The other options are
 * for tests: the installed package, how to fetch the baseline's package and
 * how to install.
 */
export function migrate(
  root,
  {
    done = false,
    installed = TOOLING,
    download = downloadPackage,
    install = () =>
      pnpm(INSTALL, { cwd: root, stdio: ['ignore', 2, 2] }).status === 0,
  } = {},
) {
  const baseline = readBaseline(root);
  if (!baseline)
    throw new Error(
      `${BASELINE_FILE} is missing: this repository was not created from the ${PACKAGE} starter`,
    );
  const target = starterAt(installed);
  refuseUnsafe(root, target.version);
  const work = join(root, MIGRATION_DIR);
  let migration = openMigration(root, baseline);
  // Without an open record, anything left in MIGRATION_DIR is a leftover of
  // a completed migration.
  if (!migration) rmSync(work, { recursive: true, force: true });
  const report = {
    from: baseline.version,
    to: target.version,
    updated: [],
    added: [],
    removed: [],
    manual: [],
    notes: [],
    regenerated: [],
  };
  if (!migration) {
    if (done)
      throw new Error(
        'no migration is open; run pnpm run migrate first and decide its manual cases',
      );
    if (baseline.revision === target.snapshot.revision)
      return { ...report, unchanged: true };
  }

  // The baseline's package is unpacked once while the migration is open.
  const unpacked = join(work, 'package', 'package');
  const base = baselineSnapshot(baseline, {
    download: (version) =>
      ifPresent(() => readJson(join(unpacked, 'package.json')))?.version ===
      version
        ? unpacked
        : download(version, join(work, 'package')),
  });
  const { policy, snapshot } = target;
  // A file that was a seed in either starter stays the owner's, also when the
  // new starter drops it together with its policy entry.
  const seeds = new Set([...policy.seed, ...(base.policy?.seed ?? [])]);
  migration ??= {
    id: randomBytes(4).toString('hex'),
    from: baseline,
    to: { version: target.version, revision: snapshot.revision },
    manual: [],
  };
  const { auto, manual } = plan(root, {
    base,
    snapshot,
    policy,
    seeds,
    skip: new Set(migration.manual.map(({ file }) => file)),
  });
  // The complete list of manual cases is saved before any repository file
  // changes; a later run adds what has become ambiguous since.
  record(root, migration, manual, [
    label(migration),
    `${PACKAGE} ${baseline.version}`,
    `${PACKAGE} ${target.version}`,
  ]);

  for (const { file, content, kind } of auto) {
    if (content === null) removeFile(root, join(root, file));
    else replaceFile(join(root, file), content);
    report[kind].push(file);
  }
  const manifest = mergedManifest(
    root,
    { base, snapshot, policy, from: baseline.version, to: target.version },
    report.notes,
  );
  if (manifest !== null) {
    replaceFile(join(root, policy.rootManifest), manifest);
    report.updated.push(policy.rootManifest);
  }

  report.manual = migration.manual;
  if (migration.manual.length > 0 && !done)
    return { ...report, unfinished: true };
  // --done attests that every manual case was decided; a copied suggestion
  // with its conflicts unresolved is the one mistake the script can see.
  const unresolved = migration.manual.filter(({ file }) =>
    readText(join(root, file))?.includes(`<<<<<<< ${label(migration)}`),
  );
  if (unresolved.length > 0)
    throw new Error(
      `${unresolved.map(({ file }) => file).join(', ')} still contain an unresolved suggestion; resolve them, then run pnpm run migrate --done again`,
    );
  report.regenerated = regenerate(root);
  // A new starter can change the manifest or the workspace settings, so the
  // lockfile and node_modules follow before the migration counts as done.
  if (!install(root))
    return {
      ...report,
      unfinished: true,
      failed:
        'pnpm install failed; fix the cause, then run the same command again',
    };
  writeBaseline(root, {
    version: target.version,
    revision: snapshot.revision,
  });
  rmSync(work, { recursive: true, force: true });
  return report;
}

export function formatMigration(report) {
  if (report.unchanged)
    return `The shared files already match ${PACKAGE} ${report.to}; nothing to migrate.`;
  const list = (title, items) =>
    items.length ? [`${title}:`, ...items.map((item) => `  ${item}`)] : [];
  const lines = [
    `Migration from ${PACKAGE} ${report.from} to ${report.to}${report.unfinished ? ' is open' : ' is complete'}.`,
    ...list('Updated', report.updated),
    ...list('Added', report.added),
    ...list('Removed', report.removed),
    ...list('Regenerated', report.regenerated),
    ...list('Notes', report.notes),
  ];
  if (report.failed) lines.push(report.failed);
  else if (report.unfinished)
    lines.push(
      ...list(
        `Manual cases (left unchanged; base, starter and suggestion are in ${MIGRATION_DIR}/)`,
        report.manual.map(({ file, reason }) => `${file}: ${reason}`),
      ),
      'Decide each case with the update skill, then run pnpm run migrate --done. The baseline stays at the old starter until then.',
    );
  else
    lines.push(
      'Run pnpm run check and review the changes before you commit them.',
    );
  return lines.join('\n');
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { values } = parseArgs({
      args: scriptArgs(),
      options: { done: { type: 'boolean', default: false } },
    });
    const report = migrate(repositoryRoot(), { done: values.done });
    console.log(formatMigration(report));
    if (report.unfinished) process.exitCode = 3;
  } catch (error) {
    console.error(`migrate: ${error.message}`);
    process.exitCode = 1;
  }
}
