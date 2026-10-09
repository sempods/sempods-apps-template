import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
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
import { runInNewContext } from 'node:vm';

// These tests guard the template's own workflow. A copy may merge or adapt
// sdk-update.yml, so they skip there instead of failing the copy's checks.
// Setup removes the maintainer guide from a copy and updates do not restore it.
const template = existsSync(
  new URL('../../../docs/maintaining.md', import.meta.url),
);
const workflow = template
  ? readFileSync(
      new URL('../../../.github/workflows/sdk-update.yml', import.meta.url),
      'utf8',
    )
  : '';
const gate = workflow.match(/^    if: >-\n((?:      .*\n)+)/m);
const script = workflow.match(
  /          node --input-type=module <<'JS'\n([\s\S]*?)          JS/,
);
if (template) {
  assert.ok(gate, 'SDK preference job must have an explicit event gate');
  assert.ok(script, 'SDK preference job must read the repository choice');
}
const source = script?.[1].replace(/^          /gm, '');
const upstream = 'sempods/sempods-apps-template';
const instance = 'owner/apps';

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

describe('SDK update workflow', {
  skip: !template && 'the workflow is shared with the owner in a copy',
}, () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sempods-sdk-preference-'));
    const lib = join(root, '.sempods/scripts/lib');
    mkdirSync(lib, { recursive: true });
    cpSync(new URL('../lib/apps.mjs', import.meta.url), join(lib, 'apps.mjs'));
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

  it('never runs scheduled updates in the upstream template', () => {
    assert.equal(allowed('schedule', upstream), false);
  });

  it('keeps manual dispatch available with and without opt-in', () => {
    for (const repository of [upstream, instance])
      assert.equal(allowed('workflow_dispatch', repository), true);
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
