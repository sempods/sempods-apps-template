#!/usr/bin/env node
// Applies the starter of the installed @sempods/apps to this repository, from
// the starter it last applied (.sempods-baseline.json): shared files get a
// three-way merge that keeps the owner sections verbatim, new seed files are
// added, the root manifest follows only its template entries, and the apps'
// generated configuration is rewritten. The baseline advances only once
// everything is applied without unresolved conflicts; until then
// MIGRATION_FILE records the unfinished migration and a rerun continues it.
// Usage: pnpm run migrate
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
import { readJson, writeJson, formatJson } from './lib/json.mjs';
import { mergeManifest, mergeText, withSection } from './lib/merge.mjs';
import { repositoryRoot, TOOLING } from './lib/paths.mjs';
import { INSTALL, pnpm, scriptArgs } from './lib/pnpm.mjs';
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
// A line git merge-file starts a conflict with.
const CONFLICT = /^<{7} /m;

const readText = (path) =>
  existsSync(path) ? readFileSync(path, 'utf8') : null;

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

/** What `check` reports about the repository's starter state. */
export function migrationState(root, installed = TOOLING) {
  const baseline = readBaseline(root);
  if (!baseline || !existsSync(join(installed, 'shared', 'snapshot.json')))
    return undefined;
  const pending = readText(join(root, MIGRATION_FILE));
  if (pending) {
    const { to, conflicts = [] } = JSON.parse(pending);
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
    afterWrite = () => {},
  } = {},
) {
  const baseline = readBaseline(root);
  if (!baseline)
    throw new Error(
      `${BASELINE_FILE} is missing: this repository was not created from the ${PACKAGE} starter`,
    );
  const target = installedStarter(installed);
  const pendingPath = join(root, MIGRATION_FILE);
  const pending = JSON.parse(readText(pendingPath) ?? 'null');
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
  if (!pending && baseline.revision === target.snapshot.revision)
    return { ...report, unchanged: true };

  const base = baselineSnapshot(baseline, { installed, download });
  const { policy, snapshot } = target;
  // Files whose conflicts an earlier run left; the owner resolves them.
  const resolving = new Set(pending?.conflicts ?? []);
  // An install an earlier run still owed: its manifest is already written.
  let installPending = pending?.install === true;
  const save = () =>
    writeJson(pendingPath, {
      from: baseline,
      to: { version: target.version, revision: snapshot.revision },
      conflicts: report.conflicts,
      install: installPending,
    });
  save();
  const write = (file, content) => {
    const path = join(root, file);
    if (content === null) {
      rmSync(path, { force: true });
      // Directories the removed file leaves empty go with it.
      for (
        let dir = dirname(path);
        dir !== root && existsSync(dir) && readdirSync(dir).length === 0;
        dir = dirname(dir)
      )
        rmdirSync(dir);
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
    afterWrite(file);
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

  const files = [
    ...new Set([...Object.keys(base.files), ...Object.keys(snapshot.files)]),
  ].sort();
  for (const file of files) {
    if (file === policy.rootManifest) continue;
    const theirs = snapshot.files[file] ? readText(snapshot.path(file)) : null;
    const ours = readText(join(root, file));
    if (policy.seed.includes(file)) {
      // Written once; the owner's from then on.
      if (theirs !== null && ours === null) {
        write(file, theirs);
        report.added.push(file);
      }
      continue;
    }
    const baseText = base.files[file] ? readText(base.path(file)) : null;
    if (resolving.has(file)) {
      if (ours !== null && CONFLICT.test(ours)) report.conflicts.push(file);
      continue;
    }
    if (theirs === null) {
      // The new starter no longer has this shared file.
      if (ours === null) continue;
      if (ours === baseText) {
        write(file, null);
        report.removed.push(file);
      } else
        report.review.push(
          `${file}: the starter removed it; you changed it, so it stays`,
        );
      continue;
    }
    if (ours === null) {
      if (baseText === null) {
        write(file, theirs);
        report.added.push(file);
      } else if (baseText !== theirs)
        report.review.push(
          `${file}: you removed it and the starter changed it; compare with ${PACKAGE} ${target.version} by hand`,
        );
      continue;
    }
    // Unchanged on either side, or only the owner's change: nothing to do.
    if (ours === theirs || theirs === baseText) continue;
    if (ours === baseText) {
      write(file, ownerSections(theirs, ours, file));
      report.updated.push(file);
      continue;
    }
    const merged = mergeText(ours, baseText ?? '', theirs, labels);
    write(file, ownerSections(merged.text, ours, file));
    if (merged.conflicts > 0) {
      report.conflicts.push(file);
      save();
    } else report.merged.push(file);
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
  const sdkVersion = ours.devDependencies?.[policy.sdk[0]];
  const manifest = mergeManifest(
    ours,
    [starterManifest(base, baseline.version)],
    starterManifest(snapshot, target.version),
    policy.sdk,
    sdkVersion,
    report.notes,
    manifestFile,
  );
  if (formatJson(manifest) !== formatJson(ours)) {
    installPending = true;
    save();
    write(manifestFile, formatJson(manifest));
    report.updated.push(manifestFile);
  }

  report.regenerated = regenerate(root);
  if (report.conflicts.length > 0) {
    save();
    return { ...report, unfinished: true };
  }
  if (installPending && !install(root)) {
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
