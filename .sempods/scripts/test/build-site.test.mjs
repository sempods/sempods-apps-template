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
import { buildSite } from '../build-site.mjs';
import { configureSite } from '../configure-site.mjs';
import { renderNotFound, renderOverview } from '../lib/overview.mjs';
import { createApp } from '../new-app.mjs';

const templateRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

describe('build-site', () => {
  let root;
  let builds;
  const read = (path) => readFileSync(join(root, 'site-dist', path), 'utf8');
  // Stands in for the app's `vite build`: what the PWA build would write.
  const build = (appDir, mode, outDir) => {
    builds.push({ app: appDir.split(/[\\/]/).pop(), mode, outDir });
    mkdirSync(outDir, { recursive: true });
    // Vite copies public/ into the output.
    cpSync(join(appDir, 'public'), outDir, { recursive: true });
    writeFileSync(
      join(outDir, 'index.html'),
      `<!doctype html><html><head><title>x</title></head><p>${mode}</p></html>`,
    );
    if (appDir.endsWith('konsum'))
      writeFileSync(
        join(outDir, 'manifest.webmanifest'),
        JSON.stringify({
          name: 'Einkaufsliste',
          description: 'Was noch fehlt',
          icons: [
            { src: '/konsum/icon-192.png', sizes: '192x192' },
            { src: '/konsum/icon-512.png', sizes: '512x512' },
          ],
        }),
      );
    return true;
  };
  beforeEach(() => {
    builds = [];
    root = mkdtempSync(join(tmpdir(), 'sempods-build-site-'));
    cpSync(join(templateRoot, '.sempods'), join(root, '.sempods'), {
      recursive: true,
    });
    writeFileSync(
      join(root, 'apps.json'),
      '{\n  "schemaVersion": 1,\n  "apps": []\n}\n',
    );
    createApp(root, { id: 'konsum', title: 'Einkauf', language: 'de' });
    createApp(root, { id: 'notes', title: 'Notes', language: 'en', pwa: false });
    // The SDK's notices, as the installed package ships them.
    for (const name of ['app-sdk', 'client-sdk']) {
      const dir = join(root, 'node_modules', '@sempods', name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'LICENSE'), `${name} licence\n`);
      writeFileSync(join(dir, 'NOTICE'), `${name} notice\n`);
    }
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('needs a configured profile and at least one app', () => {
    assert.throws(() => buildSite(root, { build }), /no site\.production/);
    configureSite(root, { production: 'https://apps.example.org' });
    assert.throws(
      () => buildSite(root, { profile: 'preview', build }),
      /no site\.preview/,
    );
    assert.throws(
      () => buildSite(root, { profile: 'staging', build }),
      /one of production, preview/,
    );
    assert.equal(builds.length, 0);
  });

  it('builds each app with its site mode into its own path', () => {
    configureSite(root, {
      production: 'https://apps.example.org',
      preview: 'https://preview.apps.pages.dev',
    });
    buildSite(root, { profile: 'preview', build });
    assert.deepEqual(
      builds.map(({ app, mode, outDir }) => [app, mode, outDir]),
      [
        ['konsum', 'sempods-preview', join(root, 'site-dist', 'konsum')],
        ['notes', 'sempods-preview', join(root, 'site-dist', 'notes')],
      ],
    );
    assert.deepEqual(JSON.parse(read('konsum/did.json')), {
      '@context': 'https://www.w3.org/ns/did/v1',
      id: 'did:web:preview.apps.pages.dev:konsum',
    });
    for (const name of ['app-sdk', 'client-sdk'])
      for (const file of ['LICENSE', 'NOTICE'])
        assert.equal(
          read(`notes/licenses/${name}/${file}`),
          `${name} ${file === 'LICENSE' ? 'licence' : 'notice'}\n`,
        );
    // The local build stays where vite preview serves it.
    assert.equal(existsSync(join(root, 'apps', 'konsum', 'dist')), false);
  });

  it('serves callbacks without rewrites outside Netlify', () => {
    for (const host of ['cloudflare-pages', 'static']) {
      configureSite(root, { production: 'https://apps.example.org', host });
      buildSite(root, { build });
      assert.equal(read('konsum/callback.html'), read('konsum/index.html'));
      // The callback's query must not leak through Referer headers.
      assert.match(
        read('konsum/callback.html'),
        /<meta name="referrer" content="strict-origin" \/>/,
      );
      assert.equal(existsSync(join(root, 'site-dist', '_redirects')), false);
      assert.match(read('404.html'), /<h1>Page not found<\/h1>/);
    }
  });

  it('rewrites only the callbacks on Netlify', () => {
    configureSite(root, {
      production: 'https://apps.example.org',
      host: 'netlify',
    });
    buildSite(root, { build });
    assert.equal(
      read('_redirects'),
      '/konsum/callback /konsum/index.html 200!\n/notes/callback /notes/index.html 200!\n',
    );
    assert.equal(existsSync(join(root, 'site-dist', 'konsum', 'callback.html')), false);
    assert.match(read('404.html'), /<h1>Page not found<\/h1>/);
  });

  it('lists every app on the overview, from its manifest when there is one', () => {
    configureSite(root, { production: 'https://apps.example.org' });
    buildSite(root, { build });
    const html = read('index.html');
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<a href="\/konsum\/" lang="de">/);
    assert.match(html, /<img src="\/konsum\/icon-512\.png" alt=""/);
    assert.match(html, /Einkaufsliste/);
    assert.match(html, /Was noch fehlt/);
    // Without a manifest: apps.json and the app's icon.
    assert.match(html, /<a href="\/notes\/" lang="en">/);
    assert.match(html, /<img src="\/notes\/icon-192\.png" alt=""/);
  });

  it('resolves relative manifest icons against the app path', () => {
    configureSite(root, { production: 'https://apps.example.org' });
    const relative = (appDir, mode, outDir) => {
      build(appDir, mode, outDir);
      if (appDir.endsWith('konsum'))
        writeFileSync(
          join(outDir, 'manifest.webmanifest'),
          JSON.stringify({
            icons: [{ src: 'icons/app.png', sizes: '512x512' }],
          }),
        );
      return true;
    };
    buildSite(root, { build: relative });
    assert.match(read('index.html'), /<img src="\/konsum\/icons\/app\.png"/);
  });

  it('rejects a did.json the app ships for another identity', () => {
    configureSite(root, { production: 'https://apps.example.org' });
    writeFileSync(
      join(root, 'apps', 'konsum', 'public', 'did.json'),
      JSON.stringify({ id: 'did:web:old.example.org:konsum' }),
    );
    assert.throws(
      () => buildSite(root, { build }),
      /ships a did\.json for another identity/,
    );
  });

  it('refuses generated configuration behind apps.json', () => {
    configureSite(root, { production: 'https://apps.example.org' });
    const file = join(root, 'apps.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    manifest.site.production = 'https://moved.example.org';
    writeFileSync(file, JSON.stringify(manifest));
    assert.throws(
      () => buildSite(root, { build }),
      /apps\/konsum\/src\/sempods\.generated\.ts does not match apps\.json; run pnpm run configure-site/,
    );
    assert.equal(builds.length, 0);
  });

  it('needs the SDK licence and names an unreadable did.json', () => {
    configureSite(root, { production: 'https://apps.example.org' });
    writeFileSync(join(root, 'apps', 'konsum', 'public', 'did.json'), '{');
    assert.throws(
      () => buildSite(root, { build }),
      /apps\/konsum\/public\/did\.json is not valid JSON/,
    );
    rmSync(join(root, 'apps', 'konsum', 'public', 'did.json'));
    rmSync(join(root, 'node_modules', '@sempods', 'client-sdk', 'LICENSE'));
    assert.throws(
      () => buildSite(root, { build }),
      /@sempods\/client-sdk with its LICENSE is not installed/,
    );
  });

  it('leaves out host files an app ships, which hosts ignore there', () => {
    configureSite(root, { production: 'https://apps.example.org' });
    writeFileSync(
      join(root, 'apps', 'konsum', 'public', '_redirects'),
      '/* /index.html 200\n',
    );
    writeFileSync(join(root, 'apps', 'konsum', 'public', '404.html'), 'own');
    const { warnings, apps, site } = buildSite(root, { build });
    assert.deepEqual(warnings, [
      'apps/konsum/public/_redirects was left out: hosts read it only at the site root, which build-site writes.',
      'apps/konsum/public/404.html was left out: hosts read it only at the site root, which build-site writes.',
    ]);
    // Cloudflare Pages would otherwise serve the nested 404.html.
    assert.equal(existsSync(join(root, 'site-dist', 'konsum', '404.html')), false);
    assert.equal(existsSync(join(root, 'site-dist', 'konsum', '_redirects')), false);
    assert.equal(site.production, 'https://apps.example.org');
    assert.deepEqual(
      apps.map((app) => app.id),
      ['konsum', 'notes'],
    );
  });

  it('stops when an app build fails or writes nowhere', () => {
    configureSite(root, { production: 'https://apps.example.org' });
    assert.throws(
      () => buildSite(root, { build: () => false }),
      /apps\/konsum: the build failed/,
    );
    assert.throws(
      () => buildSite(root, { build: () => true }),
      /must end with vite build/,
    );
  });
});

describe('overview page', () => {
  it('escapes text and falls back to a letter without an icon', () => {
    const html = renderOverview([
      { id: 'a', title: 'Ä<b>', language: 'de', href: '/a/' },
    ]);
    assert.match(html, /<html lang="de">/);
    assert.match(html, /Ä&lt;b&gt;/);
    assert.match(html, /<span class="letter" aria-hidden="true">Ä<\/span>/);
    assert.match(html, /:focus-visible/);
    assert.match(html, /color-scheme: light dark/);
  });
  it('has an empty state and a not-found page that links home', () => {
    assert.match(renderOverview([]), /No apps yet\./);
    assert.match(renderNotFound([]), /<a href="\/">All apps<\/a>/);
  });
});
