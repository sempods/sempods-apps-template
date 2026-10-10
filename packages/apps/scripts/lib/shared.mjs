// Snapshots of the starter and the baseline that records which snapshot a
// repository last applied.
//
// A published package carries the starter files (starter/ in its source) and
// their index in shared/snapshot.json:
//   { "format": 1, "revision": "<sha256>", "files": { "<path>": "<sha256>" } }
// Each file is stored as shared/files/<sha256> of its content: npm leaves some
// names out of a package (.gitignore, .npmrc), and a content name survives
// packing whatever the file's path. The revision is the hash of the index, so
// the same shared files always give the same revision, whichever package
// version ships them.
//
// A repository records the snapshot it last applied in BASELINE_FILE:
//   { "format": 1, "package": "@sempods/apps", "version": "<x.y.z>",
//     "revision": "<sha256>" }
// The version names a published package whose snapshot has that revision, so
// the baseline stays retrievable from the registry after a newer version is
// installed. Installing a package never changes the baseline; only applying
// its shared files does.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { readJson, replaceJson, writeJson } from './json.mjs';
import { EXACT_VERSION } from './sdk.mjs';

export const FORMAT = 1;
export const PACKAGE = '@sempods/apps';
export const BASELINE_FILE = '.sempods-baseline.json';
const HASH = /^[0-9a-f]{64}$/;

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Whether a policy pattern, with `*` for one path segment, names a file. */
export function matches(pattern, path) {
  const p = pattern.split('/');
  const f = path.split('/');
  return (
    p.length === f.length && p.every((part, i) => part === '*' || part === f[i])
  );
}

function walk(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === '.git') return [];
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? walk(path, base)
      : [relative(base, path).split(sep).join('/')];
  });
}

/** Every file of a starter directory, sorted. */
export function starterFiles(dir) {
  return walk(dir).sort();
}

const revisionOf = (index) => sha256(JSON.stringify(index));

/** The index of a set of shared files and its revision. */
export function snapshotOf(root, files) {
  const index = Object.fromEntries(
    [...files]
      .sort()
      .map((file) => [file, sha256(readFileSync(join(root, file)))]),
  );
  return { format: FORMAT, revision: revisionOf(index), files: index };
}

/** Writes shared/files/<sha256> and shared/snapshot.json for a starter. */
export function writeSnapshot(root, outDir) {
  const files = starterFiles(root);
  const snapshot = snapshotOf(root, files);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'files'), { recursive: true });
  for (const file of files)
    cpSync(join(root, file), join(outDir, 'files', snapshot.files[file]));
  writeJson(join(outDir, 'snapshot.json'), snapshot);
  return snapshot;
}

/**
 * Reads a snapshot directory and verifies the index and every stored file.
 * `path(file)` is where the content of a shared file such as AGENTS.md is.
 */
export function readSnapshot(dir) {
  const snapshot = readJson(join(dir, 'snapshot.json'));
  if (snapshot.format !== FORMAT)
    throw new Error(`${dir}: unknown snapshot format ${snapshot.format}`);
  if (revisionOf(snapshot.files) !== snapshot.revision)
    throw new Error(`${dir}: the index does not match its revision`);
  for (const [file, hash] of Object.entries(snapshot.files)) {
    const stored = join(dir, 'files', hash);
    if (!existsSync(stored) || sha256(readFileSync(stored)) !== hash)
      throw new Error(`${dir}: ${file} is missing or does not match its index`);
  }
  return {
    ...snapshot,
    path: (file) => {
      if (!Object.hasOwn(snapshot.files, file))
        throw new Error(`${file} is not a shared file of this snapshot`);
      return join(dir, 'files', snapshot.files[file]);
    },
  };
}

/** The baseline a repository records, or undefined when it has none. */
export function readBaseline(root) {
  const file = join(root, BASELINE_FILE);
  if (!existsSync(file)) return undefined;
  const baseline = readJson(file);
  const problems = [];
  if (baseline.format !== FORMAT) problems.push(`format must be ${FORMAT}`);
  if (baseline.package !== PACKAGE) problems.push(`package must be ${PACKAGE}`);
  if (!EXACT_VERSION.test(baseline.version ?? ''))
    problems.push('version must be an exact version');
  if (!HASH.test(baseline.revision ?? ''))
    problems.push('revision must be a sha256 hex digest');
  if (problems.length > 0)
    throw new Error(`${BASELINE_FILE}: ${problems.join('; ')}`);
  return baseline;
}

/** Records that a repository has applied the snapshot of a package version. */
export function writeBaseline(root, { version, revision }) {
  replaceJson(join(root, BASELINE_FILE), {
    format: FORMAT,
    package: PACKAGE,
    version,
    revision,
  });
}

/**
 * Downloads and unpacks a published package version; returns its directory.
 * SEMPODS_APPS_PACKAGES may name a directory of packed tarballs
 * (sempods-apps-<version>.tgz) to use instead of the registry, for offline
 * tests of versions not published yet.
 */
export function downloadPackage(version) {
  const work = mkdtempSync(join(tmpdir(), 'sempods-apps-'));
  const local = process.env.SEMPODS_APPS_PACKAGES;
  const run = (command, args) => {
    const result = spawnSync(command, args, {
      cwd: work,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (result.status !== 0)
      throw new Error(
        `${command} ${args.join(' ')} failed: ${result.stderr.trim()}`,
      );
    return result.stdout;
  };
  const packed = local && join(local, `sempods-apps-${version}.tgz`);
  const tarball =
    packed && existsSync(packed)
      ? packed
      : run('npm', ['pack', `${PACKAGE}@${version}`, '--silent'])
          .trim()
          .split('\n')
          .at(-1);
  run('tar', ['-xzf', tarball]);
  return join(work, 'package');
}

/**
 * The snapshot a baseline names: from the installed package when it is that
 * version, otherwise from the published one. `packageDir` is that package.
 */
export function baselineSnapshot(
  baseline,
  { installed, download = downloadPackage } = {},
) {
  const local =
    installed &&
    readJson(join(installed, 'package.json')).version === baseline.version;
  const dir = local ? installed : download(baseline.version);
  const snapshot = readSnapshot(join(dir, 'shared'));
  if (snapshot.revision !== baseline.revision)
    throw new Error(
      `${PACKAGE}@${baseline.version} ships shared-file revision ${snapshot.revision}, not the recorded ${baseline.revision}`,
    );
  return { ...snapshot, packageDir: dir };
}
