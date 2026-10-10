// Snapshots of the shared files and the baseline that records which snapshot
// a repository last applied.
//
// A published package carries the shared files of its template commit in
// shared/files/ and their index in shared/snapshot.json:
//   { "format": 1, "revision": "<sha256>", "files": { "<path>": "<sha256>" } }
// The revision is the hash of the index, so the same shared files always give
// the same revision, whichever package version ships them.
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
import { dirname, join, relative, sep } from 'node:path';
import { readJson, writeJson } from './json.mjs';
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

/** The shared files of a template checkout, as the update policy names them. */
export function sharedFiles(root, policy) {
  return walk(root)
    .filter((file) => policy.shared.some((pattern) => matches(pattern, file)))
    .sort();
}

/** The index of a set of shared files and its revision. */
export function snapshotOf(root, files) {
  const index = Object.fromEntries(
    [...files]
      .sort()
      .map((file) => [file, sha256(readFileSync(join(root, file)))]),
  );
  return {
    format: FORMAT,
    revision: sha256(JSON.stringify(index)),
    files: index,
  };
}

/** Writes shared/files/ and shared/snapshot.json for a package. */
export function writeSnapshot(root, policy, outDir) {
  const files = sharedFiles(root, policy);
  rmSync(outDir, { recursive: true, force: true });
  for (const file of files) {
    mkdirSync(dirname(join(outDir, 'files', file)), { recursive: true });
    cpSync(join(root, file), join(outDir, 'files', file));
  }
  const snapshot = snapshotOf(root, files);
  writeJson(join(outDir, 'snapshot.json'), snapshot);
  return snapshot;
}

/** Reads a snapshot directory and verifies every file against its index. */
export function readSnapshot(dir) {
  const snapshot = readJson(join(dir, 'snapshot.json'));
  if (snapshot.format !== FORMAT)
    throw new Error(`${dir}: unknown snapshot format ${snapshot.format}`);
  const files = Object.keys(snapshot.files);
  const actual = snapshotOf(join(dir, 'files'), files);
  if (actual.revision !== snapshot.revision)
    throw new Error(`${dir}: the shared files do not match their index`);
  return { ...snapshot, dir: join(dir, 'files') };
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
  writeJson(join(root, BASELINE_FILE), {
    format: FORMAT,
    package: PACKAGE,
    version,
    revision,
  });
}

/** Downloads and unpacks a published package version; returns its directory. */
export function downloadPackage(version) {
  const work = mkdtempSync(join(tmpdir(), 'sempods-apps-'));
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
  const tarball = run('npm', ['pack', `${PACKAGE}@${version}`, '--silent'])
    .trim()
    .split('\n')
    .at(-1);
  run('tar', ['-xzf', tarball]);
  return join(work, 'package');
}

/**
 * The snapshot a baseline names: from the installed package when it is that
 * version, otherwise from the published one.
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
  return snapshot;
}
