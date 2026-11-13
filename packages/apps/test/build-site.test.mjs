import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
import { buildSite } from '../scripts/build-site.mjs';
import { configureSite } from '../scripts/configure-site.mjs';
import { renderNotFound, renderOverview } from '../scripts/lib/overview.mjs';
import { createApp } from '../scripts/new-app.mjs';
import { regenerate } from '../scripts/regenerate.mjs';
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
    // The PWA plugin writes the manifest from the generated configuration.
    const vite = readFileSync(join(appDir, 'vite.sempods.generated.ts'), 'utf8');
    const scope = vite.match(/^  scope: (".*"),$/m)?.[1];
    if (scope)
      writeFileSync(
        join(outDir, 'manifest.webmanifest'),
        JSON.stringify({ id: JSON.parse(scope), start_url: JSON.parse(scope), scope: JSON.parse(scope) }),
      );
    return true;
  };
  beforeEach(() => {
    builds = [];
    root = tempRepository('sempods-build-site-');
    createApp(root, { id: 'konsum', title: 'Einkauf', language: 'de' });
    createApp(root, { id: 'notes', title: 'Notes', language: 'en', pwa: false });
    // The SDK's notices, as the installed package ships them.
    for (const name of ['app-sdk', 'client-sdk', 'app-ui']) {
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
    for (const name of ['app-sdk', 'client-sdk', 'app-ui'])
      for (const file of ['LICENSE', 'NOTICE'])
        assert.equal(
          read(`notes/licenses/${name}/${file}`),
          `${name} ${file === 'LICENSE' ? 'licence' : 'notice'}\n`,
        );
    // Only the packages an app declares: an app without the UI kit.
    const pkg = join(root, 'apps', 'notes', 'package.json');
    const manifest = JSON.parse(readFileSync(pkg, 'utf8'));
    delete manifest.dependencies['@sempods/app-ui'];
    writeFileSync(pkg, JSON.stringify(manifest));
    buildSite(root, { profile: 'preview', build });
    assert.equal(exists('notes/licenses/app-ui'), false);
    assert.equal(exists('konsum/licenses/app-ui/LICENSE'), true);
    // The local build stays where vite preview serves it.
    assert.equal(existsSync(join(root, 'apps', 'konsum', 'dist')), false);
  });

  it('serves each callback from a file at its path, without rewrites', () => {
    configureSite(root, { production: 'https://apps.example.org' });
    buildSite(root, { build });
    assert.equal(read('konsum/callback.html'), read('konsum/index.html'));
    assert.equal(exists('_redirects'), false);
    assert.match(read('404.html'), /<h1>Page not found<\/h1>/);
    // The only headers: the descriptions may be read from any origin.
    assert.equal(
      read('_headers').replace(/^#.*\n/gm, ''),
      '/apps.jsonld\n  Access-Control-Allow-Origin: *\n/konsum/app.jsonld\n  Access-Control-Allow-Origin: *\n/notes/app.jsonld\n  Access-Control-Allow-Origin: *\n',
    );
  });

  it("publishes each app's descriptions under its IRI", () => {
    configureSite(root, { production: 'https://apps.example.org' });
    const file = join(root, 'apps.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    manifest.catalog = {
      lang: 'de',
      name: 'Danilos Apps',
      name_localized: { en: "Danilo's apps" },
      publisher: 'https://pod.example.org/profile/card#me',
    };
    writeFileSync(file, JSON.stringify(manifest));
    const konsum = join(root, 'apps', 'konsum');
    writeFileSync(
      join(konsum, 'app.json'),
      JSON.stringify({
        lang: 'de',
        name: 'Einkauf',
        description: 'Was fehlt.',
        categories: ['shopping'],
      }),
    );
    writeFileSync(join(konsum, 'details.md'), '## Wofür\n\nFür alle.\n');
    regenerate(root);
    buildSite(root, { build });
    const json = (path) => JSON.parse(read(path));
    const iri = 'https://apps.example.org/konsum/';
    const description = json('konsum/app.jsonld');
    assert.deepEqual(description, {
      '@context': [
        'https://schema.org/',
        {
          name: { '@container': '@language' },
          description: { '@container': '@language' },
        },
      ],
      '@id': iri,
      '@type': 'WebApplication',
      name: { de: 'Einkauf' },
      description: { de: 'Was fehlt.' },
      subjectOf: [
        {
          '@type': 'TextObject',
          inLanguage: 'de',
          encodingFormat: 'text/markdown',
          text: '## Wofür\n\nFür alle.\n',
        },
      ],
      applicationCategory: ['shopping'],
      inLanguage: ['de'],
      url: iri,
      image: `${iri}icon-512.png`,
      isPartOf: { '@id': 'https://apps.example.org/' },
      publisher: { '@id': 'https://pod.example.org/profile/card#me' },
      identifier: [
        'did:web:apps.example.org:konsum',
        `${iri}client.json`,
      ],
    });
    assert.deepEqual(json('konsum/client.json'), {
      client_id: `${iri}client.json`,
      client_name: 'Einkauf',
      client_uri: iri,
      logo_uri: `${iri}icon-512.png`,
      redirect_uris: [`${iri}callback`],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
    });
    const catalog = json('apps.jsonld');
    assert.equal(catalog['@id'], 'https://apps.example.org/');
    assert.deepEqual(catalog.name, { de: 'Danilos Apps', en: "Danilo's apps" });
    assert.deepEqual(
      catalog.itemListElement.map(({ position, item }) => [position, item['@id'], item.name]),
      [
        [1, iri, { de: 'Einkauf' }],
        [2, 'https://apps.example.org/notes/', { en: 'Notes' }],
      ],
    );
    assert.equal('subjectOf' in catalog.itemListElement[0].item, false);
    assert.match(read('index.html'), /<link rel="alternate" type="application\/ld\+json" href="\/apps\.jsonld" \/>/);
  });

  it('lists every published file of an app with its digest', () => {
    configureSite(root, { production: 'https://apps.example.org' });
    buildSite(root, { build });
    const { files } = JSON.parse(read('konsum/build.json'));
    const paths = files.map((entry) => entry.path);
    assert.deepEqual(paths, [...paths].sort());
    for (const path of [
      '/konsum/index.html',
      '/konsum/callback.html',
      '/konsum/app.jsonld',
      '/konsum/client.json',
      '/konsum/did.json',
      '/konsum/manifest.webmanifest',
      '/konsum/icon-maskable-512.png',
    ])
      assert.ok(paths.includes(path), path);
    assert.equal(paths.includes('/konsum/build.json'), false);
    for (const { path, sha256 } of files)
      assert.equal(
        createHash('sha256').update(readFileSync(join(root, 'site-dist', path))).digest('hex'),
        sha256,
        path,
      );
  });

  it("refuses an app whose documents name it differently", () => {
    configureSite(root, { production: 'https://apps.example.org' });
    const other = (appDir, mode, outDir) => {
      build(appDir, mode, outDir);
      if (existsSync(join(outDir, 'manifest.webmanifest')))
        writeFileSync(
          join(outDir, 'manifest.webmanifest'),
          JSON.stringify({ id: '/other/', start_url: '/konsum/', scope: '/konsum/' }),
        );
      return true;
    };
    assert.throws(
      () => buildSite(root, { build: other }),
      /apps\/konsum: manifest\.webmanifest id is "https:\/\/apps\.example\.org\/other\/", not "https:\/\/apps\.example\.org\/konsum\/"/,
    );
  });

  it('refuses texts a reader would miss', () => {
    configureSite(root, { production: 'https://apps.example.org' });
    const file = join(root, 'apps.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    manifest.apps[0].language = 'auto';
    writeFileSync(file, JSON.stringify(manifest));
    writeFileSync(
      join(root, 'apps', 'konsum', 'app.json'),
      JSON.stringify({ lang: 'de', name: 'Einkauf', description: 'Was fehlt.' }),
    );
    regenerate(root);
    assert.throws(
      () => buildSite(root, { build }),
      /description_localized\.en is missing[\s\S]*pnpm run check/,
    );
    assert.equal(builds.length, 0);
  });

  it('serves each route from a file at its path, without rewrites', () => {
    const file = join(root, 'apps.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    manifest.apps[0].routes = ['open', 'bought', 'tasks/add'];
    writeFileSync(file, JSON.stringify(manifest));
    regenerate(root);
    configureSite(root, { production: 'https://apps.example.org' });
    buildSite(root, { build });
    for (const route of ['open', 'bought', 'tasks/add'])
      assert.equal(read(`konsum/${route}.html`), read('konsum/index.html'));
    assert.equal(exists('notes/open.html'), false);
    // Literal routes need no rewrite.
    assert.equal(exists('_redirects'), false);
    // A file of the app at a route's path would answer instead of the page.
    mkdirSync(join(root, 'apps', 'konsum', 'public', 'bought'));
    assert.throws(
      () => buildSite(root, { build }),
      /route bought collides with bought/,
    );
  });

  it('rewrites exactly the resource addresses to the app page', () => {
    const file = join(root, 'apps.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    manifest.apps[0].routes = ['tasks/add'];
    manifest.apps[0].resources = ['tasks/:id', 'tasks/:id/postpone'];
    manifest.apps[1].resources = ['pages/:page'];
    writeFileSync(file, JSON.stringify(manifest));
    regenerate(root);
    configureSite(root, { production: 'https://apps.example.org' });
    const { rewrites } = buildSite(root, { build });
    const lines = [
      '/konsum/tasks/:id /konsum/index.html 200',
      '/konsum/tasks/:id/postpone /konsum/index.html 200',
      '/notes/pages/:page /notes/index.html 200',
    ];
    assert.deepEqual(rewrites, lines);
    assert.deepEqual(
      read('_redirects')
        .split('\n')
        .filter((line) => line && !line.startsWith('#')),
      lines,
    );
    // The literal route keeps its file, which the host serves first.
    assert.equal(read('konsum/tasks/add.html'), read('konsum/index.html'));
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
      /apps\/konsum\/src\/sempods\.generated\.ts does not match apps\.json, apps\/konsum\/app\.json or the app's theme; run pnpm run regenerate/,
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
    // Even a directory there gives way to the callback shell.
    mkdirSync(join(root, 'apps', 'konsum', 'public', 'callback.html'));
    writeFileSync(
      join(root, 'apps', 'konsum', 'public', 'callback.html', 'x'),
      'own',
    );
    const { warnings } = buildSite(root, { build });
    assert.deepEqual(warnings, [
      'apps/konsum/public/_redirects is not published: build-site reserves this path.',
      'apps/konsum/public/404.html is not published: build-site reserves this path.',
      'apps/konsum/public/callback is not published: build-site reserves this path.',
      'apps/konsum/public/callback.html is not published: build-site reserves this path.',
    ]);
    assert.equal(read('konsum/callback.html'), read('konsum/index.html'));
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
  it('announces no language for an app that follows the browser', () => {
    const html = renderOverview([
      { id: 'a', title: 'A', href: '/a/' },
      { id: 'b', title: 'B', language: 'de', href: '/b/' },
    ]);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<a href="\/a\/">/);
    assert.match(html, /<a href="\/b\/" lang="de">/);
  });
  it('has an empty state and a not-found page that links home', () => {
    assert.match(renderOverview([]), /No apps yet\./);
    assert.match(renderNotFound([]), /<a href="\/">All apps<\/a>/);
  });
});
