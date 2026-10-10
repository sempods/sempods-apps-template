import assert from 'node:assert/strict';
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
import { staticProblems } from '../scripts/check.mjs';
import { create } from '../scripts/create.mjs';
import { readJson, writeJson } from '../scripts/lib/json.mjs';
import { TOOLING } from '../scripts/lib/paths.mjs';
import {
  readBaseline,
  readSnapshot,
  writeSnapshot,
} from '../scripts/lib/shared.mjs';
import { MIGRATION_FILE, migrate } from '../scripts/migrate.mjs';
import { createApp } from '../scripts/new-app.mjs';
import {
  installTarget,
  preflight,
  prerequisiteOrder,
  refuseOlder,
} from '../scripts/update.mjs';

const OWNER = [
  '<!-- BEGIN OWNER INSTRUCTIONS -->',
  '<!-- END OWNER INSTRUCTIONS -->',
];
const RECORD = [
  '<!-- BEGIN INSTANCE SETUP RECORD -->',
  '<!-- END INSTANCE SETUP RECORD -->',
];
const between = (text, [begin, end]) =>
  text.slice(text.indexOf(begin), text.indexOf(end) + end.length);

describe('migrate', () => {
  let work;
  const read = (root, file) => readFileSync(join(root, file), 'utf8');
  const edit = (root, file, change) =>
    writeFileSync(join(root, file), change(read(root, file)));
  const pkg = (version) => join(work, `package-${version}`);
  const download = (version) => pkg(version);
  /** A published @sempods/apps whose starter `change` edits from the real one. */
  const publish = (version, change = () => {}) => {
    const starter = join(work, `starter-${version}`);
    cpSync(join(TOOLING, 'starter'), starter, { recursive: true });
    change(starter);
    mkdirSync(pkg(version), { recursive: true });
    writeJson(join(pkg(version), 'package.json'), {
      name: '@sempods/apps',
      version,
    });
    cpSync(
      join(TOOLING, 'update-policy.json'),
      join(pkg(version), 'update-policy.json'),
    );
    writeSnapshot(starter, join(pkg(version), 'shared'));
    return pkg(version);
  };
  const createRepo = (version, name = 'repo') =>
    create(join(work, name), {
      snapshot: readSnapshot(join(pkg(version), 'shared')),
      version,
    });
  // What Dependabot or `pnpm add` leaves: the newer package installed, the
  // shared files untouched.
  const install = (repo, version) =>
    edit(repo, 'package.json', (text) => {
      const manifest = JSON.parse(text);
      manifest.devDependencies['@sempods/apps'] = version;
      return `${JSON.stringify(manifest, null, 2)}\n`;
    });
  const migrateTo = (repo, version, options = {}) =>
    migrate(repo, {
      installed: pkg(version),
      download,
      install: () => true,
      ...options,
    });
  const outstanding = (repo, version) =>
    staticProblems(repo, { tooling: pkg(version) }).filter((problem) =>
      /migrat/.test(problem),
    );

  // Starter changes of the releases below; each release keeps the earlier ones.
  const v2 = (starter) => {
    edit(starter, 'AGENTS.md', (text) =>
      text.replace('Scope: the whole repository.', 'Scope: all of it.'),
    );
    edit(starter, 'README.md', (text) =>
      text.replace('# My sempods apps', '# Your sempods apps'),
    );
  };
  const v3 = (starter) => {
    v2(starter);
    edit(starter, 'docs/start.md', (text) =>
      text.replace('## Change', '## Change an app'),
    );
    mkdirSync(join(starter, '.agents/skills/later'), { recursive: true });
    writeFileSync(join(starter, '.agents/skills/later/SKILL.md'), '# Later\n');
    edit(starter, 'package.json', (text) => {
      const manifest = JSON.parse(text);
      manifest.scripts.later = 'sempods-apps later';
      // A newer starter pin does not move an existing repository's SDK.
      manifest.devDependencies['@sempods/app-sdk'] = '0.5.9';
      return `${JSON.stringify(manifest, null, 2)}\n`;
    });
  };

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'sempods-migrate-'));
    publish('1.0.0');
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  it('migrates later from the older baseline across skipped releases', () => {
    publish('2.0.0', v2);
    publish('3.0.0', v3);
    const repo = createRepo('1.0.0');
    createApp(repo, { id: 'demo' });
    edit(repo, 'apps/demo/NOTES.md', (text) => `${text}\nOwner note.\n`);
    edit(repo, 'package.json', (text) => {
      const manifest = JSON.parse(text);
      manifest.scripts.mine = 'echo mine';
      manifest.devDependencies['left-pad'] = '1.3.0';
      return `${JSON.stringify(manifest, null, 2)}\n`;
    });
    const appBefore = read(repo, 'apps/demo/src/App.tsx');
    const notesBefore = read(repo, 'apps/demo/NOTES.md');
    // Installed without migrating: check names the step, the baseline stays.
    install(repo, '3.0.0');
    assert.match(outstanding(repo, '3.0.0').join('\n'), /run pnpm run migrate/);
    assert.equal(readBaseline(repo).version, '1.0.0');

    const report = migrateTo(repo, '3.0.0');
    assert.equal(report.unfinished, undefined);
    assert.match(read(repo, 'AGENTS.md'), /Scope: all of it\./);
    assert.match(read(repo, 'README.md'), /^# Your sempods apps/);
    assert.match(read(repo, 'docs/start.md'), /## Change an app/);
    assert.equal(read(repo, '.agents/skills/later/SKILL.md'), '# Later\n');
    const manifest = readJson(join(repo, 'package.json'));
    assert.equal(manifest.scripts.later, 'sempods-apps later');
    assert.equal(manifest.scripts.mine, 'echo mine');
    assert.equal(manifest.devDependencies['left-pad'], '1.3.0');
    assert.equal(manifest.devDependencies['@sempods/apps'], '3.0.0');
    assert.equal(manifest.devDependencies['@sempods/app-sdk'], '0.5.0');
    assert.equal(read(repo, 'apps/demo/src/App.tsx'), appBefore);
    assert.equal(read(repo, 'apps/demo/NOTES.md'), notesBefore);
    assert.deepEqual(readBaseline(repo), {
      format: 1,
      package: '@sempods/apps',
      version: '3.0.0',
      revision: readSnapshot(join(pkg('3.0.0'), 'shared')).revision,
    });
    assert.equal(existsSync(join(repo, MIGRATION_FILE)), false);
    assert.deepEqual(outstanding(repo, '3.0.0'), []);
    // A rerun has nothing left to do.
    assert.equal(migrateTo(repo, '3.0.0').unchanged, true);
  });

  it('keeps owner sections verbatim and reports conflicts until resolved', () => {
    publish('2.0.0', (starter) => {
      v2(starter);
      edit(starter, 'docs/start.md', (text) =>
        text.replace('## Publish', '## Publish your apps'),
      );
    });
    const repo = createRepo('1.0.0');
    edit(repo, 'AGENTS.md', (text) =>
      text.replace(
        'No instance-specific instructions recorded yet.',
        'Answer in German.',
      ),
    );
    edit(repo, 'INIT.md', (text) =>
      text.replace('- Status: not started', '- Status: done'),
    );
    edit(repo, 'README.md', (text) =>
      text.replace('# My sempods apps', '# Annas Apps'),
    );
    edit(repo, 'docs/start.md', (text) =>
      text.replace('## Try', '## Try it'),
    );
    const owner = between(read(repo, 'AGENTS.md'), OWNER);
    const record = between(read(repo, 'INIT.md'), RECORD);
    install(repo, '2.0.0');

    const first = migrateTo(repo, '2.0.0');
    assert.equal(first.unfinished, true);
    // INIT.md changed only here: kept, not reported as merged.
    assert.equal(first.merged.includes('INIT.md'), false);
    assert.deepEqual(first.conflicts, ['README.md']);
    assert.ok(first.merged.includes('docs/start.md'));
    assert.match(read(repo, 'docs/start.md'), /## Try it/);
    assert.match(read(repo, 'docs/start.md'), /## Publish your apps/);
    assert.match(read(repo, 'README.md'), /^<{7} this repository/m);
    assert.equal(between(read(repo, 'AGENTS.md'), OWNER), owner);
    assert.match(read(repo, 'AGENTS.md'), /Scope: all of it\./);
    assert.equal(between(read(repo, 'INIT.md'), RECORD), record);
    assert.equal(readBaseline(repo).version, '1.0.0');
    assert.match(
      outstanding(repo, '2.0.0').join('\n'),
      /unfinished: resolve the conflicts in README\.md/,
    );
    // Still conflicted: a rerun keeps the file and the baseline.
    assert.equal(migrateTo(repo, '2.0.0').unfinished, true);
    assert.equal(readBaseline(repo).version, '1.0.0');

    writeFileSync(join(repo, 'README.md'), '# Annas Apps\n\nResolved.\n');
    const second = migrateTo(repo, '2.0.0');
    assert.equal(second.unfinished, undefined);
    assert.equal(read(repo, 'README.md'), '# Annas Apps\n\nResolved.\n');
    assert.equal(readBaseline(repo).version, '2.0.0');
    assert.equal(between(read(repo, 'AGENTS.md'), OWNER), owner);
    assert.equal(between(read(repo, 'INIT.md'), RECORD), record);
  });

  it('merges a conflicted file again when the run stopped before writing it', () => {
    publish('2.0.0', v2);
    const repo = createRepo('1.0.0');
    edit(repo, 'README.md', (text) =>
      text.replace('# My sempods apps', '# Annas Apps'),
    );
    install(repo, '2.0.0');
    const owner = read(repo, 'README.md');
    assert.throws(
      () =>
        migrateTo(repo, '2.0.0', {
          beforeWrite: (file) => {
            if (file === 'README.md') throw new Error('interrupted');
          },
        }),
      /interrupted/,
    );
    // Recorded as a conflict, but the markers never reached the file.
    assert.equal(read(repo, 'README.md'), owner);
    const rerun = migrateTo(repo, '2.0.0');
    assert.deepEqual(rerun.conflicts, ['README.md']);
    assert.match(read(repo, 'README.md'), /^<{7} this repository/m);
    assert.equal(readBaseline(repo).version, '1.0.0');
    // Resolved by keeping exactly the owner's earlier text: no new merge.
    writeFileSync(join(repo, 'README.md'), owner);
    assert.equal(migrateTo(repo, '2.0.0').unfinished, undefined);
    assert.equal(read(repo, 'README.md'), owner);
    assert.equal(readBaseline(repo).version, '2.0.0');
  });

  it('keeps a conflict written just before the run stopped', () => {
    publish('2.0.0', v2);
    const repo = createRepo('1.0.0');
    edit(repo, 'README.md', (text) =>
      text.replace('# My sempods apps', '# Annas Apps'),
    );
    install(repo, '2.0.0');
    assert.throws(
      () =>
        migrateTo(repo, '2.0.0', {
          afterWrite: (file) => {
            if (file === 'README.md') throw new Error('interrupted');
          },
        }),
      /interrupted/,
    );
    const marked = read(repo, 'README.md');
    const rerun = migrateTo(repo, '2.0.0');
    assert.deepEqual(rerun.conflicts, ['README.md']);
    // Not merged again: one conflict block, unchanged.
    assert.equal(read(repo, 'README.md'), marked);
    assert.equal(marked.match(/^<{7} /gm).length, 1);
  });

  it('merges a file the owner edited after an interrupted write', () => {
    publish('2.0.0', v2);
    const repo = createRepo('1.0.0');
    install(repo, '2.0.0');
    assert.throws(
      () =>
        migrateTo(repo, '2.0.0', {
          beforeWrite: (file) => {
            if (file === 'AGENTS.md') throw new Error('interrupted');
          },
        }),
      /interrupted/,
    );
    // Neither the old nor the intended content: an owner edit in between.
    edit(repo, 'AGENTS.md', (text) => `${text}\nOwner line.\n`);
    assert.equal(migrateTo(repo, '2.0.0').unfinished, undefined);
    assert.match(read(repo, 'AGENTS.md'), /Scope: all of it\./);
    assert.match(read(repo, 'AGENTS.md'), /Owner line\./);
    assert.equal(readBaseline(repo).version, '2.0.0');
  });

  it('keeps a conflict while any of its markers remains', () => {
    publish('2.0.0', v2);
    const repo = createRepo('1.0.0');
    edit(repo, 'README.md', (text) =>
      text.replace('# My sempods apps', '# Annas Apps'),
    );
    install(repo, '2.0.0');
    assert.equal(migrateTo(repo, '2.0.0').unfinished, true);
    // The opening marker is gone, the others are left over.
    edit(repo, 'README.md', (text) => text.replace(/^<{7} .*\n/m, ''));
    const rerun = migrateTo(repo, '2.0.0');
    assert.deepEqual(rerun.conflicts, ['README.md']);
    assert.equal(readBaseline(repo).version, '1.0.0');
  });

  it('keeps a resolution when a later step of the rerun fails', () => {
    publish('2.0.0', v2);
    const repo = createRepo('1.0.0');
    edit(repo, 'README.md', (text) =>
      text.replace('# My sempods apps', '# Annas Apps'),
    );
    install(repo, '2.0.0');
    assert.equal(migrateTo(repo, '2.0.0').unfinished, true);
    writeFileSync(join(repo, 'README.md'), '# Annas Apps\n\nResolved.\n');
    // Regeneration fails on a broken apps.json.
    const apps = read(repo, 'apps.json');
    writeFileSync(join(repo, 'apps.json'), '{');
    assert.throws(() => migrateTo(repo, '2.0.0'), /apps\.json/);
    writeFileSync(join(repo, 'apps.json'), apps);
    assert.equal(migrateTo(repo, '2.0.0').unfinished, undefined);
    assert.equal(read(repo, 'README.md'), '# Annas Apps\n\nResolved.\n');
    assert.equal(readBaseline(repo).version, '2.0.0');
  });

  it('installs after a workspace-only change, also after a failure', () => {
    publish('2.0.0', (starter) =>
      edit(
        starter,
        'pnpm-workspace.yaml',
        (text) => `${text}\noverrides:\n  left-pad: 1.3.0\n`,
      ),
    );
    const repo = createRepo('1.0.0');
    install(repo, '2.0.0');
    assert.throws(
      () =>
        migrateTo(repo, '2.0.0', {
          afterWrite: () => {
            throw new Error('interrupted');
          },
        }),
      /interrupted/,
    );
    assert.equal(
      migrateTo(repo, '2.0.0', { install: () => false }).unfinished,
      true,
    );
    assert.equal(readBaseline(repo).version, '1.0.0');
    let installs = 0;
    const done = migrateTo(repo, '2.0.0', {
      install: () => {
        installs += 1;
        return true;
      },
    });
    assert.equal(done.unfinished, undefined);
    assert.equal(installs, 1);
    assert.match(read(repo, 'pnpm-workspace.yaml'), /left-pad: 1\.3\.0/);
    assert.equal(readBaseline(repo).version, '2.0.0');
  });

  it('does not resume an unfinished migration toward another starter', () => {
    publish('2.0.0', v2);
    publish('3.0.0', v3);
    const repo = createRepo('1.0.0');
    edit(repo, 'README.md', (text) =>
      text.replace('# My sempods apps', '# Annas Apps'),
    );
    install(repo, '2.0.0');
    assert.equal(migrateTo(repo, '2.0.0').unfinished, true);
    writeFileSync(join(repo, 'README.md'), '# Annas Apps\n');
    const before = read(repo, 'docs/start.md');
    install(repo, '3.0.0');
    assert.throws(
      () => migrateTo(repo, '3.0.0'),
      /unfinished migration from @sempods\/apps 1\.0\.0 to 2\.0\.0[\s\S]*Nothing was changed/,
    );
    assert.equal(read(repo, 'docs/start.md'), before);
    assert.equal(readBaseline(repo).version, '1.0.0');
  });

  it('removes unchanged shared files the starter drops and keeps changed ones', () => {
    publish('2.0.0', (starter) => {
      rmSync(join(starter, '.agents'), { recursive: true });
      rmSync(join(starter, 'docs/start.md'));
    });
    const repo = createRepo('1.0.0');
    edit(repo, 'docs/start.md', (text) => `${text}\nMine.\n`);
    install(repo, '2.0.0');
    const report = migrateTo(repo, '2.0.0');
    assert.deepEqual(report.removed, [
      '.agents/skills/app-workflow/SKILL.md',
      '.agents/skills/update/SKILL.md',
    ]);
    assert.equal(existsSync(join(repo, '.agents')), false);
    assert.match(read(repo, 'docs/start.md'), /Mine\./);
    assert.match(report.review.join('\n'), /docs\/start\.md: the starter removed it/);
    assert.equal(readBaseline(repo).version, '2.0.0');
  });

  it('resumes an interrupted migration without advancing the baseline early', () => {
    publish('3.0.0', v3);
    const clean = createRepo('1.0.0', 'clean');
    install(clean, '3.0.0');
    migrateTo(clean, '3.0.0');

    const repo = createRepo('1.0.0');
    install(repo, '3.0.0');
    let writes = 0;
    assert.throws(
      () =>
        migrateTo(repo, '3.0.0', {
          afterWrite: () => {
            writes += 1;
            if (writes === 2) throw new Error('interrupted');
          },
        }),
      /interrupted/,
    );
    assert.equal(readBaseline(repo).version, '1.0.0');
    assert.ok(existsSync(join(repo, MIGRATION_FILE)));
    // A failed install leaves the migration unfinished, too.
    const failed = migrateTo(repo, '3.0.0', { install: () => false });
    assert.equal(failed.unfinished, true);
    assert.equal(readBaseline(repo).version, '1.0.0');

    // The manifest is already written; the rerun still owes the install.
    let installs = 0;
    migrateTo(repo, '3.0.0', {
      install: () => {
        installs += 1;
        return true;
      },
    });
    assert.equal(installs, 1);
    for (const file of Object.keys(
      readSnapshot(join(pkg('3.0.0'), 'shared')).files,
    ))
      if (file !== 'package.json')
        assert.equal(read(repo, file), read(clean, file), file);
    const unnamed = (root) => ({
      ...readJson(join(root, 'package.json')),
      name: undefined,
    });
    assert.deepEqual(unnamed(repo), unnamed(clean));
    assert.deepEqual(readBaseline(repo), readBaseline(clean));
    assert.equal(existsSync(join(repo, MIGRATION_FILE)), false);
  });

  it('completes when the run stopped after advancing the baseline', () => {
    publish('2.0.0', v2);
    const repo = createRepo('1.0.0');
    install(repo, '2.0.0');
    let leftover;
    migrateTo(repo, '2.0.0', {
      afterWrite: () => {
        leftover = read(repo, MIGRATION_FILE);
      },
    });
    assert.equal(readBaseline(repo).version, '2.0.0');
    // The migration file outlived the baseline write.
    writeFileSync(join(repo, MIGRATION_FILE), leftover);
    assert.deepEqual(outstanding(repo, '2.0.0'), []);
    assert.equal(migrateTo(repo, '2.0.0').unchanged, true);
    assert.equal(existsSync(join(repo, MIGRATION_FILE)), false);
  });

  it('needs no migration for a release with the same starter', () => {
    publish('1.0.1');
    const repo = createRepo('1.0.0');
    install(repo, '1.0.1');
    const before = read(repo, '.sempods-baseline.json');
    assert.deepEqual(outstanding(repo, '1.0.1'), []);
    assert.equal(migrateTo(repo, '1.0.1').unchanged, true);
    assert.equal(read(repo, '.sempods-baseline.json'), before);
  });

  it('refuses a repository without a baseline', () => {
    const repo = createRepo('1.0.0');
    rmSync(join(repo, '.sempods-baseline.json'));
    assert.throws(() => migrateTo(repo, '1.0.0'), /baseline\.json is missing/);
  });
});

describe('update install', () => {
  let root;
  let installed;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sempods-update-'));
    writeJson(join(root, 'package.json'), {
      devDependencies: { '@sempods/apps': '2.0.0' },
    });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const runs = [];
  const run = (args) => {
    runs.push(args.join(' '));
    installed = '2.0.0';
    return true;
  };
  const options = () => ({ run, installed: () => installed });

  it('installs a version the manifest names but node_modules lacks', () => {
    runs.length = 0;
    installed = '1.0.0';
    installTarget(root, '2.0.0', options());
    assert.deepEqual(runs, ['install --no-frozen-lockfile']);
  });
  it('adds a version the manifest does not name yet', () => {
    runs.length = 0;
    installed = '1.0.0';
    installTarget(root, '3.0.0', {
      run: (args) => {
        runs.push(args.join(' '));
        installed = '3.0.0';
        return true;
      },
      installed: () => installed,
    });
    assert.deepEqual(runs, [
      'add --save-dev --save-exact @sempods/apps@3.0.0',
    ]);
  });
  it('skips installing what is installed and refuses a wrong result', () => {
    runs.length = 0;
    installed = '2.0.0';
    installTarget(root, '2.0.0', options());
    assert.deepEqual(runs, []);
    installed = '1.0.0';
    assert.throws(
      () =>
        installTarget(root, '2.0.0', {
          run: () => true,
          installed: () => installed,
        }),
      /1\.0\.0 is installed instead of 2\.0\.0/,
    );
  });
});

describe('update preflight', () => {
  const target = {
    version: '2.0.0',
    engines: { node: '>=26.1.0', pnpm: '>=12.0.0' },
  };
  it('names the tools to upgrade first, in order', () => {
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
    assert.match(order, /1\. Install a Node version in >=26\.1\.0 and write it to \.node-version/);
    assert.match(order, /2\. Set packageManager in package\.json to a pnpm version in >=12\.0\.0/);
    assert.match(order, /3\. Run pnpm run update 2\.0\.0 again/);
  });
  it('refuses a target older than the baseline', () => {
    const baseline = { version: '2.0.0' };
    assert.throws(
      () => refuseOlder(baseline, { version: '1.9.0' }),
      /older than this repository's 2\.0\.0[\s\S]*Nothing was changed/,
    );
    refuseOlder(baseline, { version: '2.0.0' });
    refuseOlder(baseline, { version: '2.1.0' });
    refuseOlder(undefined, { version: '1.0.0' });
  });
  it('lets a suitable machine continue', () => {
    assert.deepEqual(
      preflight(target, { node: '26.1.0', pnpmVersion: '12.0.1' }),
      [],
    );
  });
});
