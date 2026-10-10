#!/usr/bin/env node
// Applies the starter of the installed @sempods/apps to this repository, from
// the starter it last applied (.sempods-baseline.json): shared files get a
// three-way merge that keeps the owner sections verbatim, new seed files are
// added, the root manifest follows only its template entries, and the apps'
// generated configuration is rewritten. The baseline advances only once
// everything is applied without unresolved conflicts; until then
// MIGRATION_FILE records the unfinished migration and a rerun continues it.
// Usage: pnpm run migrate
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatJson, readJson, replaceJson } from './lib/json.mjs';
import { mergeManifest, mergeText, withSection } from './lib/merge.mjs';
import { repositoryRoot, TOOLING } from './lib/paths.mjs';
import { INSTALL, pnpm, scriptArgs } from './lib/pnpm.mjs';
import { compareVersions } from './lib/sdk.mjs';
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

export const MIGRATION_FILE = '.sempods-migration.json';
// Any of the lines git merge-file marks a conflict with.
const CONFLICT = /^(<{7} |={7}$|>{7} )/m;

const readText = (path) =>
  existsSync(path) ? readFileSync(path, 'utf8') : null;
const hash = (text) =>
  text === null ? 'absent' : createHash('sha256').update(text).digest('hex');

/** The starter of an installed package: its version, snapshot and policy. */
export function installedStarter(installed = TOOLING) {
  const shared = join(installed, 'shared');
  if (!existsSync(join(shared, 'snapshot.json')))
    throw new Error(
      `${PACKAGE} at ${installed} has no packed starter; install a published version`,
    );
  return {
    dir: installed,
    version: readJson(join(installed, 'package.json')).version,
    snapshot: readSnapshot(shared),
    policy: readJson(join(installed, 'update-policy.json')),
  };
}

/** Migrations never go back behind the starter a repository has applied. */
export function refuseOlder(baseline, target) {
  if (baseline && compareVersions(target.version, baseline.version) < 0)
    throw new Error(
      `${PACKAGE} ${target.version} is older than this repository's ${baseline.version}; updates do not go back. Nothing was changed.`,
    );
}

/** What `check` reports about the repository's starter state. */
export function migrationState(root, installed = TOOLING) {
  const baseline = readBaseline(root);
  if (!baseline || !existsSync(join(installed, 'shared', 'snapshot.json')))
    return undefined;
  const pending = readText(join(root, MIGRATION_FILE));
  // A migration file whose target is the baseline is a completed leftover.
  if (pending && JSON.parse(pending).to?.revision !== baseline.revision) {
    const { to, files = {} } = JSON.parse(pending);
    const conflicts = Object.entries(files)
      .filter(
        ([, recorded]) =>
          recorded === 'conflict' || recorded?.outcome === 'conflict',
      )
      .map(([file]) => file);
    return `the migration to ${PACKAGE} ${to.version} is unfinished${conflicts.length ? `: resolve the conflicts in ${conflicts.join(', ')}` : ''}, then run pnpm run migrate`;
  }
  const { revision } = readJson(join(installed, 'shared', 'snapshot.json'));
  const { version } = readJson(join(installed, 'package.json'));
  if (revision !== baseline.revision)
    return `the shared files are from ${PACKAGE} ${baseline.version}, but the installed ${version} ships another starter: run pnpm run migrate`;
  return undefined;
}

/**
 * Migrates `root` from its baseline to the starter of the installed package.
 * Options are for tests: where the installed package is, how to fetch the
 * baseline's package, how to install, and a hook after each written file.
 */
export function migrate(
  root,
  {
    installed = TOOLING,
    download = downloadPackage,
    install = () =>
      pnpm(INSTALL, { cwd: root, stdio: ['ignore', 2, 2] }).status === 0,
    beforeWrite = () => {},
    afterWrite = () => {},
  } = {},
) {
  const baseline = readBaseline(root);
  if (!baseline)
    throw new Error(
      `${BASELINE_FILE} is missing: this repository was not created from the ${PACKAGE} starter`,
    );
  const target = installedStarter(installed);
  refuseOlder(baseline, target);
  const pendingPath = join(root, MIGRATION_FILE);
  let pending = JSON.parse(readText(pendingPath) ?? 'null');
  // A run that advanced the baseline but stopped before removing the
  // migration file has completed the migration.
  if (pending && pending.to?.revision === baseline.revision) {
    rmSync(pendingPath, { force: true });
    pending = null;
  }
  const report = {
    from: baseline.version,
    to: target.version,
    updated: [],
    merged: [],
    added: [],
    removed: [],
    conflicts: [],
    review: [],
    notes: [],
    regenerated: [],
  };
  if (
    pending &&
    (pending.from?.revision !== baseline.revision ||
      pending.to?.revision !== target.snapshot.revision)
  )
    throw new Error(
      `an unfinished migration from ${PACKAGE} ${pending.from?.version} to ${pending.to?.version} is recorded in ${MIGRATION_FILE}, but ${target.version} is installed. Install ${pending.to?.version} again, finish that migration with pnpm run migrate, then update. Nothing was changed.`,
    );
  if (!pending && baseline.revision === target.snapshot.revision)
    return { ...report, unchanged: true };

  const base = baselineSnapshot(baseline, { installed, download });
  const { policy, snapshot } = target;
  // Durable progress of this migration, kept across reruns until it is
  // complete. Per file: `done`, `conflict` (markers written; the owner
  // resolves them), or `writing` with the content hashes from before and
  // after the write and the intended outcome, so a rerun can tell a finished
  // write from one that never happened or a later edit.
  const state = pending ?? {
    from: baseline,
    to: { version: target.version, revision: snapshot.revision },
    files: {},
  };
  const save = () => replaceJson(pendingPath, state);
  save();
  const remove = (path) => {
    rmSync(path, { force: true });
    // Directories the removed file leaves empty go with it.
    for (
      let dir = dirname(path);
      dir !== root && existsSync(dir) && readdirSync(dir).length === 0;
      dir = dirname(dir)
    )
      rmdirSync(dir);
  };
  /** Writes (or, for null, removes) a file, recording the intent first. */
  const apply = (file, ours, content, outcome, list) => {
    state.files[file] = {
      status: 'writing',
      before: hash(ours),
      after: hash(content),
      outcome,
    };
    save();
    const path = join(root, file);
    beforeWrite(file);
    if (content === null) remove(path);
    else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
    afterWrite(file);
    state.files[file] = outcome;
    save();
    list.push(file);
    if (outcome === 'conflict') report.conflicts.push(file);
  };
  const ownerSections = (text, ours, file) => {
    let result = text;
    for (const markers of policy.sections?.[file] ?? []) {
      const kept = withSection(result, markers, ours);
      if (kept === null)
        report.review.push(
          `${file}: the owner section ${markers[0]} could not be kept; restore it from your previous version`,
        );
      else result = kept;
    }
    return result;
  };
  const labels = [
    'this repository',
    `${PACKAGE} ${baseline.version}`,
    `${PACKAGE} ${target.version}`,
  ];
  /** Settles a file an earlier run touched; true when nothing is left to do. */
  const settled = (file, ours) => {
    const recorded = state.files[file];
    if (recorded === 'done') return true;
    if (recorded === 'conflict') {
      if (ours !== null && CONFLICT.test(ours)) report.conflicts.push(file);
      else {
        state.files[file] = 'done';
        save();
      }
      return true;
    }
    if (recorded?.status === 'writing') {
      const written = hash(ours) === recorded.after;
      // A marked file the owner has partly edited stays a conflict; any other
      // content is merged again like an ordinary owner change.
      const marked =
        recorded.outcome === 'conflict' && ours !== null && CONFLICT.test(ours);
      if (written || marked) {
        state.files[file] = recorded.outcome;
        save();
        if (recorded.outcome === 'conflict') report.conflicts.push(file);
        return true;
      }
      delete state.files[file];
    }
    return false;
  };

  const files = [
    ...new Set([...Object.keys(base.files), ...Object.keys(snapshot.files)]),
  ].sort();
  for (const file of files) {
    if (file === policy.rootManifest) continue;
    const theirs = snapshot.files[file] ? readText(snapshot.path(file)) : null;
    const ours = readText(join(root, file));
    if (settled(file, ours)) continue;
    if (policy.seed.includes(file)) {
      // Written once, when a starter first brings it; the owner's from then
      // on, also if they delete it.
      if (theirs !== null && ours === null && !base.files[file])
        apply(file, ours, theirs, 'done', report.added);
      continue;
    }
    const baseText = base.files[file] ? readText(base.path(file)) : null;
    if (theirs === null) {
      // The new starter no longer has this shared file.
      if (ours === null) continue;
      if (ours === baseText) apply(file, ours, null, 'done', report.removed);
      else
        report.review.push(
          `${file}: the starter removed it; you changed it, so it stays`,
        );
      continue;
    }
    if (ours === null) {
      if (baseText === null) apply(file, ours, theirs, 'done', report.added);
      else if (baseText !== theirs)
        report.review.push(
          `${file}: you removed it and the starter changed it; compare with ${PACKAGE} ${target.version} by hand`,
        );
      continue;
    }
    // Unchanged on either side, or only the owner's change: nothing to do.
    if (ours === theirs || theirs === baseText) continue;
    if (ours === baseText) {
      apply(
        file,
        ours,
        ownerSections(theirs, ours, file),
        'done',
        report.updated,
      );
      continue;
    }
    const merged = mergeText(ours, baseText ?? '', theirs, labels);
    apply(
      file,
      ours,
      ownerSections(merged.text, ours, file),
      merged.conflicts > 0 ? 'conflict' : 'done',
      merged.conflicts > 0 ? [] : report.merged,
    );
  }

  // The root manifest: tooling, SDK and script entries only. The SDK stays at
  // the repository's version; sdk-update moves it.
  const manifestFile = policy.rootManifest;
  const oursText = readText(join(root, manifestFile));
  if (!settled(manifestFile, oursText)) {
    const ours = JSON.parse(oursText);
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
    if (manifest !== formatJson(ours))
      apply(manifestFile, oursText, manifest, 'done', report.updated);
  }

  report.regenerated = regenerate(root);
  if (report.conflicts.length > 0) return { ...report, unfinished: true };
  // A new starter can change the manifest or the workspace settings, so the
  // lockfile and node_modules follow before the migration counts as done.
  if (!install(root)) {
    report.review.push(
      'pnpm install failed; fix the cause, then run pnpm run migrate again',
    );
    return { ...report, unfinished: true };
  }
  writeBaseline(root, {
    version: target.version,
    revision: snapshot.revision,
  });
  rmSync(pendingPath, { force: true });
  return report;
}

export function formatMigration(report) {
  if (report.unchanged)
    return `The shared files already match ${PACKAGE} ${report.to}; nothing to migrate.`;
  const list = (title, items) =>
    items.length ? [`${title}:`, ...items.map((item) => `  ${item}`)] : [];
  return [
    `Migration from ${PACKAGE} ${report.from} to ${report.to}${report.unfinished ? ' is unfinished' : ''}.`,
    ...list('Updated', report.updated),
    ...list('Merged', report.merged),
    ...list('Added', report.added),
    ...list('Removed', report.removed),
    ...list('Regenerated', report.regenerated),
    ...list(
      'Conflicts (resolve the marked lines, then run pnpm run migrate)',
      report.conflicts,
    ),
    ...list('Review by hand', report.review),
    ...list('Notes', report.notes),
    report.unfinished
      ? 'The baseline stays at the old starter until the migration is finished.'
      : 'Run pnpm run check and review the changes before you commit them.',
  ].join('\n');
}

export function main(args = scriptArgs()) {
  if (args.length > 0) throw new Error('Usage: pnpm run migrate');
  const report = migrate(repositoryRoot());
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
