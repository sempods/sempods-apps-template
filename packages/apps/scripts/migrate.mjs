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
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { formatJson, ifPresent, readJson, replaceJson } from './lib/json.mjs';
import { mergeManifest, mergeText, withSection } from './lib/merge.mjs';
import { repositoryRoot, TOOLING } from './lib/paths.mjs';
import { INSTALL, pnpm, scriptArgs } from './lib/pnpm.mjs';
import { compareVersions, PENDING_UPDATE } from './lib/sdk.mjs';
import {
  baselineSnapshot,
  BASELINE_FILE,
  downloadPackage,
  PACKAGE,
  readBaseline,
  readSnapshot,
  writeBaseline,
} from './lib/shared.mjs';
import { regenerate } from './regenerate.mjs';

export const MIGRATION_DIR = '.sempods-migration';
export const MIGRATION_FILE = `${MIGRATION_DIR}/migration.json`;

const readText = (path) =>
  statSync(path, { throwIfNoEntry: false })?.isFile()
    ? readFileSync(path, 'utf8')
    : null;

/** Writes a file in one step: the old or the complete new content remains. */
function replaceFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}

/** Removes a file and the directories it leaves empty, up to `root`. */
function removeFile(root, path) {
  rmSync(path, { force: true });
  for (
    let dir = dirname(path);
    dir !== root && existsSync(dir) && readdirSync(dir).length === 0;
    dir = dirname(dir)
  )
    rmdirSync(dir);
}

/** The starter of an installed package: its version, snapshot and policy. */
export function installedStarter(installed = TOOLING) {
  const shared = join(installed, 'shared');
  if (!existsSync(join(shared, 'snapshot.json')))
    throw new Error(
      `${PACKAGE} at ${installed} has no packed starter; install a published version`,
    );
  return {
    version: readJson(join(installed, 'package.json')).version,
    snapshot: readSnapshot(shared),
    policy: readJson(join(installed, 'update-policy.json')),
  };
}

/** A tooling update waits for an unfinished SDK update to complete. */
export function refuseDuringSdkUpdate(root) {
  if (existsSync(join(root, PENDING_UPDATE)))
    throw new Error(
      `an SDK update is unfinished (${PENDING_UPDATE}); complete it with pnpm run sdk-update first. Nothing was changed.`,
    );
}

/** Migrations never go back behind the starter a repository has applied. */
export function refuseOlder(baseline, target) {
  if (baseline && compareVersions(target.version, baseline.version) < 0)
    throw new Error(
      `${PACKAGE} ${target.version} is older than this repository's ${baseline.version}; updates do not go back. Nothing was changed.`,
    );
}

/** The open migration, or undefined; a completed leftover is dropped. */
function openMigration(root, baseline) {
  const migration = ifPresent(() => readJson(join(root, MIGRATION_FILE)));
  if (!migration) return undefined;
  if (migration.to?.revision === baseline.revision) {
    // The baseline was written; only the cleanup was interrupted.
    rmSync(join(root, MIGRATION_DIR), { recursive: true, force: true });
    return undefined;
  }
  return migration;
}

/** What `check` reports about the repository's starter state. */
export function migrationState(root, installed = TOOLING) {
  const baseline = readBaseline(root);
  if (!baseline || !existsSync(join(installed, 'shared', 'snapshot.json')))
    return undefined;
  const migration = ifPresent(() => readJson(join(root, MIGRATION_FILE)));
  if (migration && migration.to?.revision !== baseline.revision)
    return migration.manual.length > 0
      ? `the migration to ${PACKAGE} ${migration.to.version} is open: decide the manual cases in ${MIGRATION_FILE} (${migration.manual.map(({ file }) => file).join(', ')}), then run pnpm run migrate --done`
      : `the migration to ${PACKAGE} ${migration.to.version} is unfinished: run pnpm run migrate`;
  const { revision } = readJson(join(installed, 'shared', 'snapshot.json'));
  const { version } = readJson(join(installed, 'package.json'));
  if (revision !== baseline.revision)
    return `the shared files are from ${PACKAGE} ${baseline.version}, but the installed ${version} ships another starter: run pnpm run migrate`;
  return undefined;
}

/**
 * What the starter change means for each file: automatic writes (content, or
 * null to remove) and manual cases with their reason. Reads only.
 */
function plan(root, { base, snapshot, policy, seeds, skip }) {
  const auto = [];
  const manual = [];
  const sections = (text, ours, file) => {
    let result = text;
    for (const markers of policy.sections?.[file] ?? [])
      result = result === null ? null : withSection(result, markers, ours);
    return result;
  };
  const files = [
    ...new Set([...Object.keys(base.files), ...Object.keys(snapshot.files)]),
  ].sort();
  for (const file of files) {
    if (file === policy.rootManifest || skip.has(file)) continue;
    const path = join(root, file);
    const theirs = snapshot.files[file] ? readText(snapshot.path(file)) : null;
    const baseText = base.files[file] ? readText(base.path(file)) : null;
    const ours = readText(path);
    const fresh = () => !base.files[file];
    if (statSync(path, { throwIfNoEntry: false })?.isDirectory()) {
      if (theirs !== null)
        manual.push({ file, reason: 'a directory here, a file in the starter' });
      continue;
    }
    const parts = file.split('/');
    const blocking = parts
      .slice(0, -1)
      .map((_, i) => parts.slice(0, i + 1).join('/'))
      .find((dir) => readText(join(root, dir)) !== null);
    if (blocking && theirs !== null) {
      manual.push({
        file,
        reason: `the starter needs a directory where ${blocking} is a file here`,
      });
      continue;
    }
    if (seeds.has(file)) {
      // Written once, when a starter first brings it; the owner's from then on.
      if (theirs !== null && ours === null && fresh())
        auto.push({ file, content: theirs, kind: 'added' });
      continue;
    }
    if (theirs === null) {
      if (ours === null) continue;
      if (ours === baseText) auto.push({ file, content: null, kind: 'removed' });
      else
        manual.push({ file, reason: 'the starter dropped it; changed here' });
      continue;
    }
    if (ours === null) {
      if (baseText === null) auto.push({ file, content: theirs, kind: 'added' });
      else if (baseText !== theirs)
        manual.push({ file, reason: 'removed here; the starter changed it' });
      continue;
    }
    // Compared with the owner sections of this repository kept, so a changed
    // owner section alone is no change to merge.
    const expected = sections(theirs, ours, file);
    if (expected === null) {
      manual.push({
        file,
        reason: 'an owner section is incomplete here or in the starter',
      });
      continue;
    }
    // Already applied, or changed only here.
    if (ours === expected || theirs === baseText) continue;
    if (baseText !== null && ours === sections(baseText, ours, file)) {
      auto.push({ file, content: expected, kind: 'updated' });
      continue;
    }
    manual.push({
      file,
      reason:
        baseText === null
          ? 'added here and by the starter'
          : 'changed here and by the starter',
    });
  }
  // Nothing below a path that changes between file and directory is written
  // automatically; the manual case covers it.
  const collisions = manual
    .filter(({ reason }) => reason.startsWith('a directory here'))
    .map(({ file }) => `${file}/`);
  return {
    auto: auto.filter(({ file }) =>
      collisions.every((dir) => !file.startsWith(dir)),
    ),
    manual,
  };
}

/**
 * Migrates `root` from its baseline to the starter of the installed package.
 * With `done`, the open manual cases count as decided. Other options are for
 * tests: the installed package, how to fetch the baseline's package, how to
 * install, and a hook after each file the script writes.
 */
export function migrate(
  root,
  {
    done = false,
    installed = TOOLING,
    download = downloadPackage,
    install = () =>
      pnpm(INSTALL, { cwd: root, stdio: ['ignore', 2, 2] }).status === 0,
    afterWrite = () => {},
  } = {},
) {
  const baseline = readBaseline(root);
  if (!baseline)
    throw new Error(
      `${BASELINE_FILE} is missing: this repository was not created from the ${PACKAGE} starter`,
    );
  const target = installedStarter(installed);
  refuseDuringSdkUpdate(root);
  refuseOlder(baseline, target);
  let migration = openMigration(root, baseline);
  if (
    migration &&
    (migration.from?.revision !== baseline.revision ||
      migration.to?.revision !== target.snapshot.revision)
  )
    throw new Error(
      `an open migration from ${PACKAGE} ${migration.from?.version} to ${migration.to?.version} is recorded in ${MIGRATION_FILE}, but ${target.version} is installed. Install ${migration.to?.version} again, finish that migration with pnpm run migrate, then update. Nothing was changed.`,
    );
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
  if (!migration && baseline.revision === target.snapshot.revision) {
    if (done) throw new Error('no migration is open; nothing to finish');
    return { ...report, unchanged: true };
  }
  if (!migration && done)
    throw new Error(
      'no migration is open; run pnpm run migrate first and decide its manual cases',
    );

  const base = baselineSnapshot(baseline, { installed, download });
  const { policy, snapshot } = target;
  // A file that was a seed in either starter stays the owner's, also when the
  // new starter drops it together with its policy entry.
  const basePolicy = ifPresent(() =>
    readJson(join(base.packageDir, 'update-policy.json')),
  );
  const seeds = new Set([...policy.seed, ...(basePolicy?.seed ?? [])]);
  const work = join(root, MIGRATION_DIR);

  // The complete list of manual cases is recorded before anything changes;
  // while it is open, its files are the assistant's and are not reconsidered.
  const skip = new Set(migration?.manual.map(({ file }) => file));
  const { auto, manual } = plan(root, { base, snapshot, policy, seeds, skip });
  if (!migration) {
    rmSync(work, { recursive: true, force: true });
    const id = randomBytes(4).toString('hex');
    migration = {
      id,
      from: baseline,
      to: { version: target.version, revision: snapshot.revision },
      manual: manual.map(({ file, reason }, index) => {
        const entry = { file, reason };
        const text = (snap) =>
          snap.files[file] ? readText(snap.path(file)) : null;
        const [baseText, theirs] = [text(base), text(snapshot)];
        const ours = readText(join(root, file));
        if (baseText !== null)
          replaceFile(join(work, 'base', file), baseText);
        if (theirs !== null) replaceFile(join(work, 'starter', file), theirs);
        if (ours !== null && theirs !== null) {
          // A suggestion with a label of its own, so --done can tell it apart.
          const label = `sempods-migration:${id}:${index}`;
          const merged = mergeText(ours, baseText ?? '', theirs, [
            label,
            `${PACKAGE} ${baseline.version}`,
            `${PACKAGE} ${target.version}`,
          ]);
          replaceFile(join(work, 'suggestion', file), merged.text);
          entry.opening = `<<<<<<< ${label}`;
        }
        return entry;
      }),
    };
    mkdirSync(work, { recursive: true });
    replaceJson(join(root, MIGRATION_FILE), migration);
  }

  for (const { file, content, kind } of auto) {
    const path = join(root, file);
    if (content === null) removeFile(root, path);
    else replaceFile(path, content);
    afterWrite(file);
    report[kind].push(file);
  }
  // The root manifest: tooling, SDK and script entries only. The SDK stays at
  // the repository's version; sdk-update moves it.
  const manifestFile = policy.rootManifest;
  const ours = readJson(join(root, manifestFile));
  const starterManifest = (snap, version) => {
    const manifest = JSON.parse(readText(snap.path(manifestFile)));
    manifest.devDependencies[PACKAGE] = version;
    return manifest;
  };
  const manifest = formatJson(
    mergeManifest(
      ours,
      [starterManifest(base, baseline.version)],
      starterManifest(snapshot, target.version),
      policy.sdk,
      ours.devDependencies?.[policy.sdk[0]],
      report.notes,
      manifestFile,
    ),
  );
  if (manifest !== formatJson(ours)) {
    replaceFile(join(root, manifestFile), manifest);
    afterWrite(manifestFile);
    report.updated.push(manifestFile);
  }

  report.manual = migration.manual;
  if (migration.manual.length > 0 && !done)
    return { ...report, unfinished: true };
  // --done attests that every manual case was decided; an unresolved copy of
  // a suggestion is the one mistake the script can see.
  const unresolved = migration.manual.filter(
    ({ file, opening }) =>
      opening && readText(join(root, file))?.includes(opening),
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
      failed: 'pnpm install failed; fix the cause, then run the same command again',
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
  else lines.push('Run pnpm run check and review the changes before you commit them.');
  return lines.join('\n');
}

export function main(args = scriptArgs()) {
  const { values } = parseArgs({
    args,
    options: { done: { type: 'boolean', default: false } },
  });
  const report = migrate(repositoryRoot(), { done: values.done });
  console.log(formatMigration(report));
  if (report.unfinished) process.exitCode = 3;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(`migrate: ${error.message}`);
    process.exitCode = 1;
  }
}
