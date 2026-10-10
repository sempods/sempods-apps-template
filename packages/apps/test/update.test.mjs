import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { writeJson } from '../scripts/lib/json.mjs';
import { refuseUnsafe } from '../scripts/migrate.mjs';
import {
  installTarget,
  preflight,
  prerequisiteOrder,
} from '../scripts/update.mjs';

describe('update', () => {
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sempods-update-'));
    writeJson(join(root, 'package.json'), {
      devDependencies: { '@sempods/apps': '2.0.0' },
    });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const baseline = (version) =>
    writeJson(join(root, '.sempods-baseline.json'), {
      format: 1,
      package: '@sempods/apps',
      version,
      revision: 'a'.repeat(64),
    });

  it('installs the target and verifies what node_modules has', () => {
    const runs = [];
    let installed = '1.0.0';
    installTarget(root, '2.0.0', {
      run: (args) => {
        runs.push(args.join(' '));
        installed = '2.0.0';
        return true;
      },
      installed: () => installed,
    });
    assert.deepEqual(runs, ['add --save-dev --save-exact @sempods/apps@2.0.0']);
    assert.throws(
      () =>
        installTarget(root, '3.0.0', {
          run: () => true,
          installed: () => '2.0.0',
        }),
      /2\.0\.0 is installed instead of 3\.0\.0/,
    );
  });

  it('never goes back behind the baseline, declared or installed version', () => {
    // The baseline can lag behind when releases kept the same starter.
    baseline('1.0.0');
    assert.throws(
      () => refuseUnsafe(root, '1.5.0'),
      /older than this repository's 2\.0\.0[\s\S]*Nothing was changed/,
    );
    refuseUnsafe(root, '2.0.0');
    const installed = join(root, 'node_modules', '@sempods', 'apps');
    mkdirSync(installed, { recursive: true });
    writeJson(join(installed, 'package.json'), { version: '2.1.0' });
    assert.throws(
      () => refuseUnsafe(root, '2.0.0'),
      /older than this repository's 2\.1\.0/,
    );
    baseline('3.0.0');
    assert.throws(
      () => refuseUnsafe(root, '2.1.0'),
      /older than this repository's 3\.0\.0/,
    );
  });

  it('waits for an unfinished SDK update', () => {
    writeFileSync(join(root, '.sdk-update-pending'), '0.6.0\n');
    assert.throws(
      () => refuseUnsafe(root, '2.0.0'),
      /SDK update is unfinished[\s\S]*Nothing was changed/,
    );
  });

  it('names the tools to upgrade first, in order', () => {
    const target = {
      version: '2.0.0',
      engines: { node: '>=26.1.0', pnpm: '>=12.0.0' },
    };
    const problems = preflight(target, {
      node: '24.15.0',
      pnpmVersion: '11.28.2',
    });
    assert.deepEqual(
      problems.map(({ tool }) => tool),
      ['Node', 'pnpm'],
    );
    const order = prerequisiteOrder(target, problems);
    assert.match(order, /Nothing was changed/);
    assert.match(
      order,
      /1\. Install a Node version in >=26\.1\.0 and write it to \.node-version/,
    );
    assert.match(
      order,
      /2\. Set packageManager in package\.json to a pnpm version in >=12\.0\.0/,
    );
    assert.match(order, /3\. Run pnpm run update 2\.0\.0 again/);
    assert.deepEqual(
      preflight(target, { node: '26.1.0', pnpmVersion: '12.0.1' }),
      [],
    );
  });
});
