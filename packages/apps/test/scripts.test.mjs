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
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import {
  invalidId,
  invalidOrigin,
  nextDevPort,
  readApps,
  validateApps,
} from '../scripts/lib/apps.mjs';
import { generatedFiles, staleGenerated } from '../scripts/lib/generate.mjs';
import { configureSite } from '../scripts/configure-site.mjs';
import { createApp } from '../scripts/new-app.mjs';
import { monogramLetter, monogramPng } from '../scripts/lib/icon.mjs';
import { drawIcon } from '../scripts/icon.mjs';
import {
  iconColours,
  themeCss,
  themeNames,
  tokenColours,
} from '../scripts/lib/themes.mjs';
import { SKELETON } from '../scripts/lib/paths.mjs';
import { importedPackages, staticProblems } from '../scripts/check.mjs';
import { adoptPageTitle, pageProblems } from '../scripts/lib/page.mjs';
import { repositoryRoot } from '../scripts/lib/paths.mjs';
import { scriptArgs } from '../scripts/lib/pnpm.mjs';
import { SDK } from '../scripts/lib/sdk.mjs';
import { templateRoot, tempRepository } from './fixture.mjs';

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
  it('accepts routes as distinct lowercase segments', () => {
    const app = (routes) => ({
      id: 'konsum',
      title: 'Konsum',
      language: 'de',
      path: '/konsum/',
      devPort: 5174,
      pwa: true,
      routes,
    });
    const problems = (routes) =>
      validateApps({ schemaVersion: 1, apps: [app(routes)] });
    assert.deepEqual(problems(['open', 'bought']), []);
    assert.deepEqual(problems(undefined), []);
    assert.match(problems('bought').join(), /routes must be a list/);
    assert.match(problems(['Bought']).join(), /one lowercase segment/);
    assert.match(problems(['a/b']).join(), /one lowercase segment/);
    assert.match(problems(['callback']).join(), /reserved/);
    assert.match(problems(['nul']).join(), /device name on Windows/);
    assert.match(problems(['open', 'open']).join(), /listed twice/);
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
        host: 'netlify',
      },
    });
    assert.ok(problems.some((p) => p.includes('site.production is required')));
    assert.ok(problems.some((p) => p.includes('site.host is not a known')));
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
  it('returns to the route a sign-in starts from and caches every route', async () => {
    const routed = { ...app, routes: ['open', 'bought'] };
    const files = generatedFiles(routed);
    assert.match(
      files['vite.sempods.generated.ts'],
      /navigateFallbackAllowlist: \[\/\^\\\/demo\\\/\(\(open\|bought\)\\\/\?\)\?\$\/\]/,
    );
    const dir = mkdtempSync(join(tmpdir(), 'sempods-generated-'));
    try {
      const file = join(dir, 'sempods.generated.mts');
      writeFileSync(file, files['src/sempods.generated.ts']);
      const { app: generated, runtimeOptions } = await import(
        pathToFileURL(file).href
      );
      assert.deepEqual(generated.routes, ['open', 'bought']);
      const returnTo = (pathname) => {
        globalThis.location = { pathname };
        try {
          return runtimeOptions.returnTo();
        } finally {
          delete globalThis.location;
        }
      };
      assert.equal(returnTo('/demo/bought'), '/demo/bought');
      assert.equal(returnTo('/demo/bought/'), '/demo/bought');
      assert.equal(returnTo('/demo/'), '/demo/');
      assert.equal(returnTo('/demo/callback'), '/demo/');
      assert.equal(returnTo('/other/bought'), '/demo/');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('leaves the language to the app with "auto"', () => {
    const files = generatedFiles({ ...app, language: 'auto' });
    const runtime = files['src/sempods.generated.ts'];
    assert.match(runtime, /^  language: "auto",$/m);
    assert.match(runtime, /import type \{ BrowserRuntimeOptions \} from/);
    assert.doesNotMatch(files['vite.sempods.generated.ts'], /lang:/);
    assert.match(
      generatedFiles(app)['vite.sempods.generated.ts'],
      /lang: "en",/,
    );
  });
  it('has no PWA settings when the app opts out', () => {
    assert.match(
      generatedFiles({ ...app, pwa: false })['vite.sempods.generated.ts'],
      /export const pwa: .* = null;/,
    );
  });
});

describe('repository and tooling', () => {
  let root;
  beforeEach(() => {
    root = tempRepository('sempods-paths-');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const rootManifest = () =>
    JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

  it('finds the repository from any directory inside it', () => {
    const nested = join(root, 'apps', 'demo', 'src');
    mkdirSync(nested, { recursive: true });
    assert.equal(repositoryRoot(nested), root);
    assert.equal(repositoryRoot(root), root);
    const outside = mkdtempSync(join(tmpdir(), 'sempods-outside-'));
    try {
      assert.throws(() => repositoryRoot(outside), /no apps repository here/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('requires apps.json', () => {
    rmSync(join(root, 'apps.json'));
    assert.throws(() => readApps(root), /apps\.json is missing/);
  });

  it("gives a new app the root's SDK version", () => {
    const pkg = rootManifest();
    for (const name of SDK) pkg.devDependencies[name] = '9.8.7';
    writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
    createApp(root, { id: 'demo' });
    const { dependencies } = JSON.parse(
      readFileSync(join(root, 'apps', 'demo', 'package.json'), 'utf8'),
    );
    for (const name of SDK) assert.equal(dependencies[name], '9.8.7');
    assert.deepEqual(
      Object.keys(dependencies),
      Object.keys(dependencies).sort(),
    );
    delete pkg.devDependencies[SDK[1]];
    writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
    assert.throws(
      () => createApp(root, { id: 'other' }),
      /must declare @sempods\/client-sdk/,
    );
    assert.equal(existsSync(join(root, 'apps', 'other')), false);
  });

  it('finds its own files when the tooling lives elsewhere', async () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'sempods-tooling-'));
    try {
      cpSync(join(templateRoot, 'packages', 'apps'), join(elsewhere, 'tooling'), {
        recursive: true,
        filter: (src) => !src.includes('node_modules'),
      });
      const moved = await import(
        pathToFileURL(join(elsewhere, 'tooling', 'scripts', 'new-app.mjs'))
          .href
      );
      moved.createApp(root, { id: 'demo' });
      assert.ok(existsSync(join(root, 'apps', 'demo', 'src', 'App.tsx')));
      assert.deepEqual(staticProblems(root), []);
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });
});

describe('new-app', () => {
  let root;
  beforeEach(() => {
    root = tempRepository('sempods-template-');
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
    // The title comes from apps.json through the generated Vite plugin.
    assert.doesNotMatch(html, /<title/);
    assert.match(
      readFileSync(join(dir, 'vite.sempods.generated.ts'), 'utf8'),
      /\{ tag: 'title', children: "Einkaufs&#60;liste&#62;", injectTo: 'head' \}/,
    );
    assert.match(
      readFileSync(join(dir, 'vite.config.ts'), 'utf8'),
      /plugins: \[react\(\), pageTitle,/,
    );
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
    // By default an app follows the browser; its page starts in English.
    const second = createApp(root, { id: 'second' });
    assert.equal(second.devPort, 5175);
    assert.equal(second.language, 'auto');
    assert.match(
      readFileSync(join(root, 'apps', 'second', 'index.html'), 'utf8'),
      /<html lang="en">/,
    );
  });

  it('draws a monogram of the title as the app icon', () => {
    createApp(root, { id: 'konsum', title: 'Einkaufsliste' });
    const pub = join(root, 'apps', 'konsum', 'public');
    assert.match(
      readFileSync(join(pub, 'favicon.svg'), 'utf8'),
      /^<svg [^>]*viewBox="0 0 64 64">.*<path d="M/,
    );
    for (const size of [192, 512]) {
      const png = readFileSync(join(pub, `icon-${size}.png`));
      assert.equal(png.toString('latin1', 1, 4), 'PNG');
      // IHDR: width and height, 8-bit RGBA.
      assert.deepEqual(
        [png.readUInt32BE(16), png.readUInt32BE(20), png[24], png[25]],
        [size, size, 8, 6],
      );
    }
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

  it('preserves other fields of apps.json when adding an app', () => {
    writeFileSync(
      join(root, 'apps.json'),
      JSON.stringify({ schemaVersion: 1, apps: [], note: 'owner' }),
    );
    createApp(root, { id: 'konsum' });
    const manifest = JSON.parse(readFileSync(join(root, 'apps.json'), 'utf8'));
    assert.equal(manifest.note, 'owner');
    assert.equal(manifest.apps[0].id, 'konsum');
  });

  it('refuses a directory that exists without a manifest entry', () => {
    mkdirSync(join(root, 'apps', 'orphan'), { recursive: true });
    assert.throws(() => createApp(root, { id: 'orphan' }), /already exists/);
  });
});

describe('app icon', () => {
  it('takes the first letter of the title, without accents', () => {
    assert.equal(monogramLetter('Einkaufsliste'), 'E');
    assert.equal(monogramLetter(' ärzte'), 'A');
    assert.equal(monogramLetter('2048'), undefined);
    assert.equal(monogramLetter('Ωmega'), undefined);
  });

  it('draws the letter in white on graphite, with transparent corners', () => {
    // RGBA of one pixel: the image data follows the 33 bytes of signature and
    // header and precedes the checksum and the end chunk.
    const pixel = (letter) => {
      const png = monogramPng(letter, 64);
      const rows = inflateSync(png.subarray(41, png.length - 16));
      return (x, y) => {
        const start = y * 257 + 1 + x * 4;
        return [...rows.subarray(start, start + 4)];
      };
    };
    const at = pixel('I');
    assert.deepEqual(at(0, 0), [0x1f, 0x29, 0x33, 0]);
    assert.deepEqual(at(10, 32), [0x1f, 0x29, 0x33, 255]);
    assert.deepEqual(at(32, 32), [255, 255, 255, 255]);
    // Without a letter, the square stays plain.
    assert.deepEqual(pixel(undefined)(32, 32), [0x1f, 0x29, 0x33, 255]);
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
    root = tempRepository('sempods-site-');
    createApp(root, { id: 'konsum', title: 'Einkauf', language: 'de' });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('records the site and regenerates every app, idempotently', () => {
    configureSite(root, {
      production: 'https://apps.example.org',
      preview: 'https://preview--apps.netlify.app',
    });
    assert.deepEqual(apps().site, {
      production: 'https://apps.example.org',
      preview: 'https://preview--apps.netlify.app',
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
  it('drops the preview on request', () => {
    configureSite(root, {
      production: 'https://apps.example.org',
      preview: 'https://preview.apps.pages.dev',
    });
    configureSite(root, { noPreview: true });
    assert.deepEqual(apps().site, {
      production: 'https://apps.example.org',
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
    const root = tempRepository('sempods-check-');
    try {
      const sdk = JSON.parse(
        readFileSync(join(root, 'package.json'), 'utf8'),
      ).devDependencies;
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
      rmSync(join(root, 'node_modules'), { recursive: true });
      // A release outside the range the tooling supports.
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          devDependencies: {
            '@sempods/app-sdk': '99.0.0',
            '@sempods/client-sdk': '99.0.0',
          },
        }),
      );
      assert.match(
        staticProblems(root).join('\n'),
        /@sempods\/app-sdk 99\.0\.0 is outside the range @sempods\/apps/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports undeclared imports, edited generated files and SDK version drift', () => {
    const root = tempRepository('sempods-check-');
    try {
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

describe('page title', () => {
  let root;
  let dir;
  const app = { id: 'demo', title: 'Demo & Co' };
  const file = (name) => join(dir, name);
  const page = () => readFileSync(file('index.html'), 'utf8');
  // The skeleton's files of 0.7, which the migration moves.
  const config07 = `import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { base, pwa, server } from './vite.sempods.generated.ts';

// Base path, development port and PWA settings come from apps.json through the
// generated file; add your own plugins and options here.
export default defineConfig({
  base,
  server,
  preview: server,
  plugins: [react(), ...(pwa ? [VitePWA(pwa)] : [])],
});
`;
  const page07 = (title) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${title}</title>
  </head>
  <body>
    <svg><title>Logo</title></svg>
  </body>
</html>
`;
  beforeEach(() => {
    root = tempRepository('sempods-page-');
    createApp(root, { id: 'demo', title: app.title });
    dir = join(root, 'apps', 'demo');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reports an own page title and a Vite config without the plugin', () => {
    assert.deepEqual(pageProblems(dir, 'demo'), []);
    // An SVG title in the body is not the page's.
    writeFileSync(
      file('index.html'),
      page07('x').replace(/ {4}<title>x<\/title>\n/, ''),
    );
    assert.deepEqual(pageProblems(dir, 'demo'), []);
    writeFileSync(
      file('index.html'),
      page07('x').replace('<title>x</title>', '<TITLE id="t">x</TITLE>'),
    );
    writeFileSync(file('vite.config.ts'), config07);
    const problems = pageProblems(dir, 'demo').join('\n');
    assert.match(problems, /index\.html has its own <title>/);
    assert.match(problems, /vite\.config\.ts does not add pageTitle/);
    assert.match(staticProblems(root).join('\n'), /has its own <title>/);
  });

  it("moves an app with the skeleton's files to the generated title", () => {
    writeFileSync(file('vite.config.ts'), config07);
    writeFileSync(file('index.html'), page07('Demo &#38; Co'));
    assert.deepEqual(adoptPageTitle(dir, app), [
      'apps/demo/vite.config.ts',
      'apps/demo/index.html',
    ]);
    assert.deepEqual(pageProblems(dir, 'demo'), []);
    assert.match(page(), /<svg><title>Logo<\/title><\/svg>/);
    assert.deepEqual(adoptPageTitle(dir, app), []);
  });

  it('leaves changed files to the owner', () => {
    const custom = config07.replace('react()', 'react(), extra()');
    writeFileSync(file('vite.config.ts'), custom);
    writeFileSync(file('index.html'), page07('Demo &#38; Co'));
    // Without the plugin the page keeps its title.
    assert.deepEqual(adoptPageTitle(dir, app), []);
    assert.equal(readFileSync(file('vite.config.ts'), 'utf8'), custom);
    // With the plugin, a title other than the app's stays for the owner.
    writeFileSync(file('vite.config.ts'), config07);
    writeFileSync(file('index.html'), page07('Hand-made'));
    assert.deepEqual(adoptPageTitle(dir, app), ['apps/demo/vite.config.ts']);
    assert.match(page(), /<title>Hand-made<\/title>/);
    assert.equal(pageProblems(dir, 'demo').length, 1);
  });
});

describe('themes', () => {
  // WCAG 2 relative luminance and contrast ratio of two #rrggbb colours.
  const luminance = (hex) =>
    [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };

  it('ships calm as the default and three more', () => {
    assert.deepEqual(themeNames(), ['calm', 'fresh', 'playful', 'warm']);
  });

  it('keeps text, muted text and actions readable in light and dark mode', () => {
    for (const name of themeNames()) {
      const css = themeCss(SKELETON, name);
      const token = (t) => tokenColours(css, t);
      for (const mode of ['light', 'dark']) {
        const bg = token('bg')[mode];
        for (const [fg, on] of [
          ['text', bg],
          ['muted', bg],
          ['accent', bg],
          ['on-accent', token('accent')[mode]],
        ]) {
          const ratio = contrast(token(fg)[mode], on);
          assert.ok(ratio >= 4.5, `${name} ${mode} ${fg}: ${ratio.toFixed(2)}`);
        }
      }
    }
  });
});

describe('app theme and icon', () => {
  let root;
  beforeEach(() => {
    root = tempRepository('sempods-theme-');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const file = (...path) => readFileSync(join(root, 'apps', ...path), 'utf8');

  it('imports the chosen theme and draws the icon in its accent', () => {
    createApp(root, { id: 'demo', title: 'Demo', theme: 'warm' });
    assert.match(
      file('demo', 'src', 'main.tsx'),
      /^import '\.\/themes\/warm\.css';$/m,
    );
    const warm = iconColours(themeCss(SKELETON, 'warm'));
    assert.match(
      file('demo', 'public', 'favicon.svg'),
      new RegExp(`fill:${warm.light.background}`),
    );
    createApp(root, { id: 'plain', title: 'Plain' });
    assert.match(file('plain', 'src', 'main.tsx'), /themes\/calm\.css/);
    assert.throws(
      () => createApp(root, { id: 'odd', theme: 'neon' }),
      /theme must be one of calm, fresh, playful, warm/,
    );
  });

  it('draws the icon again after a theme change', () => {
    createApp(root, { id: 'demo', title: 'Demo' });
    const main = join(root, 'apps', 'demo', 'src', 'main.tsx');
    writeFileSync(
      main,
      file('demo', 'src', 'main.tsx').replace('calm', 'fresh'),
    );
    assert.deepEqual(drawIcon(root, 'demo'), [
      'apps/demo/public/favicon.svg',
      'apps/demo/public/icon-192.png',
      'apps/demo/public/icon-512.png',
    ]);
    const fresh = iconColours(themeCss(SKELETON, 'fresh'));
    assert.match(
      file('demo', 'public', 'favicon.svg'),
      new RegExp(`fill:${fresh.light.background}`),
    );
    writeFileSync(main, "import './index.css';\n");
    assert.throws(() => drawIcon(root, 'demo'), /imports no theme/);
    assert.throws(() => drawIcon(root, 'none'), /lists no app "none"/);
  });

  it('carries a description to the sign-in screen, manifest and overview', () => {
    const app = createApp(root, {
      id: 'demo',
      title: 'Demo',
      description: ' Shopping made easy. ',
    });
    assert.equal(app.description, 'Shopping made easy.');
    assert.match(
      file('demo', 'src', 'sempods.generated.ts'),
      /description: "Shopping made easy\.",/,
    );
    assert.match(
      file('demo', 'vite.sempods.generated.ts'),
      /description: "Shopping made easy\.",/,
    );
    assert.match(
      file('demo', 'src', 'App.tsx'),
      /description=\{app\.description\}/,
    );
    createApp(root, { id: 'bare' });
    assert.match(
      file('bare', 'src', 'sempods.generated.ts'),
      /description: null,/,
    );
    assert.doesNotMatch(
      file('bare', 'vite.sempods.generated.ts'),
      /description:/,
    );
    assert.throws(
      () => createApp(root, { id: 'long', description: 'x'.repeat(121) }),
      /at most 120 characters/,
    );
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
