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
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { invalidId, nextDevPort, validateApps } from '../lib/apps.mjs';
import { generatedFiles, staleGenerated } from '../lib/generate.mjs';
import { createApp } from '../new-app.mjs';
import { importedPackages, staticProblems } from '../check.mjs';
import { pinOutsideLinks } from '../sdk-snapshot.mjs';

const templateRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

describe('app IDs', () => {
  it('accepts one lowercase segment', () => {
    for (const id of ['konsum', 'a', 'shopping-list', 'app2'])
      assert.equal(invalidId(id), undefined, id);
  });
  it('rejects paths, case, reserved and device names', () => {
    for (const id of [
      '../x',
      'foo/bar',
      'Konsum',
      '2go',
      'a_b',
      '',
      'x-',
      'assets',
      'callback',
      'con',
      'com1',
      'lpt9',
      'a'.repeat(41),
    ])
      assert.notEqual(invalidId(id), undefined, id);
  });
});

describe('apps.json', () => {
  const app = {
    id: 'konsum',
    title: 'Einkaufsliste',
    language: 'de',
    path: '/konsum/',
    devPort: 5174,
    pwa: true,
  };
  it('accepts a valid manifest', () => {
    assert.deepEqual(validateApps({ schemaVersion: 1, apps: [app] }), []);
  });
  it('reports duplicate IDs and ports, wrong paths and languages', () => {
    const problems = validateApps({
      schemaVersion: 1,
      apps: [
        app,
        { ...app },
        { ...app, id: 'other', path: '/x/', language: 'fr' },
      ],
    });
    assert.ok(problems.some((p) => p.includes('listed twice')));
    assert.ok(problems.some((p) => p.includes('devPort 5174 is used twice')));
    assert.ok(problems.some((p) => p.includes('path must be "/other/"')));
    assert.ok(problems.some((p) => p.includes('language must be')));
  });
  it('allocates the first free development port', () => {
    assert.equal(nextDevPort({ apps: [] }), 5174);
    assert.equal(
      nextDevPort({ apps: [{ devPort: 5174 }, { devPort: 5176 }] }),
      5175,
    );
  });
});

describe('generated configuration', () => {
  const app = {
    id: 'demo',
    title: 'Demo "App"',
    language: 'en',
    path: '/demo/',
    devPort: 5180,
    pwa: true,
  };
  it('derives callback, return path, base and PWA scope from the app path', () => {
    const files = generatedFiles(app);
    const runtime = files['src/sempods.generated.ts'];
    assert.match(
      runtime,
      /redirectUri: `\$\{location\.origin\}\/demo\/callback`/,
    );
    assert.match(runtime, /title: "Demo \\"App\\""/);
    assert.match(runtime, /development: 'loopback-http'/);
    const vite = files['vite.sempods.generated.ts'];
    assert.match(vite, /export const base = "\/demo\/"/);
    assert.match(vite, /port: 5180/);
    assert.match(vite, /scope: "\/demo\/"/);
    assert.match(vite, /navigateFallbackAllowlist: \[\/\^\\\/demo\\\/\$\/\]/);
    assert.match(vite, /skipWaiting: false/);
  });
  it('has no PWA settings when the app opts out', () => {
    assert.match(
      generatedFiles({ ...app, pwa: false })['vite.sempods.generated.ts'],
      /export const pwa: .* = null;/,
    );
  });
});

describe('new-app', () => {
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sempods-template-'));
    cpSync(join(templateRoot, '.sempods'), join(root, '.sempods'), {
      recursive: true,
    });
    writeFileSync(
      join(root, 'apps.json'),
      '{\n  "schemaVersion": 1,\n  "apps": []\n}\n',
    );
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('creates the app, fills its name and records it in apps.json', () => {
    const app = createApp(root, {
      id: 'konsum',
      title: 'Einkaufs<liste>',
      language: 'de',
    });
    assert.equal(app.devPort, 5174);
    const dir = join(root, 'apps', 'konsum');
    assert.equal(
      JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name,
      'konsum',
    );
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.match(html, /<html lang="de">/);
    assert.match(html, /<title>Einkaufs&#60;liste&#62;<\/title>/);
    assert.deepEqual(staleGenerated(dir, app), []);
    const manifest = JSON.parse(readFileSync(join(root, 'apps.json'), 'utf8'));
    assert.deepEqual(manifest.apps, [app]);
    assert.equal(createApp(root, { id: 'second' }).devPort, 5175);
  });

  it('changes nothing for an existing or invalid ID', () => {
    createApp(root, { id: 'konsum' });
    const before = readFileSync(join(root, 'apps.json'), 'utf8');
    writeFileSync(join(root, 'apps', 'konsum', 'src', 'App.tsx'), 'owner code');
    assert.throws(
      () => createApp(root, { id: 'konsum', title: 'Other' }),
      /already exists/,
    );
    assert.throws(
      () => createApp(root, { id: '../evil' }),
      /one lowercase segment/,
    );
    assert.throws(() => createApp(root, { id: 'nul' }), /device name/);
    assert.equal(readFileSync(join(root, 'apps.json'), 'utf8'), before);
    assert.equal(
      readFileSync(join(root, 'apps', 'konsum', 'src', 'App.tsx'), 'utf8'),
      'owner code',
    );
    assert.equal(existsSync(join(root, 'apps', 'evil')), false);
  });

  it('refuses a directory that exists without a manifest entry', () => {
    mkdirSync(join(root, 'apps', 'orphan'), { recursive: true });
    assert.throws(() => createApp(root, { id: 'orphan' }), /already exists/);
  });
});

describe('check', () => {
  it('finds package names in imports', () => {
    const names = importedPackages(`
      import React from 'react';
      import type { X } from '@sempods/app-sdk/react';
      import './index.css';
      import { join } from 'node:path';
      import fs from 'fs';
      const lazy = import('lodash/fp');
      export { y } from "./y.ts";
      // import ghost from 'ghost';
      /* const old = require('legacy'); */
      const text = "import fake from 'not-a-package'";
      const cjs = require('cjs-only');
      export * from '@scope/reexported/sub';`);
    assert.deepEqual([...names].sort(), [
      '@scope/reexported',
      '@sempods/app-sdk',
      'cjs-only',
      'lodash',
      'react',
    ]);
  });

  it('reports undeclared imports, edited generated files and SDK version drift', () => {
    const root = mkdtempSync(join(tmpdir(), 'sempods-check-'));
    try {
      cpSync(join(templateRoot, '.sempods'), join(root, '.sempods'), {
        recursive: true,
      });
      mkdirSync(join(root, 'reference', 'sempods-sdk'), { recursive: true });
      const skeletonVersion = JSON.parse(
        readFileSync(
          join(root, '.sempods', 'skeleton', 'app', 'package.json'),
          'utf8',
        ),
      ).dependencies['@sempods/app-sdk'];
      writeFileSync(
        join(root, 'reference', 'sempods-sdk', 'source.json'),
        JSON.stringify({ version: skeletonVersion }),
      );
      writeFileSync(
        join(root, 'apps.json'),
        '{"schemaVersion": 1, "apps": []}',
      );
      createApp(root, { id: 'demo' });
      assert.deepEqual(staticProblems(root), []);

      const dir = join(root, 'apps', 'demo');
      writeFileSync(
        join(dir, 'src', 'extra.ts'),
        "import confetti from 'canvas-confetti';\n",
      );
      mkdirSync(join(dir, 'tests'));
      writeFileSync(
        join(dir, 'tests', 'helper.cjs'),
        "module.exports = require('left-pad');\n",
      );
      mkdirSync(join(dir, 'tests', 'nested'));
      writeFileSync(
        join(dir, 'tests', 'nested', 'undeclared.test.mts'),
        "import { unified } from 'unified';\n",
      );
      writeFileSync(
        join(dir, 'tests', 'nested', 'helper.cts'),
        "import yaml = require('js-yaml');\n",
      );
      mkdirSync(join(dir, 'dist'));
      writeFileSync(join(dir, 'dist', 'bundle.js'), "import 'bundled-only';\n");
      writeFileSync(join(dir, 'vite.sempods.generated.ts'), '// edited\n');
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      pkg.dependencies['@sempods/client-sdk'] = '^0.1.0';
      writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
      const problems = staticProblems(root).join('\n');
      assert.match(problems, /imports canvas-confetti/);
      assert.match(problems, /tests\/helper\.cjs imports left-pad/);
      assert.match(problems, /undeclared\.test\.mts imports unified/);
      assert.match(problems, /helper\.cts imports js-yaml/);
      assert.doesNotMatch(problems, /bundled-only/);
      mkdirSync(join(root, 'apps', 'orphan'));
      assert.match(
        staticProblems(root).join('\n'),
        /apps\/orphan is not listed in apps\.json/,
      );
      assert.match(
        problems,
        /vite\.sempods\.generated\.ts does not match apps\.json/,
      );
      assert.match(problems, /must be an exact version/);
      assert.match(problems, /SDK versions differ/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('SDK snapshot links', () => {
  const present = (path) =>
    ['docs/quickstart.md', 'docs/pwa.md', 'examples/todo/src/app.tsx'].includes(
      path,
    );
  it('keeps links inside the snapshot and pins the others', () => {
    const source = [
      '[q](quickstart.md#1-create) [p](./pwa.md) [app](../examples/todo/src/app.tsx)',
      '[rules](agents/release.md) [web](https://example.org/x) [here](#top)',
      '[ref]: ../AGENTS.md',
    ].join('\n');
    const out = pinOutsideLinks(source, 'docs/README.md', present, 'v0.2.0');
    assert.match(out, /\[q\]\(quickstart\.md#1-create\)/);
    assert.match(out, /\[p\]\(\.\/pwa\.md\)/);
    assert.match(out, /\[app\]\(\.\.\/examples\/todo\/src\/app\.tsx\)/);
    assert.match(
      out,
      /\[rules\]\(https:\/\/github\.com\/sempods\/sempods-typescript\/blob\/v0\.2\.0\/docs\/agents\/release\.md\)/,
    );
    assert.match(out, /\[web\]\(https:\/\/example\.org\/x\)/);
    assert.match(out, /\[here\]\(#top\)/);
    assert.match(
      out,
      /\[ref\]: https:\/\/github\.com\/sempods\/sempods-typescript\/blob\/v0\.2\.0\/AGENTS\.md/,
    );
  });
});
