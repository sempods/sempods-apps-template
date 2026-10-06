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
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  applyUpdate,
  compareVersions,
  EXACT_VERSION,
  planUpdate,
  PENDING_UPDATE,
  lockStateComplete,
  installedStateComplete,
  SDK,
} from '../sdk-update.mjs';

describe('sdk-update (offline registry and npm fixtures)', () => {
  let root;
  const files = [
    'package.json',
    '.sempods/skeleton/app/package.json',
    'apps/one/package.json',
    'apps/two/package.json',
  ];
  const json = (file) => JSON.parse(readFileSync(join(root, file), 'utf8'));
  const snapshot = () =>
    files.map((file) => readFileSync(join(root, file), 'utf8'));
  const registry = (name, version) => ({
    version: version === 'latest' ? '0.3.0' : version,
    ...(name === SDK[0] ? { dependencies: { [SDK[1]]: '0.3.0' } } : {}),
  });
  const installFixture = (version = '0.3.0') => {
    const dependencies = Object.fromEntries(SDK.map((name) => [name, version]));
    const packages = { '': { devDependencies: dependencies } };
    for (const id of ['one', 'two']) packages[`apps/${id}`] = { dependencies };
    for (const name of SDK) {
      packages[`node_modules/${name}`] = { version };
      const path = join(root, 'node_modules', name, 'package.json');
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ version }));
    }
    writeFileSync(
      join(root, 'package-lock.json'),
      JSON.stringify({ lockfileVersion: 3, packages }),
    );
    const reference = join(
      root,
      'node_modules/@sempods/app-sdk/docs/ai-app-builder.md',
    );
    mkdirSync(dirname(reference), { recursive: true });
    writeFileSync(reference, '# Fixture reference\n');
  };
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sdk-update-'));
    writeFileSync(
      join(root, 'apps.json'),
      JSON.stringify({
        schemaVersion: 1,
        apps: ['one', 'two'].map((id, i) => ({
          id,
          title: id,
          language: 'en',
          path: `/${id}/`,
          devPort: 5174 + i,
          pwa: true,
        })),
      }),
    );
    for (const [index, file] of files.entries()) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      const section = index === 0 ? 'devDependencies' : 'dependencies';
      writeFileSync(
        join(root, file),
        JSON.stringify({
          name: `owner-${index}`,
          scripts: { custom: 'owner command' },
          metadata: { owner: true },
          [section]: { [SDK[0]]: '0.2.0', [SDK[1]]: '0.2.0', other: '1.2.3' },
          [index === 0 ? 'dependencies' : 'devDependencies']: {
            unrelated: '2.0.0',
          },
        }),
      );
    }
    writeFileSync(join(root, 'package-lock.json'), 'original lockfile');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('resolves latest via the app dist-tag and requires that exact client release', () => {
    const calls = [];
    const plan = planUpdate(root, 'latest', {
      lookup: (name, version) => {
        calls.push([name, version]);
        return registry(name, version);
      },
    });
    assert.deepEqual(calls, [
      [SDK[0], 'latest'],
      [SDK[1], '0.3.0'],
    ]);
    assert.match(plan.migration, /blob\/v0\.3\.0\/docs\/migration\.md$/);
    assert.match(plan.release, /releases\/tag\/v0\.3\.0$/);
  });
  it('updates all SDK entries and preserves every non-SDK field and apps.json', () => {
    const originals = files.map(json);
    const apps = readFileSync(join(root, 'apps.json'), 'utf8');
    const plan = planUpdate(root, '0.3.0', { lookup: registry });
    const runs = [];
    applyUpdate(root, plan, {
      run: (args) => {
        runs.push(args);
        if (args[0] === 'install')
          writeFileSync(
            join(root, 'package-lock.json'),
            'npm regenerated lock',
          );
      },
      referenceExists: () => true,
    });
    assert.deepEqual(runs, [
      ['install', '--no-audit', '--no-fund'],
      ['run', 'check'],
    ]);
    for (const [i, file] of files.entries()) {
      const section = i === 0 ? 'devDependencies' : 'dependencies';
      const result = json(file);
      for (const name of SDK) {
        assert.equal(result[section][name], '0.3.0');
        result[section][name] = originals[i][section][name];
      }
      assert.deepEqual(result, originals[i]);
    }
    assert.equal(readFileSync(join(root, 'apps.json'), 'utf8'), apps);
    assert.equal(
      readFileSync(join(root, 'package-lock.json'), 'utf8'),
      'npm regenerated lock',
    );
  });
  it('is a byte-for-byte no-op when already at the release (no install/check)', () => {
    applyUpdate(root, planUpdate(root, 'latest', { lookup: registry }), {
      run: (args) => {
        if (args[0] === 'install') installFixture();
      },
      referenceExists: () => true,
    });
    const before = snapshot();
    const lockBefore = readFileSync(join(root, 'package-lock.json'), 'utf8');
    const plan = planUpdate(root, 'latest', { lookup: registry });
    assert.equal(plan.changes.length, 0);
    assert.equal(
      applyUpdate(root, plan, { run: () => assert.fail('no npm on no-op') }),
      false,
    );
    assert.deepEqual(snapshot(), before);
    assert.equal(
      readFileSync(join(root, 'package-lock.json'), 'utf8'),
      lockBefore,
    );
    assert.equal(existsSync(join(root, PENDING_UPDATE)), false);
  });
  for (const failure of ['install', 'check']) {
    it(`recovers after a failed ${failure}, even when all manifests already name the release`, () => {
      const plan = planUpdate(root, 'latest', { lookup: registry });
      assert.throws(
        () =>
          applyUpdate(root, plan, {
            run: (args) => {
              if (
                args[0] === failure ||
                (failure === 'check' && args[0] === 'run')
              )
                throw new Error('simulated failure');
              if (args[0] === 'install') installFixture();
            },
          }),
        /simulated failure/,
      );
      const retry = planUpdate(root, 'latest', { lookup: registry });
      assert.equal(retry.changes.length, 0);
      assert.equal(existsSync(join(root, PENDING_UPDATE)), true);
      if (failure === 'check') {
        assert.equal(lockStateComplete(root, retry.version), true);
        assert.equal(installedStateComplete(root, retry.version), true);
      }
      const runs = [];
      assert.equal(
        applyUpdate(root, retry, {
          run: (args) => {
            runs.push(args);
            if (args[0] === 'install') installFixture();
          },
        }),
        true,
      );
      assert.deepEqual(runs, [
        ['install', '--no-audit', '--no-fund'],
        ['run', 'check'],
      ]);
      assert.equal(existsSync(join(root, PENDING_UPDATE)), false);
      assert.equal(lockStateComplete(root, retry.version), true);
      assert.equal(installedStateComplete(root, retry.version), true);
    });
  }
  it('repairs stale lockfile and installed state even without a pending checkpoint', () => {
    applyUpdate(root, planUpdate(root, 'latest', { lookup: registry }), {
      run: (args) => {
        if (args[0] === 'install') installFixture();
      },
    });
    const plan = planUpdate(root, 'latest', { lookup: registry });
    const damage = [
      () => rmSync(join(root, 'package-lock.json')),
      () => {
        const lock = json('package-lock.json');
        lock.packages[''].devDependencies[SDK[0]] = '0.2.0';
        writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock));
      },
      () => {
        const lock = json('package-lock.json');
        lock.packages['apps/two'].dependencies[SDK[1]] = '0.2.0';
        writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock));
      },
      () => {
        const lock = json('package-lock.json');
        lock.packages['node_modules/@sempods/app-sdk'].version = '0.2.0';
        writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock));
      },
      () =>
        writeFileSync(
          join(root, 'node_modules/@sempods/client-sdk/package.json'),
          '{"version":"0.2.0"}',
        ),
      () =>
        rmSync(
          join(root, 'node_modules/@sempods/app-sdk/docs/ai-app-builder.md'),
        ),
    ];
    for (const breakState of damage) {
      breakState();
      const runs = [];
      assert.equal(existsSync(join(root, PENDING_UPDATE)), false);
      assert.equal(
        applyUpdate(root, plan, {
          run: (args) => {
            runs.push(args);
            if (args[0] === 'install') installFixture();
          },
        }),
        true,
      );
      assert.deepEqual(runs, [
        ['install', '--no-audit', '--no-fund'],
        ['run', 'check'],
      ]);
    }
  });
  it('rejects mismatched/ranged client dependencies without writing', () => {
    const before = snapshot();
    for (const dependency of ['0.2.0', '^0.3.0', undefined])
      assert.throws(
        () =>
          planUpdate(root, 'latest', {
            lookup: (name, version) => ({
              ...registry(name, version),
              dependencies: { [SDK[1]]: dependency },
            }),
          }),
        /must depend on exactly/,
      );
    assert.deepEqual(snapshot(), before);
  });
  it('reports missing app and client versions without writing', () => {
    const before = snapshot();
    for (const missing of SDK) {
      assert.throws(
        () =>
          planUpdate(root, '0.3.0', {
            lookup: (name, version) =>
              name === missing ? {} : registry(name, version),
          }),
        /missing/,
      );
      assert.throws(
        () =>
          planUpdate(root, '0.3.0', {
            lookup: (name, version) => {
              if (name === missing)
                throw new Error(`${name}@${version} missing version`);
              return registry(name, version);
            },
          }),
        /missing version/,
      );
    }
    assert.deepEqual(snapshot(), before);
  });
  it('preflights every manifest before writing', () => {
    writeFileSync(join(root, files[3]), '{}');
    const before = snapshot();
    assert.throws(
      () => planUpdate(root, 'latest', { lookup: registry }),
      /must already be an exact semver/,
    );
    assert.deepEqual(snapshot(), before);
  });
  it('requires an explicit downgrade flag, including prerelease precedence', () => {
    const lookup = (name) => ({
      version: '0.1.0',
      ...(name === SDK[0] ? { dependencies: { [SDK[1]]: '0.1.0' } } : {}),
    });
    assert.throws(
      () => planUpdate(root, '0.1.0', { lookup }),
      /requires --allow-downgrade/,
    );
    assert.equal(
      planUpdate(root, '0.1.0', { lookup, allowDowngrade: true }).changes
        .length,
      4,
    );
    for (const [a, b] of [
      ['0.2.0', '0.10.0'],
      ['1.0.0-beta.2', '1.0.0-beta.11'],
      ['1.0.0-rc.1', '1.0.0'],
      ['1.0.0-1', '1.0.0-a'],
      ['1.0.0-a', '1.0.0-a.1'],
    ])
      assert.equal(compareVersions(a, b), -1);
    assert.equal(compareVersions('1.0.0+first', '1.0.0+second'), 0);
  });
  it('accepts exact semver only', () => {
    for (const version of ['0.3.0', '1.0.0-beta.1+build.5'])
      assert.ok(EXACT_VERSION.test(version));
    for (const version of [
      '^0.3.0',
      'next',
      'v0.3.0',
      '01.0.0',
      '1.0.0-01',
      '1.0',
    ]) {
      assert.ok(!EXACT_VERSION.test(version));
      assert.throws(
        () =>
          planUpdate(root, version, {
            lookup: () => assert.fail('invalid request reached registry'),
          }),
        /exact semver/,
      );
    }
  });
  it('fails clearly on a missing shipped reference and never runs check', () => {
    const runs = [];
    assert.throws(
      () =>
        applyUpdate(root, planUpdate(root, 'latest', { lookup: registry }), {
          run: (args) => runs.push(args),
          referenceExists: () => false,
        }),
      /ships no app-author reference/,
    );
    assert.deepEqual(runs, [['install', '--no-audit', '--no-fund']]);
  });
});
