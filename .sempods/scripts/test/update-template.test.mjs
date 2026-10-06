import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
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
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staleGenerated } from '../lib/generate.mjs';
import {
  applyRelease,
  decide,
  formatReport,
  upgradeNotes,
} from '../update-template.mjs';

const templateRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);
const OWNER = [
  '<!-- BEGIN OWNER INSTRUCTIONS -->',
  '<!-- END OWNER INSTRUCTIONS -->',
];
const RECORD = [
  '<!-- BEGIN INSTANCE SETUP RECORD -->',
  '<!-- END INSTANCE SETUP RECORD -->',
];
const lines = (...items) => `${items.join('\n')}\n`;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const app = {
  id: 'demo',
  title: 'Demo',
  language: 'en',
  path: '/demo/',
  devPort: 5174,
  pwa: false,
};

let work;
function file(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
const read = (root, path) => readFileSync(join(root, path), 'utf8');
function git(cwd, ...args) {
  // Independent of the developer's signing configuration.
  const settings = ['-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false'];
  return execFileSync('git', [...settings, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
    },
  });
}
function commit(root, message) {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
}

/** The template files of one release; `v` selects what changes between them. */
function templateFiles(root, v) {
  const next = v === '0.2.0';
  cpSync(
    join(templateRoot, '.sempods', 'scripts'),
    join(root, '.sempods', 'scripts'),
    { recursive: true },
  );
  cpSync(
    join(templateRoot, '.sempods', 'update-policy.json'),
    join(root, '.sempods', 'update-policy.json'),
  );
  file(root, '.sempods/VERSION', `${v}\n`);
  file(
    root,
    '.sempods/skeleton/app/package.json',
    json({
      name: '__APP_ID__',
      private: true,
      type: 'module',
      scripts: { build: 'vite build' },
      dependencies: {
        '@sempods/app-sdk': next ? '0.3.0' : '0.2.0',
        '@sempods/client-sdk': next ? '0.3.0' : '0.2.0',
        react: '19.2.0',
      },
      devDependencies: { vite: next ? '8.3.2' : '8.0.0' },
    }),
  );
  file(
    root,
    'AGENTS.md',
    lines(
      '# Working here',
      '',
      next ? 'Read the shipped reference.' : 'Read the snapshot.',
      '',
      OWNER[0],
      '',
      'No instance-specific instructions recorded yet.',
      '',
      OWNER[1],
    ),
  );
  file(
    root,
    'INIT.md',
    lines(
      '# Set up',
      '',
      next ? 'Setup needs npm ci.' : 'Setup needs the snapshot.',
      '',
      RECORD[0],
      '',
      '- Status: not started',
      '',
      RECORD[1],
    ),
  );
  file(
    root,
    'README.md',
    lines('# Apps', '', 'First line.', '', 'Second line.', '', 'Third line.'),
  );
  file(
    root,
    'package.json',
    json({
      name: 'my-sempods-apps',
      private: true,
      type: 'module',
      workspaces: ['apps/*'],
      scripts: {
        check: 'node .sempods/scripts/check.mjs',
        ...(next
          ? { 'update-template': 'node .sempods/scripts/update-template.mjs' }
          : {}),
      },
      devDependencies: {
        ...(next
          ? { '@sempods/app-sdk': '0.3.0', '@sempods/client-sdk': '0.3.0' }
          : {}),
        ...(next ? { remark: '15.0.1' } : {}),
        typescript: next ? '6.0.3' : '6.0.0',
      },
    }),
  );
  file(root, 'LICENSE', next ? 'MIT-0, revised\n' : 'MIT-0\n');
  file(root, '.github/workflows/dco.yml', 'name: DCO\n');
  if (next) {
    file(root, '.node-version', '24.15.0\n');
    file(root, '.claude/skills/update-template/SKILL.md', '# Update\n');
    file(
      root,
      '.sempods/CHANGELOG.md',
      lines('# Changelog', '', '## 0.2.0', '', 'Upgrade note.'),
    );
  } else file(root, 'reference/sempods-sdk/README.md', '# Snapshot\n');
}

/**
 * A template repository with two 0.1.0 commits and a tagged 0.2.0, and an
 * instance created from the first commit, then adapted by its owner.
 */
function setup({ tagOld = false } = {}) {
  const release = join(work, 'template');
  mkdirSync(release);
  git(release, 'init', '-q', '-b', 'main');
  templateFiles(release, '0.1.0');
  commit(release, 'template 0.1.0');
  const first = git(release, 'rev-parse', 'HEAD').trim();
  if (tagOld) git(release, 'tag', 'v0.1.0');
  file(
    release,
    'README.md',
    lines(
      '# Apps',
      '',
      'First line.',
      '',
      'Second line, clarified.',
      '',
      'Third line.',
    ),
  );
  // Still 0.1.0: adds a dependency, a shared file and template tooling that
  // copies from the first commit lack, without having removed them.
  const followUp = JSON.parse(read(release, 'package.json'));
  followUp.devDependencies.remark = '15.0.0';
  file(release, 'package.json', json(followUp));
  file(release, '.node-version', '24.15.0\n');
  file(release, '.sempods/instructions/later.md', '# Later\n');
  commit(release, 'template 0.1.0, follow-up');
  templateFiles(release, '0.2.0');
  file(
    release,
    'README.md',
    lines(
      '# Apps',
      '',
      'First line.',
      '',
      'Second line, clarified.',
      '',
      'Third line, released.',
    ),
  );
  commit(release, 'template 0.2.0');
  git(release, 'tag', 'v0.2.0');

  const instance = join(work, 'instance');
  mkdirSync(instance);
  git(instance, 'init', '-q', '-b', 'main');
  execFileSync('sh', [
    '-c',
    `git -C "${release}" archive ${first} | tar -x -C "${instance}"`,
  ]);
  // The owner's own work.
  const agents = read(instance, 'AGENTS.md').replace(
    'No instance-specific instructions recorded yet.',
    '- Owner: Alex.',
  );
  file(instance, 'AGENTS.md', agents);
  file(
    instance,
    'INIT.md',
    read(instance, 'INIT.md').replace(
      '- Status: not started',
      '- Status: done',
    ),
  );
  file(
    instance,
    'README.md',
    read(instance, 'README.md').replace('First line.', 'First line, mine.'),
  );
  rmSync(join(instance, '.github/workflows/dco.yml'));
  const root = JSON.parse(read(instance, 'package.json'));
  root.scripts.mine = 'echo mine';
  file(instance, 'package.json', json(root));
  file(instance, 'apps.json', json({ schemaVersion: 1, apps: [app] }));
  file(
    instance,
    'apps/demo/package.json',
    json({
      name: 'demo',
      private: true,
      type: 'module',
      scripts: { build: 'vite build', extra: 'echo extra' },
      dependencies: {
        '@sempods/app-sdk': '0.2.0',
        '@sempods/client-sdk': '0.2.0',
        react: '19.2.5',
        'left-pad': '1.3.0',
      },
      devDependencies: { vite: '8.0.0' },
    }),
  );
  file(instance, 'apps/demo/NOTES.md', '# Demo notes\n');
  file(
    instance,
    'apps/demo/src/pwa.ts',
    '// Adapted from reference/sempods-sdk/examples.\n',
  );
  file(instance, 'apps/demo/src/sempods.generated.ts', '// stale\n');
  commit(instance, 'instance');
  return { release, instance, first };
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'sempods-update-'));
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

describe('update-template', () => {
  it('updates template files and template entries, never owner files', async () => {
    const { release, instance, first } = setup();
    const before = (path) => git(instance, 'show', `HEAD:${path}`);
    const report = await applyRelease(release, instance, { install: false });

    assert.equal(report.from, '0.1.0');
    assert.equal(report.to, '0.2.0');
    assert.equal(report.exact, false);
    assert.equal(report.origin, first.slice(0, report.origin.length));
    assert.equal(read(instance, '.sempods/VERSION'), '0.2.0\n');
    assert.deepEqual(report.conflicts, []);

    // Shared files: the template change merged, the owner's edits and sections kept.
    const readme = read(instance, 'README.md');
    assert.match(readme, /First line, mine\./);
    assert.match(readme, /Second line, clarified\./);
    assert.match(readme, /Third line, released\./);
    const agents = read(instance, 'AGENTS.md');
    assert.match(agents, /Read the shipped reference\./);
    assert.match(agents, /- Owner: Alex\./);
    const init = read(instance, 'INIT.md');
    assert.match(init, /Setup needs npm ci\./);
    assert.match(init, /- Status: done/);
    assert.ok(
      existsSync(join(instance, '.claude/skills/update-template/SKILL.md')),
    );
    assert.ok(report.added.includes('.claude/skills/update-template/SKILL.md'));

    // Owner files: untouched; retired and owner-adapted files reported.
    for (const path of [
      'apps.json',
      'apps/demo/NOTES.md',
      'apps/demo/src/pwa.ts',
    ])
      assert.equal(read(instance, path), before(path), path);
    assert.equal(read(instance, 'LICENSE'), 'MIT-0\n');
    assert.ok(!existsSync(join(instance, '.github/workflows/dco.yml')));
    assert.ok(!existsSync(join(instance, 'reference/sempods-sdk')));
    const review = report.review.join('\n');
    assert.match(review, /LICENSE: changed in template 0\.2\.0/);
    assert.match(
      review,
      /apps\/demo\/src\/pwa\.ts: mentions reference\/sempods-sdk/,
    );

    // Manifests: template entries follow, owner entries and choices stay.
    const root = JSON.parse(read(instance, 'package.json'));
    assert.equal(root.scripts.mine, 'echo mine');
    assert.equal(
      root.scripts['update-template'],
      'node .sempods/scripts/update-template.mjs',
    );
    assert.equal(root.devDependencies.typescript, '6.0.3');
    // Introduced after this copy's origin, not removed by its owner.
    assert.equal(root.devDependencies.remark, '15.0.1');
    assert.ok(report.added.includes('.node-version'));
    assert.doesNotMatch(report.notes.join('\n'), /remark/);
    assert.equal(root.devDependencies['@sempods/app-sdk'], '0.3.0');
    const demo = JSON.parse(read(instance, 'apps/demo/package.json'));
    assert.equal(demo.name, 'demo');
    assert.equal(demo.scripts.extra, 'echo extra');
    assert.equal(demo.dependencies['left-pad'], '1.3.0');
    assert.equal(demo.dependencies['@sempods/client-sdk'], '0.3.0');
    assert.equal(demo.devDependencies.vite, '8.3.2');
    assert.equal(demo.dependencies.react, '19.2.5');
    assert.match(
      report.notes.join('\n'),
      /dependencies\.react: changed in this repository/,
    );

    // Generated configuration follows apps.json.
    assert.deepEqual(staleGenerated(join(instance, 'apps/demo'), app), []);
    assert.match(formatReport(report), /Upgrade note\./);

    // Repeating the update changes nothing.
    git(instance, 'add', '-A');
    const again = await applyRelease(release, instance, { install: false });
    assert.equal(again.unchanged, true);
    assert.equal(git(instance, 'diff').trim(), '');
  });

  it('fetches a tagged release and lets its script run, then has nothing to do', async () => {
    const { release, instance } = setup();
    await applyRelease(release, instance, { install: false });
    commit(instance, 'template 0.2.0');
    const run = (...args) =>
      spawnSync(
        process.execPath,
        [
          join(instance, '.sempods/scripts/update-template.mjs'),
          '--source',
          release,
          '--no-install',
          ...args,
        ],
        { cwd: instance, encoding: 'utf8' },
      );
    const latest = run();
    assert.equal(latest.status, 0, latest.stderr);
    assert.match(latest.stdout, /Already at template 0\.2\.0/);
    const missing = run('9.9.9');
    assert.equal(missing.status, 1);
    assert.match(
      missing.stderr,
      /No template release 9\.9\.9; available: 0\.2\.0/,
    );
  });

  it('uses the release tag as exact base when there is one', async () => {
    const { release, instance } = setup({ tagOld: true });
    const report = await applyRelease(release, instance, { install: false });
    assert.equal(report.exact, true);
    assert.match(formatReport(report), /Base: release v0\.1\.0/);
  });

  it('marks a conflict when the owner and the template changed the same line', async () => {
    const { release, instance } = setup();
    file(
      instance,
      'README.md',
      read(instance, 'README.md').replace('Third line.', 'Third line, my way.'),
    );
    commit(instance, 'owner edit');
    const report = await applyRelease(release, instance, { install: false });
    assert.equal(report.conflicts.length, 1);
    assert.match(
      report.conflicts[0],
      /README\.md: 1 conflict\(s\) \(base inferred/,
    );
    const readme = read(instance, 'README.md');
    assert.match(readme, /<<<<<<< this repository/);
    assert.match(readme, /Third line, my way\./);
    assert.match(readme, /Third line, released\./);
  });

  it('refuses a release older than the repository', async () => {
    const { release, instance } = setup();
    file(instance, '.sempods/VERSION', '0.3.0\n');
    await assert.rejects(
      applyRelease(release, instance, { install: false }),
      /newer than 0\.2\.0/,
    );
  });
});

describe('update decisions', () => {
  it('follows the template for template values and keeps owner values', () => {
    assert.deepEqual(decide('1.0.0', ['1.0.0'], '2.0.0'), { value: '2.0.0' });
    assert.equal(decide('1.5.0', ['1.0.0'], '2.0.0').value, '1.5.0');
    assert.equal(decide(undefined, [undefined], '2.0.0').value, '2.0.0');
    assert.equal(decide(undefined, ['1.0.0'], '2.0.0').value, undefined);
    assert.equal(decide('1.0.0', ['1.0.0'], undefined).value, undefined);
  });
  it('lists the upgrade notes after the current version', () => {
    const changelog = lines(
      '# Changelog',
      '',
      '## 0.3.0',
      '',
      'Three.',
      '',
      '## 0.2.0',
      '',
      'Two.',
    );
    assert.match(upgradeNotes(changelog, '0.1.0'), /Three\.[\s\S]*Two\./);
    assert.doesNotMatch(upgradeNotes(changelog, '0.2.0'), /Two\./);
  });
});
