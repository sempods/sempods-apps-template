import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { readJson } from '../scripts/lib/json.mjs';

// The starter's Dependabot configuration, as generated repositories use it.
const config = readFileSync(
  new URL('../starter/.github/dependabot.yml', import.meta.url),
  'utf8',
);
const policy = readJson(new URL('../update-policy.json', import.meta.url));
const [[begin, end]] = policy.sections['.github/dependabot.yml'];
const npm = config.slice(config.indexOf("package-ecosystem: 'npm'"));
const groups = npm.slice(npm.indexOf('    groups:'));

describe('Dependabot configuration', () => {
  it('keeps sempods version PRs off in an owner section, security updates on', () => {
    const section = npm.slice(npm.indexOf(begin), npm.indexOf(end));
    assert.match(section, /- dependency-name: '@sempods\/\*'/);
    // Ignore rules with update-types leave security updates alone.
    for (const type of ['major', 'minor', 'patch'])
      assert.match(section, new RegExp(`'version-update:semver-${type}'`));
    const outside = npm.replace(section, '');
    assert.doesNotMatch(outside, /dependency-name: '@sempods/);
  });

  it('groups the SDK and the tooling apart, ahead of the general group', () => {
    const order = ['sempods-sdk:', 'sempods-apps:', 'npm:'].map((name) =>
      groups.indexOf(`      ${name}`),
    );
    assert.ok(order.every((at) => at > 0), 'all three groups exist');
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    const sdk = groups.slice(order[0], order[1]);
    assert.match(sdk, /'@sempods\/app-sdk'/);
    assert.match(sdk, /'@sempods\/client-sdk'/);
    assert.match(groups.slice(order[1], order[2]), /'@sempods\/apps'/);
    assert.match(
      groups.slice(order[2]),
      /exclude-patterns:\n\s+- '@sempods\/\*'/,
    );
  });

  it('groups security updates of both SDK packages', () => {
    const security = groups.slice(groups.indexOf('      sempods-sdk-security:'));
    assert.match(
      security,
      /^ {6}sempods-sdk-security:\n {8}applies-to: 'security-updates'\n {8}patterns:\n {10}- '@sempods\/app-sdk'\n {10}- '@sempods\/client-sdk'\n/,
    );
  });
});
