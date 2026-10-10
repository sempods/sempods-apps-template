import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { buildSite } from '../build-site.mjs';
import { configureSite } from '../configure-site.mjs';
import { renderNotFound, renderOverview } from '../lib/overview.mjs';
import { createApp } from '../new-app.mjs';
import { tempRepository } from './fixture.mjs';

describe('build-site', () => {
  let root;
  let builds;
  const read = (path) => readFileSync(join(root, 'site-dist', path), 'utf8');
  const exists = (path) => existsSync(join(root, 'site-dist', path));
  // Stands in for the app's `vite build`: what the PWA build would write.
  const build = (appDir, mode, outDir) => {
    builds.push([appDir.split(/[\\/]/).pop(), mode, outDir]);
    mkdirSync(outDir, { recursive: true });
    // Vite copies public/ into the output.
    cpSync(join(appDir, 'public'), outDir, { recursive: true });
    writeFileSync(
      join(outDir, 'index.html'),
      `<!doctype html><html><head><title>x</title></head><p>${mode}</p></html>`,
    );
    return true;
  };
  beforeEach(() => {
    builds = [];
    root = tempRepository('sempods-build-site-');
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
    const { apps, site } = buildSite(root, { profile: 'preview', build });
    assert.equal(site.preview, 'https://preview.apps.pages.dev');
    assert.deepEqual(
      apps.map((app) => app.id),
      ['konsum', 'notes'],
    );
    assert.deepEqual(
      builds,
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
      assert.equal(exists('_redirects'), false);
      assert.match(read('404.html'), /<h1>Page not found<\/h1>/);
      assert.equal(exists('_headers'), false);
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
    assert.equal(exists('konsum/callback.html'), false);
    assert.equal(exists('_headers'), false);
    assert.match(read('404.html'), /<h1>Page not found<\/h1>/);
  });

  it('lists every app on the overview from apps.json and its icon', () => {
    configureSite(root, { production: 'https://apps.example.org' });
    rmSync(join(root, 'apps', 'notes', 'public', 'icon-192.png'));
    buildSite(root, { build });
    const html = read('index.html');
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<a href="\/konsum\/" lang="de">/);
    assert.match(html, /<img src="\/konsum\/icon-192\.png" alt=""/);
    assert.match(html, /Einkauf/);
    // Without an icon, a letter stands in.
    assert.match(html, /<a href="\/notes\/" lang="en">/);
    assert.match(html, /<span class="letter" aria-hidden="true">N<\/span>/);
  });

  it('replaces a did.json the app ships with the site identity', () => {
    configureSite(root, { production: 'https://apps.example.org' });
    writeFileSync(join(root, 'apps', 'konsum', 'public', 'did.json'), '{');
    const { warnings } = buildSite(root, { build });
    assert.deepEqual(warnings, [
      'apps/konsum/public/did.json is not published: build-site reserves this path.',
    ]);
    assert.equal(
      JSON.parse(read('konsum/did.json')).id,
      'did:web:apps.example.org:konsum',
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

  it('needs the SDK licence', () => {
    configureSite(root, { production: 'https://apps.example.org' });
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
    writeFileSync(join(root, 'apps', 'konsum', 'public', 'callback'), 'own');
    const { warnings } = buildSite(root, { build });
    assert.deepEqual(warnings, [
      'apps/konsum/public/_redirects is not published: build-site reserves this path.',
      'apps/konsum/public/404.html is not published: build-site reserves this path.',
      'apps/konsum/public/callback is not published: build-site reserves this path.',
    ]);
    // Cloudflare Pages would otherwise serve the nested 404.html.
    assert.equal(exists('konsum/404.html'), false);
    assert.equal(exists('konsum/_redirects'), false);
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
    assert.match(html, /Ä&#60;b&#62;/);
    assert.match(html, /<span class="letter" aria-hidden="true">Ä<\/span>/);
    assert.match(html, /:focus-visible/);
    assert.match(html, /color-scheme: light dark/);
  });
  it('has an empty state and a not-found page that links home', () => {
    assert.match(renderOverview([]), /No apps yet\./);
    assert.match(renderNotFound([]), /<a href="\/">All apps<\/a>/);
  });
});
