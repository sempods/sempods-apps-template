import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import semver from 'semver';
import { readJson } from '../scripts/lib/json.mjs';
import { TOOLING } from '../scripts/lib/paths.mjs';
import { matches, starterFiles } from '../scripts/lib/shared.mjs';
import { templateRoot } from './fixture.mjs';

// Every file of the starter has a role in the update policy: shared files are
// merged on update, seed files are written once and then belong to the owner,
// and the root manifest changes only in its template entries. A file without
// a role would reach new repositories but never their updates.
describe('starter and update policy', () => {
  const starter = join(TOOLING, 'starter');
  const policy = readJson(join(TOOLING, 'update-policy.json'));
  const files = starterFiles(starter);
  const roles = (file) =>
    [
      policy.shared.some((pattern) => matches(pattern, file)) && 'shared',
      policy.seed.includes(file) && 'seed',
      policy.rootManifest === file && 'rootManifest',
    ].filter(Boolean);

  it('gives every starter file exactly one role', () => {
    const wrong = files.filter((file) => roles(file).length !== 1);
    assert.deepEqual(
      wrong,
      [],
      'name each in packages/apps/update-policy.json: shared, seed or rootManifest',
    );
  });

  it('names only files the starter has', () => {
    const named = [...policy.shared, ...policy.seed, policy.rootManifest];
    const unused = named.filter(
      (pattern) => !files.some((file) => matches(pattern, file)),
    );
    assert.deepEqual(unused, []);
  });

  it('keeps the owner sections in shared files', () => {
    for (const [file, sections] of Object.entries(policy.sections)) {
      assert.deepEqual(roles(file), ['shared'], file);
      const text = readFileSync(join(starter, file), 'utf8');
      for (const [begin, end] of sections)
        assert.ok(
          text.indexOf(begin) >= 0 && text.indexOf(end) > text.indexOf(begin),
          `${file} must contain ${begin} … ${end}`,
        );
    }
  });

  it("matches this repository's toolchain and the tooling's SDK range", () => {
    const manifest = readJson(join(starter, 'package.json'));
    const root = readJson(join(templateRoot, 'package.json'));
    const tooling = readJson(join(TOOLING, 'package.json'));
    assert.equal(manifest.packageManager, root.packageManager);
    assert.deepEqual(manifest.engines, root.engines);
    assert.equal(
      readFileSync(join(starter, '.node-version'), 'utf8'),
      readFileSync(join(templateRoot, '.node-version'), 'utf8'),
    );
    // The creator writes the tooling version; the starter only reserves it.
    assert.equal(manifest.devDependencies['@sempods/apps'], '0.0.0');
    for (const sdk of policy.sdk)
      assert.ok(
        semver.satisfies(
          manifest.devDependencies[sdk],
          tooling.peerDependencies[sdk],
        ),
        `the starter's ${sdk} must be in the range the tooling supports`,
      );
  });
});
