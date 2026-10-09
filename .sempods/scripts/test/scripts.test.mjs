import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  invalidId,
  invalidOrigin,
  nextDevPort,
  validateApps,
} from '../lib/apps.mjs';
import { generatedFiles, staleGenerated } from '../lib/generate.mjs';
import { configureSite } from '../configure-site.mjs';
import { createApp } from '../new-app.mjs';
import { importedPackages, staticProblems } from '../check.mjs';
import { scriptArgs } from '../lib/pnpm.mjs';

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
  it('accepts an optional boolean SDK update choice, rejecting other values', () => {
    for (const sdkAutoUpdates of [true, false])
      assert.deepEqual(
        validateApps({ schemaVersion: 1, apps: [app], sdkAutoUpdates }),
        [],
      );
    for (const sdkAutoUpdates of ['true', 'false', 1, null])
      assert.ok(
        validateApps({ schemaVersion: 1, apps: [app], sdkAutoUpdates }).some(
          (problem) => problem.includes('sdkAutoUpdates'),
        ),
      );
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
  it('accepts a site with HTTPS origins and a known host', () => {
    assert.deepEqual(
      validateApps({
        schemaVersion: 1,
        apps: [app],
        site: {
          production: 'https://apps.example.org',
          preview: 'https://preview--apps.netlify.app',
          host: 'netlify',
        },
      }),
      [],
    );
  });
  it('rejects site origins with a path, port, case, HTTP or loopback', () => {
    for (const origin of [
      'http://apps.example.org',
      'https://apps.example.org/',
      'https://apps.example.org/apps',
      'https://apps.example.org:8443',
      'https://Apps.example.org',
      'https://user@apps.example.org',
      'apps.example.org',
    ])
      assert.notEqual(invalidOrigin(origin), undefined, origin);
    const problems = validateApps({
      schemaVersion: 1,
      apps: [app],
      site: {
        preview: 'https://a.example.org',
        host: 'ftp',
        domain: 'x',
      },
    });
    assert.ok(problems.some((p) => p.includes('site.production is required')));
    assert.ok(problems.some((p) => p.includes('site.host must be one of')));
    assert.ok(problems.some((p) => p.includes('site.domain is not a known')));
    assert.ok(
      validateApps({
        schemaVersion: 1,
        apps: [app],
        site: { production: 'https://a.org', preview: 'https://a.org' },
      }).some((p) => p.includes('must differ')),
    );
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
      /get redirectUri\(\) \{\n\s+return `\$\{location\.origin\}\/demo\/callback`;/,
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
  it('reads location only when the callback is used', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sempods-generated-'));
    try {
      // Node strips the types; the module runs without a browser's location.
      const file = join(dir, 'sempods.generated.mts');
      writeFileSync(file, generatedFiles(app)['src/sempods.generated.ts']);
      const { runtimeOptions } = await import(pathToFileURL(file).href);
      assert.equal(runtimeOptions.returnTo, '/demo/');
      assert.throws(() => runtimeOptions.identity.redirectUri, ReferenceError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('adds a did:web profile per configured site origin', () => {
    const runtime = generatedFiles(app, {
      production: 'https://apps.example.org',
      preview: 'https://preview--apps.netlify.app',
    })['src/sempods.generated.ts'];
    for (const host of ['apps.example.org', 'preview--apps.netlify.app']) {
      assert.ok(runtime.includes(`clientId: "did:web:${host}:demo"`), host);
      assert.ok(
        runtime.includes(`redirectUri: "https://${host}/demo/callback"`),
        host,
      );
    }
    assert.match(runtime, /^  local,\n  production,\n  preview,$/m);
    assert.match(runtime, /"sempods-production": "production"/);
    // Only the local profile allows loopback HTTP.
    assert.equal(runtime.match(/development: 'loopback-http'/g).length, 1);
    const localOnly = generatedFiles(app)['src/sempods.generated.ts'];
    assert.match(localOnly, /^  local,\n\};$/m);
    assert.doesNotMatch(localOnly, /did-web/);
  });
  it('selects the local profile outside a site build', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sempods-generated-'));
    try {
      const file = join(dir, 'sempods.generated.mts');
      writeFileSync(
        file,
        generatedFiles(app, { production: 'https://apps.example.org' })[
          'src/sempods.generated.ts'
        ],
      );
      const { profile, profiles, runtimeOptions } = await import(
        pathToFileURL(file).href
      );
      assert.equal(profile, 'local');
      assert.deepEqual(Object.keys(profiles), ['local', 'production']);
      assert.equal(runtimeOptions, profiles.local);
      assert.deepEqual(profiles.production.identity, {
        kind: 'did-web',
        clientId: 'did:web:apps.example.org:demo',
        redirectUri: 'https://apps.example.org/demo/callback',
      });
      assert.equal(profiles.production.development, undefined);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
    assert.match(
      readFileSync(join(dir, 'NOTES.md'), 'utf8'),
      /^# Einkaufs<liste>: development notes$/m,
    );
    // No placeholder survives, in any spelling a formatter might produce.
    const leftovers = (path) =>
      readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? leftovers(join(path, entry.name))
          : /APP_(ID|TITLE|LANGUAGE)/.test(
                readFileSync(join(path, entry.name), 'latin1'),
              )
            ? [entry.name]
            : [],
      );
    assert.deepEqual(leftovers(dir), []);
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

  it('preserves the repository SDK update choice when adding an app', () => {
    writeFileSync(
      join(root, 'apps.json'),
      JSON.stringify({ schemaVersion: 1, apps: [], sdkAutoUpdates: true }),
    );
    createApp(root, { id: 'konsum' });
    const manifest = JSON.parse(readFileSync(join(root, 'apps.json'), 'utf8'));
    assert.equal(manifest.sdkAutoUpdates, true);
    assert.equal(manifest.apps[0].id, 'konsum');
  });

  it('refuses a directory that exists without a manifest entry', () => {
    mkdirSync(join(root, 'apps', 'orphan'), { recursive: true });
    assert.throws(() => createApp(root, { id: 'orphan' }), /already exists/);
  });
});

describe('configure-site', () => {
  let root;
  const apps = () => JSON.parse(readFileSync(join(root, 'apps.json'), 'utf8'));
  const runtime = () =>
    readFileSync(
      join(root, 'apps', 'konsum', 'src', 'sempods.generated.ts'),
      'utf8',
    );
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sempods-site-'));
    cpSync(join(templateRoot, '.sempods'), join(root, '.sempods'), {
      recursive: true,
    });
    writeFileSync(
      join(root, 'apps.json'),
      '{\n  "schemaVersion": 1,\n  "apps": []\n}\n',
    );
    createApp(root, { id: 'konsum', title: 'Einkauf', language: 'de' });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('records the site and regenerates every app, idempotently', () => {
    configureSite(root, {
      production: 'https://apps.example.org',
      preview: 'https://preview--apps.netlify.app',
      host: 'netlify',
    });
    assert.deepEqual(apps().site, {
      production: 'https://apps.example.org',
      preview: 'https://preview--apps.netlify.app',
      host: 'netlify',
    });
    assert.match(runtime(), /did:web:apps\.example\.org:konsum/);
    const dir = join(root, 'apps', 'konsum');
    assert.deepEqual(staleGenerated(dir, apps().apps[0], apps().site), []);
    const before = [readFileSync(join(root, 'apps.json'), 'utf8'), runtime()];
    configureSite(root, {});
    assert.deepEqual(
      [readFileSync(join(root, 'apps.json'), 'utf8'), runtime()],
      before,
    );
    // An app created later gets the site profiles too.
    createApp(root, { id: 'notes', title: 'Notes', language: 'en' });
    assert.match(
      readFileSync(
        join(root, 'apps', 'notes', 'src', 'sempods.generated.ts'),
        'utf8',
      ),
      /did:web:apps\.example\.org:notes/,
    );
  });
  it('defaults to static hosting and drops the preview on request', () => {
    configureSite(root, {
      production: 'https://apps.example.org',
      preview: 'https://preview.apps.pages.dev',
    });
    assert.equal(apps().site.host, 'static');
    configureSite(root, { noPreview: true });
    assert.deepEqual(apps().site, {
      production: 'https://apps.example.org',
      host: 'static',
    });
    assert.doesNotMatch(runtime(), /preview\.apps\.pages\.dev/);
  });
  it('changes the production origin only when asked to', () => {
    configureSite(root, { production: 'https://apps.example.org' });
    assert.throws(
      () => configureSite(root, { production: 'https://other.example.org' }),
      /new identity.*--change-domain/,
    );
    configureSite(root, {
      production: 'https://other.example.org',
      changeDomain: true,
    });
    assert.equal(apps().site.production, 'https://other.example.org');
    assert.match(runtime(), /did:web:other\.example\.org:konsum/);
  });
  it('accepts only addresses the SDK accepts as published identities', () => {
    const before = readFileSync(join(root, 'apps.json'), 'utf8');
    for (const origin of [
      'https://localhost',
      'https://[2001:db8::2]',
      'https://a..example.org',
    ])
      assert.throws(
        () => configureSite(root, { production: origin }),
        /is not a published address the SDK accepts/,
        origin,
      );
    assert.equal(readFileSync(join(root, 'apps.json'), 'utf8'), before);
  });
  it('writes nothing for invalid input', () => {
    const before = readFileSync(join(root, 'apps.json'), 'utf8');
    assert.throws(
      () => configureSite(root, { production: 'http://apps.example.org' }),
      /site\.production must be an HTTPS origin/,
    );
    assert.throws(() => configureSite(root, {}), /--production/);
    assert.throws(
      () =>
        configureSite(root, {
          production: 'https://apps.example.org',
          host: 'ftp',
        }),
      /site\.host/,
    );
    assert.equal(readFileSync(join(root, 'apps.json'), 'utf8'), before);
  });
  it('lets check report generated files behind the site', () => {
    configureSite(root, { production: 'https://apps.example.org' });
    const manifest = apps();
    manifest.site.production = 'https://moved.example.org';
    writeFileSync(join(root, 'apps.json'), JSON.stringify(manifest));
    assert.deepEqual(
      staleGenerated(join(root, 'apps', 'konsum'), manifest.apps[0], manifest.site),
      ['src/sempods.generated.ts'],
    );
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

  it('requires the root SDK version and the reference the installed SDK ships', () => {
    const root = mkdtempSync(join(tmpdir(), 'sempods-check-'));
    try {
      cpSync(join(templateRoot, '.sempods'), join(root, '.sempods'), {
        recursive: true,
      });
      writeFileSync(
        join(root, 'apps.json'),
        '{"schemaVersion": 1, "apps": []}',
      );
      const sdk = JSON.parse(
        readFileSync(
          join(root, '.sempods', 'skeleton', 'app', 'package.json'),
          'utf8',
        ),
      ).dependencies;
      // The root names no SDK yet.
      writeFileSync(join(root, 'package.json'), '{"devDependencies": {}}');
      assert.match(
        staticProblems(root).join('\n'),
        /root: @sempods\/app-sdk must be an exact version/,
      );
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          devDependencies: {
            '@sempods/app-sdk': sdk['@sempods/app-sdk'],
            '@sempods/client-sdk': sdk['@sempods/client-sdk'],
          },
        }),
      );
      assert.deepEqual(staticProblems(root), []);
      // An installed SDK without its shipped reference (before 0.3.0).
      const installed = join(root, 'node_modules', '@sempods', 'app-sdk');
      mkdirSync(installed, { recursive: true });
      writeFileSync(
        join(installed, 'package.json'),
        JSON.stringify({ version: sdk['@sempods/app-sdk'] }),
      );
      assert.match(
        staticProblems(root).join('\n'),
        /ships no app-author reference/,
      );
      mkdirSync(join(installed, 'docs'));
      writeFileSync(join(installed, 'docs', 'ai-app-builder.md'), '# Entry\n');
      assert.deepEqual(staticProblems(root), []);
      // An installed version other than the declared one is drift.
      writeFileSync(
        join(installed, 'package.json'),
        JSON.stringify({ version: '9.9.9' }),
      );
      assert.match(staticProblems(root).join('\n'), /SDK versions differ/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports undeclared imports, edited generated files and SDK version drift', () => {
    const root = mkdtempSync(join(tmpdir(), 'sempods-check-'));
    try {
      cpSync(join(templateRoot, '.sempods'), join(root, '.sempods'), {
        recursive: true,
      });
      const skeleton = JSON.parse(
        readFileSync(
          join(root, '.sempods', 'skeleton', 'app', 'package.json'),
          'utf8',
        ),
      ).dependencies;
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          devDependencies: {
            '@sempods/app-sdk': skeleton['@sempods/app-sdk'],
            '@sempods/client-sdk': skeleton['@sempods/client-sdk'],
          },
        }),
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

describe('script arguments', () => {
  it('drops the leading -- that pnpm passes through', () => {
    assert.deepEqual(scriptArgs(['--', '--standalone', 'all']), [
      '--standalone',
      'all',
    ]);
    assert.deepEqual(scriptArgs(['--standalone', 'all']), [
      '--standalone',
      'all',
    ]);
    assert.deepEqual(scriptArgs(['demo', '--', 'x']), ['demo', '--', 'x']);
  });
});
