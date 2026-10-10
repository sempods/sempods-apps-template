import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';

const instance = 'owner/apps';

// The starter's SDK update workflow, as generated repositories run it.
const workflow = readFileSync(
  new URL('../starter/.github/workflows/sdk-update.yml', import.meta.url),
  'utf8',
);
const gate = workflow.match(/^    if: >-\n((?:      .*\n)+)/m);
const script = workflow.match(
  /          node --input-type=module <<'JS'\n([\s\S]*?)          JS/,
);
assert.ok(gate, 'SDK preference job must have an explicit event gate');
assert.ok(script, 'SDK preference job must read the repository choice');
const source = script?.[1].replace(/^          /gm, '');

// The event gate uses the string-comparison subset shared by Actions and JS.
// The preference tests execute the actual workflow script against a fixture.
const allowed = (event, repository) =>
  runInNewContext(gate[1].trim(), {
    github: { event_name: event, repository },
  });

let root;
const choice = (event, sdkAutoUpdates, inherited = 'true') => {
  writeFileSync(
    join(root, 'apps.json'),
    JSON.stringify({ schemaVersion: 1, apps: [], sdkAutoUpdates }),
  );
  const output = join(root, 'output');
  writeFileSync(output, '');
  const result = spawnSync(process.execPath, ['--input-type=module'], {
    cwd: root,
    input: source,
    encoding: 'utf8',
    env: {
      ...process.env,
      EVENT_NAME: event,
      GITHUB_OUTPUT: output,
      SEMPODS_SDK_AUTO_UPDATES: inherited,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return readFileSync(output, 'utf8').trim();
};

describe('SDK update workflow', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sempods-sdk-preference-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('does not enable a deferred or disabled choice from inherited variables', () => {
    for (const sdkAutoUpdates of [undefined, false])
      for (const inherited of ['', 'false', 'true'])
        assert.equal(choice('schedule', sdkAutoUpdates, inherited), 'enabled=false');
  });

  it('enables scheduled updates only from the repository manifest', () => {
    assert.equal(allowed('schedule', instance), true);
    assert.equal(choice('schedule', true), 'enabled=true');
  });

  it('keeps manual dispatch available with and without opt-in', () => {
    assert.equal(allowed('workflow_dispatch', instance), true);
    for (const sdkAutoUpdates of [undefined, false, true])
      assert.equal(choice('workflow_dispatch', sdkAutoUpdates), 'enabled=true');
  });

  it('does not allow unrelated events to start the preference job', () => {
    assert.equal(allowed('pull_request', instance), false);
  });

  it('gates the write-capable job on the read-only preference result', () => {
    assert.match(workflow, /  update:\n    needs: preference\n    if: needs\.preference\.outputs\.enabled == 'true'/);
    assert.match(workflow, /permissions:\n  contents: read/);
    const preference = workflow.split('  preference:')[1].split('  update:')[0];
    assert.doesNotMatch(preference, /contents: write|pull-requests: write|vars\./);
  });
});
