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

// The owner section of AGENTS.md and the setup record of INIT.md.
const { sections } = readJson(join(TOOLING, 'update-policy.json'));
const [OWNER] = sections['AGENTS.md'];
const [RECORD] = sections['INIT.md'];
const between = (text, [begin, end]) =>
  text.slice(text.indexOf(begin), text.indexOf(end) + end.length);

describe('migrate', () => {
  let work;
  const read = (root, file) => readFileSync(join(root, file), 'utf8');
  const edit = (root, file, change) =>
    writeFileSync(join(root, file), change(read(root, file)));
  const editJson = (root, file, change) => {
    const value = readJson(join(root, file));
    change(value);
    writeJson(join(root, file), value);
  };
  const pkg = (version) => join(work, `package-${version}`);
  const download = (version) => pkg(version);
  /**
   * A published @sempods/apps whose starter `change` edits from the real
   * one, and whose update policy `changePolicy` edits.
   */
  const publish = (version, change = () => {}, changePolicy = () => {}) => {
    const starter = join(work, `starter-${version}`);
    cpSync(join(TOOLING, 'starter'), starter, { recursive: true });
    change(starter);
    mkdirSync(pkg(version), { recursive: true });
    writeJson(join(pkg(version), 'package.json'), {
      name: '@sempods/apps',
      version,
    });
    const policy = readJson(join(TOOLING, 'update-policy.json'));
    changePolicy(policy);
    writeJson(join(pkg(version), 'update-policy.json'), policy);
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
    editJson(repo, 'package.json', (manifest) => {
      manifest.devDependencies['@sempods/apps'] = version;
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
    editJson(starter, 'package.json', (manifest) => {
      manifest.scripts.later = 'sempods-apps later';
      // A newer starter pin does not move an existing repository's SDK.
      manifest.devDependencies['@sempods/app-sdk'] = '0.5.9';
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
    editJson(repo, 'package.json', (manifest) => {
      manifest.scripts.mine = 'echo mine';
      manifest.devDependencies['left-pad'] = '1.3.0';
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

  // The owner and v2 both change the README title.
  const conflicting = (repo) =>
    edit(repo, 'README.md', (text) =>
      text.replace('# My sempods apps', '# Annas Apps'),
    );
  const manualFiles = (report) => report.manual.map(({ file }) => file);

  it('applies what is unambiguous and leaves the rest as manual cases', () => {
    publish('2.0.0', (starter) => {
      v2(starter);
      edit(starter, 'docs/start.md', (text) =>
        text.replace('## Publish', '## Publish your apps'),
      );
    });
    const repo = createRepo('1.0.0');
    // Owner sections changed: no change to merge on their own.
    edit(repo, 'AGENTS.md', (text) =>
      text.replace(
        'No instance-specific instructions recorded yet.',
        'Answer in German.',
      ),
    );
    edit(repo, 'INIT.md', (text) =>
      text.replace('- Status: not started', '- Status: done'),
    );
    conflicting(repo);
    edit(repo, 'docs/start.md', (text) => text.replace('## Try', '## Try it'));
    const owner = between(read(repo, 'AGENTS.md'), OWNER);
    const record = between(read(repo, 'INIT.md'), RECORD);
    const readme = read(repo, 'README.md');
    const start = read(repo, 'docs/start.md');
    install(repo, '2.0.0');

    const first = migrateTo(repo, '2.0.0');
    assert.equal(first.unfinished, true);
    assert.deepEqual(first.updated, ['AGENTS.md']);
    assert.deepEqual(manualFiles(first), ['README.md', 'docs/start.md']);
    assert.match(read(repo, 'AGENTS.md'), /Scope: all of it\./);
    assert.equal(between(read(repo, 'AGENTS.md'), OWNER), owner);
    assert.equal(between(read(repo, 'INIT.md'), RECORD), record);
    // Manual files stay as they are; their sources wait in the work folder.
    assert.equal(read(repo, 'README.md'), readme);
    assert.equal(read(repo, 'docs/start.md'), start);
    const migration = readJson(join(repo, MIGRATION_FILE));
    const suggestion = read(repo, '.sempods-migration/suggestion/README.md');
    assert.ok(
      suggestion.includes(`<<<<<<< sempods-migration:${migration.id}`),
    );
    assert.match(read(repo, '.sempods-migration/starter/README.md'), /# Your/);
    assert.match(read(repo, '.sempods-migration/base/README.md'), /# My/);
    assert.equal(readBaseline(repo).version, '1.0.0');
    assert.match(
      outstanding(repo, '2.0.0').join('\n'),
      /decide the manual cases .*\(README\.md, docs\/start\.md\), then run pnpm run migrate --done/,
    );
    // A rerun keeps the list and does not touch the manual files.
    assert.deepEqual(manualFiles(migrateTo(repo, '2.0.0')), [
      'README.md',
      'docs/start.md',
    ]);

    // The assistant decides each case; --done keeps the decisions.
    writeFileSync(join(repo, 'README.md'), '# Annas Apps\n');
    edit(repo, 'docs/start.md', (text) =>
      text.replace('## Publish', '## Publish your apps'),
    );
    const decided = [read(repo, 'README.md'), read(repo, 'docs/start.md')];
    const done = migrateTo(repo, '2.0.0', { done: true });
    assert.equal(done.unfinished, undefined);
    assert.deepEqual(
      [read(repo, 'README.md'), read(repo, 'docs/start.md')],
      decided,
    );
    assert.equal(readBaseline(repo).version, '2.0.0');
    assert.equal(existsSync(join(repo, '.sempods-migration')), false);
    assert.deepEqual(outstanding(repo, '2.0.0'), []);
  });

  it('adds a case that becomes ambiguous while the migration is open', () => {
    publish('2.0.0', v2);
    const repo = createRepo('1.0.0');
    conflicting(repo);
    install(repo, '2.0.0');
    const first = migrateTo(repo, '2.0.0');
    assert.deepEqual(first.updated, ['AGENTS.md']);
    assert.deepEqual(manualFiles(first), ['README.md']);
    // The owner edits the starter text the first run applied.
    edit(repo, 'AGENTS.md', (text) =>
      text.replace('Scope: all of it.', 'Scope: everything here.'),
    );
    const second = migrateTo(repo, '2.0.0');
    assert.deepEqual(manualFiles(second), ['README.md', 'AGENTS.md']);
    assert.deepEqual(
      readJson(join(repo, MIGRATION_FILE)).manual.map(({ file }) => file),
      ['README.md', 'AGENTS.md'],
    );
    assert.match(read(repo, 'AGENTS.md'), /Scope: everything here\./);
  });

  it('does not continue a migration planned for another starter', () => {
    publish('2.0.0', v2);
    const repo = createRepo('1.0.0');
    conflicting(repo);
    install(repo, '2.0.0');
    assert.equal(migrateTo(repo, '2.0.0').unfinished, true);
    // The same version repacked with another starter.
    publish('2.0.0', v3);
    assert.throws(
      () => migrateTo(repo, '2.0.0'),
      /planned for another @sempods\/apps 2\.0\.0[\s\S]*Nothing was changed/,
    );
  });

  it('refuses to finish while a suggestion is copied unresolved', () => {
    publish('2.0.0', v2);
    const repo = createRepo('1.0.0');
    conflicting(repo);
    install(repo, '2.0.0');
    migrateTo(repo, '2.0.0');
    cpSync(
      join(repo, '.sempods-migration/suggestion/README.md'),
      join(repo, 'README.md'),
    );
    assert.throws(
      () => migrateTo(repo, '2.0.0', { done: true }),
      /README\.md still contain an unresolved suggestion/,
    );
    assert.equal(readBaseline(repo).version, '1.0.0');
  });

  it('applies remaining automatic changes before --done completes', () => {
    publish('3.0.0', v3);
    const repo = createRepo('1.0.0');
    conflicting(repo);
    install(repo, '3.0.0');
    // An interrupted run: the automatic changes after the first one did not
    // happen. The plan is recomputed, so --done still applies them.
    const baseStart = read(repo, 'docs/start.md');
    assert.equal(migrateTo(repo, '3.0.0').unfinished, true);
    writeFileSync(join(repo, 'docs/start.md'), baseStart);
    rmSync(join(repo, '.agents/skills/later'), { recursive: true });
    writeFileSync(join(repo, 'README.md'), '# Annas Apps\n');
    const done = migrateTo(repo, '3.0.0', { done: true });
    assert.equal(done.unfinished, undefined);
    assert.match(read(repo, 'docs/start.md'), /## Change an app/);
    assert.equal(read(repo, '.agents/skills/later/SKILL.md'), '# Later\n');
    assert.equal(read(repo, 'README.md'), '# Annas Apps\n');
    assert.equal(readBaseline(repo).version, '3.0.0');
  });

  it('keeps a decision when a later completion step fails', () => {
    publish('2.0.0', v2);
    const repo = createRepo('1.0.0');
    conflicting(repo);
    install(repo, '2.0.0');
    migrateTo(repo, '2.0.0');
    writeFileSync(join(repo, 'README.md'), '# Annas Apps\n\nDecided.\n');
    // Regeneration fails on a broken apps.json.
    const apps = read(repo, 'apps.json');
    writeFileSync(join(repo, 'apps.json'), '{');
    assert.throws(() => migrateTo(repo, '2.0.0', { done: true }), /apps\.json/);
    writeFileSync(join(repo, 'apps.json'), apps);
    assert.equal(migrateTo(repo, '2.0.0', { done: true }).unfinished, undefined);
    assert.equal(read(repo, 'README.md'), '# Annas Apps\n\nDecided.\n');
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
    const failed = migrateTo(repo, '2.0.0', { install: () => false });
    assert.equal(failed.unfinished, true);
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

  it('completes when the run stopped after advancing the baseline', () => {
    publish('2.0.0', v2);
    const repo = createRepo('1.0.0');
    install(repo, '2.0.0');
    const from = readBaseline(repo);
    migrateTo(repo, '2.0.0');
    assert.equal(readBaseline(repo).version, '2.0.0');
    // The migration folder outlived the baseline write.
    mkdirSync(join(repo, '.sempods-migration'));
    writeJson(join(repo, MIGRATION_FILE), {
      id: 'done',
      from,
      to: readBaseline(repo),
      manual: [],
    });
    assert.deepEqual(outstanding(repo, '2.0.0'), []);
    assert.equal(migrateTo(repo, '2.0.0').unchanged, true);
    assert.equal(existsSync(join(repo, '.sempods-migration')), false);
  });

  it('makes file and directory collisions manual without touching them', () => {
    // v2 turns docs/ into a file; v1.5 has a file where v2 needs docs/.
    publish('2.0.0', (starter) => {
      rmSync(join(starter, 'docs'), { recursive: true });
      writeFileSync(join(starter, 'docs'), 'Documents moved.\n');
    });
    const repo = createRepo('1.0.0');
    install(repo, '2.0.0');
    const report = migrateTo(repo, '2.0.0');
    assert.deepEqual(manualFiles(report), ['docs']);
    assert.ok(existsSync(join(repo, 'docs', 'start.md')));

    publish('1.5.0', (starter) => {
      rmSync(join(starter, 'docs'), { recursive: true });
      writeFileSync(join(starter, 'docs'), 'Documents.\n');
    });
    publish('3.0.0', v3);
    const other = createRepo('1.5.0', 'other');
    edit(other, 'docs', (text) => `${text}Mine.\n`);
    install(other, '3.0.0');
    const blocked = migrateTo(other, '3.0.0');
    assert.deepEqual(manualFiles(blocked), ['docs', 'docs/start.md']);
    assert.match(read(other, 'docs'), /Mine\./);
  });

  it('removes unchanged shared files the starter drops and asks about changed ones', () => {
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
    assert.deepEqual(manualFiles(report), ['docs/start.md']);
    assert.match(read(repo, 'docs/start.md'), /Mine\./);
  });

  it('makes a file manual when its owner section cannot be kept', () => {
    publish('2.0.0', v2);
    const repo = createRepo('1.0.0');
    edit(repo, 'AGENTS.md', (text) =>
      text.replace('<!-- END OWNER INSTRUCTIONS -->\n', ''),
    );
    const before = read(repo, 'AGENTS.md');
    install(repo, '2.0.0');
    const report = migrateTo(repo, '2.0.0');
    assert.deepEqual(manualFiles(report), ['AGENTS.md']);
    assert.match(report.manual[0].reason, /owner section is incomplete/);
    assert.equal(read(repo, 'AGENTS.md'), before);
  });

  it('waits for an unfinished SDK update', () => {
    publish('2.0.0', v2);
    const repo = createRepo('1.0.0');
    install(repo, '2.0.0');
    writeFileSync(join(repo, '.sdk-update-pending'), '0.6.0\n');
    const before = read(repo, 'AGENTS.md');
    assert.throws(
      () => migrateTo(repo, '2.0.0'),
      /SDK update is unfinished[\s\S]*Nothing was changed/,
    );
    assert.equal(read(repo, 'AGENTS.md'), before);
    assert.equal(existsSync(join(repo, MIGRATION_FILE)), false);
  });

  it('does not continue an open migration toward another starter', () => {
    publish('2.0.0', v2);
    publish('3.0.0', v3);
    const repo = createRepo('1.0.0');
    conflicting(repo);
    install(repo, '2.0.0');
    assert.equal(migrateTo(repo, '2.0.0').unfinished, true);
    install(repo, '3.0.0');
    const before = read(repo, 'docs/start.md');
    assert.throws(
      () => migrateTo(repo, '3.0.0'),
      /open migration to @sempods\/apps 2\.0\.0 is recorded[\s\S]*Nothing was changed/,
    );
    assert.equal(read(repo, 'docs/start.md'), before);
  });

  it('refuses --done without an open migration', () => {
    publish('2.0.0', v2);
    const repo = createRepo('1.0.0');
    install(repo, '2.0.0');
    assert.throws(
      () => migrateTo(repo, '2.0.0', { done: true }),
      /no migration is open/,
    );
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

  it('does not bring back a seed file the owner deleted', () => {
    publish('2.0.0', v2);
    const repo = createRepo('1.0.0');
    rmSync(join(repo, 'apps', '.gitkeep'));
    install(repo, '2.0.0');
    const report = migrateTo(repo, '2.0.0');
    assert.equal(report.added.includes('apps/.gitkeep'), false);
    assert.equal(existsSync(join(repo, 'apps', '.gitkeep')), false);
  });

  it('leaves a seed the new starter drops to the owner', () => {
    publish(
      '2.0.0',
      (starter) => {
        v2(starter);
        rmSync(join(starter, 'apps', '.gitkeep'));
      },
      (policy) => {
        policy.seed = policy.seed.filter((file) => file !== 'apps/.gitkeep');
      },
    );
    const repo = createRepo('1.0.0');
    install(repo, '2.0.0');
    const report = migrateTo(repo, '2.0.0');
    assert.equal(report.removed.includes('apps/.gitkeep'), false);
    assert.ok(existsSync(join(repo, 'apps', '.gitkeep')));
  });

  it('refuses an installed starter older than the baseline', () => {
    publish('2.0.0', v2);
    const repo = createRepo('2.0.0');
    install(repo, '1.0.0');
    const before = read(repo, 'AGENTS.md');
    assert.throws(
      () => migrateTo(repo, '1.0.0'),
      /1\.0\.0 is older than this repository's 2\.0\.0/,
    );
    assert.equal(read(repo, 'AGENTS.md'), before);
    assert.equal(existsSync(join(repo, MIGRATION_FILE)), false);
  });

  it('refuses a repository without a baseline', () => {
    const repo = createRepo('1.0.0');
    rmSync(join(repo, '.sempods-baseline.json'));
    assert.throws(() => migrateTo(repo, '1.0.0'), /baseline\.json is missing/);
  });
});
