import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';

const workflow = readFileSync(
  new URL('../../../.github/workflows/sdk-update.yml', import.meta.url),
  'utf8',
);
const gate = workflow.match(/^    if: >-\n((?:      .*\n)+)/m);
assert.ok(gate, 'SDK update job must have an explicit gate');

// Evaluate the actual gate, which uses only string comparisons and boolean
// operators shared by Actions and JavaScript. Model an unset Actions variable
// as the empty string; actionlint checks the workflow's Actions syntax.
const expression = gate[1].trim();
const upstream = 'sempods/sempods-apps-template';
const instance = 'owner/apps';
const runs = (event, repository, optIn = '') =>
  runInNewContext(expression, {
    github: { event_name: event, repository },
    vars: { SEMPODS_SDK_AUTO_UPDATES: optIn },
  });

describe('SDK update workflow', () => {
  it('skips scheduled updates when the owner has not opted in', () => {
    for (const choice of ['', 'false', '1', 'yes'])
      assert.equal(runs('schedule', instance, choice), false, choice);
  });

  it('runs scheduled updates in an opted-in instance', () => {
    assert.equal(runs('schedule', instance, 'true'), true);
  });

  it('never runs scheduled updates in the upstream template', () => {
    for (const choice of ['', 'false', 'true'])
      assert.equal(runs('schedule', upstream, choice), false, choice);
  });

  it('keeps manual dispatch available with and without opt-in', () => {
    for (const repository of [upstream, instance])
      for (const choice of ['', 'false', 'true'])
        assert.equal(runs('workflow_dispatch', repository, choice), true);
  });

  it('does not allow unrelated events to start the update job', () => {
    assert.equal(runs('pull_request', instance, 'true'), false);
  });
});
