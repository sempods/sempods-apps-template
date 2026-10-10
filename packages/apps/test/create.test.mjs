import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { create, packagedStarter, shellWord } from '../scripts/create.mjs';
import { readApps } from '../scripts/lib/apps.mjs';
import { TOOLING } from '../scripts/lib/paths.mjs';
import {
  baselineSnapshot,
  readBaseline,
  readSnapshot,
  writeSnapshot,
} from '../scripts/lib/shared.mjs';
import { staticProblems } from '../scripts/check.mjs';

describe('create', () => {
  let work;
  let snapshot;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'sempods-create-'));
    // What prepack writes into the published package.
    writeSnapshot(join(TOOLING, 'starter'), join(work, 'package', 'shared'));
    snapshot = readSnapshot(join(work, 'package', 'shared'));
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  it('writes the starter and records it as the baseline', () => {
    const dir = create(join(work, 'My-Apps'), { snapshot, version: '1.2.3' });
    for (const file of Object.keys(snapshot.files))
      assert.ok(existsSync(join(dir, file)), file);
    const manifest = JSON.parse(
      readFileSync(join(dir, 'package.json'), 'utf8'),
    );
    assert.equal(manifest.name, 'my-apps');
    assert.equal(manifest.devDependencies['@sempods/apps'], '1.2.3');
    assert.deepEqual(readApps(dir).apps, []);
    // No maintainer files and nothing to adapt.
    for (const path of ['LICENSE', 'CONTRIBUTING.md', 'docs/maintaining.md'])
      assert.equal(existsSync(join(dir, path)), false, path);
    assert.equal(
      readFileSync(join(dir, '.gitignore'), 'utf8'),
      readFileSync(join(TOOLING, 'starter', '.gitignore'), 'utf8'),
    );
    const baseline = readBaseline(dir);
    assert.deepEqual(baseline, {
      format: 1,
      package: '@sempods/apps',
      version: '1.2.3',
      revision: snapshot.revision,
    });
    // The baseline names exactly the snapshot used, also once a newer
    // package is installed.
    const installed = join(work, 'newer');
    mkdirSync(installed);
    writeFileSync(
      join(installed, 'package.json'),
      JSON.stringify({ version: '1.3.0' }),
    );
    const found = baselineSnapshot(baseline, {
      installed,
      download: () => join(work, 'package'),
    });
    assert.equal(found.revision, snapshot.revision);
    assert.equal(readBaseline(dir).version, '1.2.3');
    assert.deepEqual(staticProblems(dir), []);
  });

  it('refuses a directory that is not empty', () => {
    const dir = join(work, 'taken');
    mkdirSync(dir);
    writeFileSync(join(dir, 'notes.txt'), 'mine\n');
    assert.throws(
      () => create(dir, { snapshot, version: '1.2.3' }),
      /already exists and is not empty/,
    );
    assert.equal(readFileSync(join(dir, 'notes.txt'), 'utf8'), 'mine\n');
  });

  it('prints the directory as one shell word', () => {
    assert.equal(shellWord('my-apps'), 'my-apps');
    assert.equal(shellWord('../apps/My.Apps'), '../apps/My.Apps');
    assert.equal(shellWord('My Apps'), "'My Apps'");
    assert.equal(shellWord("Dan's apps"), "'Dan'\\''s apps'");
    assert.equal(shellWord('a;b$(c)'), "'a;b$(c)'");
  });

  it('works only from a packed package', () => {
    // The source workspace has no packed starter.
    if (existsSync(join(TOOLING, 'shared', 'snapshot.json'))) return;
    assert.throws(() => packagedStarter(), /no packed starter/);
  });
});
