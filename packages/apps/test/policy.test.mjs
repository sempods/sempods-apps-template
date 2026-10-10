import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { readJson } from '../scripts/lib/json.mjs';
import { matches } from '../scripts/lib/shared.mjs';
import { templateRoot } from './fixture.mjs';

// Shipped files the policy does not name. update-template never changes them
// (the generated lockfile apart), so a change to one never reaches a copy.
const UNNAMED = {
  'apps.json': "the owner's manifest of apps",
  'apps/.gitkeep': 'keeps the empty apps directory',
  'pnpm-lock.yaml': 'regenerated from the updated manifests',
};

// update-template treats a file the policy does not name as the owner's and
// reports no template change to it. Every file the template ships must
// therefore be named, so that a new or changed file reaches the copies.
describe('update policy', () => {
  const policy = readJson(
    join(templateRoot, 'packages', 'apps', 'update-policy.json'),
  );
  const tracked = spawnSync('git', ['ls-files', '-z'], {
    cwd: templateRoot,
    encoding: 'utf8',
  });
  assert.equal(tracked.status, 0, 'the policy check needs a Git checkout');
  const files = tracked.stdout.split('\0').filter(Boolean);
  const under = (dir, file) => file === dir || file.startsWith(`${dir}/`);
  const named = (file) =>
    policy.replace.some((dir) => under(dir, file)) ||
    [
      ...policy.replaceIfPresent,
      ...policy.shared,
      ...policy.ownerAfterSetup,
      policy.rootManifest,
      policy.appManifests,
    ].some((pattern) => matches(pattern, file));

  it('names every file the template ships', () => {
    const unnamed = files.filter((file) => !named(file) && !(file in UNNAMED));
    assert.deepEqual(
      unnamed,
      [],
      'name them in packages/apps/update-policy.json, or add them to UNNAMED ' +
        "with the reason they are the owner's",
    );
  });

  it('lists only unnamed files that the template ships', () => {
    for (const file of Object.keys(UNNAMED)) {
      assert.ok(files.includes(file), `${file} is not shipped`);
      assert.ok(!named(file), `${file} is already named in the policy`);
    }
  });

  it('ships no retired path', () => {
    for (const path of policy.retired)
      assert.ok(!files.some((file) => under(path, file)), `${path} is retired`);
  });
});
