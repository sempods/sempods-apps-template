import assert from 'node:assert/strict';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
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
  sharedFiles,
  writeBaseline,
  writeSnapshot,
} from '../scripts/lib/shared.mjs';

const policy = { shared: ['AGENTS.md', '.github/workflows/check.yml'] };

describe('shared-file snapshots and baselines', () => {
  let work;
  const template = () => join(work, 'template');
  const file = (root, path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  // A published package: its manifest and the snapshot packed into it.
  const publish = (version) => {
    const dir = join(work, `package-${version}`);
    file(dir, 'package.json', JSON.stringify({ version }));
    return { dir, ...writeSnapshot(template(), policy, join(dir, 'shared')) };
  };
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'sempods-shared-'));
    file(template(), 'AGENTS.md', '# Agents\n');
    file(template(), '.github/workflows/check.yml', 'name: Check\n');
    file(template(), 'apps/demo/AGENTS.md', 'not shared\n');
    file(template(), 'node_modules/x/AGENTS.md', 'not shared\n');
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  it('snapshots exactly the shared files under a content revision', () => {
    assert.deepEqual(sharedFiles(template(), policy), [
      '.github/workflows/check.yml',
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
      readFileSync(join(read.dir, 'AGENTS.md'), 'utf8'),
      '# Agents, revised\n',
    );
  });

  it('rejects a snapshot whose files do not match its index', () => {
    const { dir } = publish('1.0.0');
    writeFileSync(join(dir, 'shared', 'files', 'AGENTS.md'), 'edited\n');
    assert.throws(
      () => readSnapshot(join(dir, 'shared')),
      /do not match their index/,
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
      readFileSync(join(snapshot.dir, 'AGENTS.md'), 'utf8'),
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
