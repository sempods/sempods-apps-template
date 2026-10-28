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
  planUpdate,
  releaseDocs,
  installedStateComplete,
} from '../scripts/sdk-update.mjs';
import {
  compareVersions,
  EXACT_VERSION,
  PENDING_UPDATE,
  SDK,
} from '../scripts/lib/sdk.mjs';

describe('sdk-update (offline registry and pnpm fixtures)', () => {
  let root;
  const files = [
    'package.json',
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
  const LOCK = 'pnpm-lock.yaml';
  const installFixture = (version = '0.3.0') => {
    for (const name of SDK) {
      const path = join(root, 'node_modules', name, 'package.json');
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ version }));
    }
    writeFileSync(join(root, LOCK), `lockfile for ${version}\n`);
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
    writeFileSync(join(root, LOCK), 'original lockfile');
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
  it('points to the installed release notes when the SDK ships them', () => {
    // Before 0.6.0 the SDK shipped none: the published ones.
    assert.match(
      releaseDocs(root, '0.3.0').release,
      /releases\/tag\/v0\.3\.0$/,
    );
    const installed = join('node_modules', '@sempods', 'app-sdk', 'docs');
    const docs = join(root, installed);
    mkdirSync(join(docs, 'releases'), { recursive: true });
    writeFileSync(join(docs, 'releases', '0.6.0.md'), '# SDK 0.6.0\n');
    assert.deepEqual(releaseDocs(root, '0.6.0'), {
      release: join(installed, 'releases', '0.6.0.md'),
      migration: join(installed, 'migration.md'),
    });
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
          writeFileSync(join(root, LOCK), 'pnpm regenerated lock');
      },
      installed: () => true,
    });
    assert.deepEqual(runs, [
      ['install', '--no-frozen-lockfile'],
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
      readFileSync(join(root, LOCK), 'utf8'),
      'pnpm regenerated lock',
    );
  });
  it('waits for an open tooling migration before changing anything', () => {
    const originals = files.map(json);
    const plan = planUpdate(root, '0.3.0', { lookup: registry });
    assert.throws(
      () =>
        applyUpdate(root, plan, {
          run: () => assert.fail('no pnpm while a migration is open'),
          migration: () => 'the migration to @sempods/apps 2.0.0 is open',
        }),
      /finish the tooling migration first[\s\S]*Nothing was changed/,
    );
    assert.deepEqual(files.map(json), originals);
    assert.equal(existsSync(join(root, PENDING_UPDATE)), false);
  });
  it('is a byte-for-byte no-op when already at the release (no install/check)', () => {
    applyUpdate(root, planUpdate(root, 'latest', { lookup: registry }), {
      run: (args) => {
        if (args[0] === 'install') installFixture();
      },
    });
    const before = snapshot();
    const lockBefore = readFileSync(join(root, LOCK), 'utf8');
    const plan = planUpdate(root, 'latest', { lookup: registry });
    assert.equal(plan.changes.length, 0);
    assert.equal(
      applyUpdate(root, plan, {
        run: () => assert.fail('no update on no-op'),
        locked: () => true,
      }),
      false,
    );
    assert.deepEqual(snapshot(), before);
    assert.equal(readFileSync(join(root, LOCK), 'utf8'), lockBefore);
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
      if (failure === 'check')
        assert.equal(installedStateComplete(root, retry.version), true);
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
        ['install', '--no-frozen-lockfile'],
        ['run', 'check'],
      ]);
      assert.equal(existsSync(join(root, PENDING_UPDATE)), false);
      assert.equal(installedStateComplete(root, retry.version), true);
    });
  }
  it('repairs a stale lockfile or installed state even without a pending checkpoint', () => {
    applyUpdate(root, planUpdate(root, 'latest', { lookup: registry }), {
      run: (args) => {
        if (args[0] === 'install') installFixture();
      },
    });
    const plan = planUpdate(root, 'latest', { lookup: registry });
    const damage = [
      // pnpm finds that the lockfile does not match the manifests.
      () => ({ locked: () => false }),
      () => {
        writeFileSync(
          join(root, 'node_modules/@sempods/client-sdk/package.json'),
          '{"version":"0.2.0"}',
        );
        return {};
      },
      () => {
        rmSync(
          join(root, 'node_modules/@sempods/app-sdk/docs/ai-app-builder.md'),
        );
        return {};
      },
    ];
    for (const breakState of damage) {
      const options = breakState();
      const runs = [];
      assert.equal(existsSync(join(root, PENDING_UPDATE)), false);
      assert.equal(
        applyUpdate(root, plan, {
          locked: () => true,
          ...options,
          run: (args) => {
            runs.push(args);
            if (args[0] === 'install') installFixture();
          },
        }),
        true,
      );
      assert.deepEqual(runs, [
        ['install', '--no-frozen-lockfile'],
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
    writeFileSync(join(root, files[2]), '{}');
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
      files.length,
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
  it('fails clearly when the install lacks the release or its reference and never runs check', () => {
    const runs = [];
    assert.throws(
      () =>
        applyUpdate(root, planUpdate(root, 'latest', { lookup: registry }), {
          run: (args) => runs.push(args),
          installed: () => false,
        }),
      /does not have both SDK packages at 0\.3\.0 with node_modules\/@sempods\/app-sdk\/docs\/ai-app-builder\.md/,
    );
    assert.deepEqual(runs, [['install', '--no-frozen-lockfile']]);
  });
});

