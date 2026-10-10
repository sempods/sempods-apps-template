import assert from 'node:assert/strict';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  BASELINE_FILE,
  baselineSnapshot,
  readBaseline,
  readSnapshot,
  starterFiles,
  writeBaseline,
  writeSnapshot,
} from '../scripts/lib/shared.mjs';

describe('shared-file snapshots and baselines', () => {
  let work;
  // A starter; .gitignore and .npmrc are names npm leaves out of a package.
  const template = () => join(work, 'starter');
  const file = (root, path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  // A published package: its manifest and the snapshot packed into it.
  const publish = (version) => {
    const dir = join(work, `package-${version}`);
    file(dir, 'package.json', JSON.stringify({ version }));
    return { dir, ...writeSnapshot(template(), join(dir, 'shared')) };
  };
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'sempods-shared-'));
    file(template(), 'AGENTS.md', '# Agents\n');
    file(template(), '.github/workflows/check.yml', 'name: Check\n');
    file(template(), '.gitignore', 'node_modules/\n');
    file(template(), '.npmrc', 'engine-strict=true\n');
    file(template(), 'node_modules/x/AGENTS.md', 'not a starter file\n');
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  it('snapshots the starter files under a content revision', () => {
    assert.deepEqual(starterFiles(template()), [
      '.github/workflows/check.yml',
      '.gitignore',
      '.npmrc',
      'AGENTS.md',
    ]);
    const first = publish('1.0.0');
    // Another version with the same shared files has the same revision.
    assert.equal(publish('1.0.1').revision, first.revision);
    file(template(), 'AGENTS.md', '# Agents, revised\n');
    const changed = publish('1.1.0');
    assert.notEqual(changed.revision, first.revision);
    const read = readSnapshot(join(changed.dir, 'shared'));
    assert.equal(read.revision, changed.revision);
    assert.equal(
      readFileSync(read.path('AGENTS.md'), 'utf8'),
      '# Agents, revised\n',
    );
    assert.equal(
      readFileSync(read.path('.gitignore'), 'utf8'),
      'node_modules/\n',
    );
    // Stored under content names, so packing keeps every file.
    for (const name of readdirSync(join(changed.dir, 'shared', 'files')))
      assert.match(name, /^[0-9a-f]{64}$/);
    assert.throws(() => read.path('README.md'), /not a shared file/);
  });

  it('rejects a snapshot whose files do not match its index', () => {
    const { dir, files } = publish('1.0.0');
    const stored = join(dir, 'shared', 'files', files['AGENTS.md']);
    writeFileSync(stored, 'edited\n');
    assert.throws(
      () => readSnapshot(join(dir, 'shared')),
      /AGENTS\.md is missing or does not match its index/,
    );
    rmSync(stored);
    assert.throws(
      () => readSnapshot(join(dir, 'shared')),
      /AGENTS\.md is missing/,
    );
  });

  it('records a baseline and validates it', () => {
    const repo = join(work, 'repo');
    mkdirSync(repo);
    assert.equal(readBaseline(repo), undefined);
    const { revision } = publish('1.0.0');
    writeBaseline(repo, { version: '1.0.0', revision });
    assert.deepEqual(readBaseline(repo), {
      format: 1,
      package: '@sempods/apps',
      version: '1.0.0',
      revision,
    });
    writeFileSync(
      join(repo, BASELINE_FILE),
      JSON.stringify({ format: 1, package: 'other', version: '1.x' }),
    );
    assert.throws(
      () => readBaseline(repo),
      /package must be @sempods\/apps; version must be an exact version; revision must be/,
    );
  });

  it('finds the recorded snapshot after a newer package is installed', () => {
    const old = publish('1.0.0');
    file(template(), 'AGENTS.md', '# Agents, revised\n');
    const installed = publish('1.1.0');
    const baseline = { version: '1.0.0', revision: old.revision };
    const downloads = [];
    const download = (version) => {
      downloads.push(version);
      return join(work, `package-${version}`);
    };
    const snapshot = baselineSnapshot(baseline, {
      installed: installed.dir,
      download,
    });
    assert.deepEqual(downloads, ['1.0.0']);
    assert.equal(
      readFileSync(snapshot.path('AGENTS.md'), 'utf8'),
      '# Agents\n',
    );
    // The installed version itself needs no download.
    baselineSnapshot(
      { version: '1.1.0', revision: installed.revision },
      { installed: installed.dir, download },
    );
    assert.deepEqual(downloads, ['1.0.0']);
    // A published version with another revision is not that baseline.
    assert.throws(
      () =>
        baselineSnapshot(
          { version: '1.0.0', revision: installed.revision },
          { installed: installed.dir, download },
        ),
      /ships shared-file revision/,
    );
  });

  it('is independent of where the snapshot is unpacked', () => {
    const { dir, revision } = publish('1.0.0');
    const moved = join(work, 'elsewhere');
    cpSync(dir, moved, { recursive: true });
    assert.equal(readSnapshot(join(moved, 'shared')).revision, revision);
  });
});
