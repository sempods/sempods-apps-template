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
import { CLIENT_LIMIT, manifestAddresses } from '../scripts/lib/published.mjs';
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
    assert.match(read('404.html'), /<h1><span data-l="en" lang="en">Page not found<\/span>/);
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
      token_endpoint_auth_methods_supported: ['none'],
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
    const withManifest = (fields) => (appDir, mode, outDir) => {
      build(appDir, mode, outDir);
      if (existsSync(join(outDir, 'manifest.webmanifest')))
        writeFileSync(
          join(outDir, 'manifest.webmanifest'),
          JSON.stringify({ id: './', start_url: './', scope: './', ...fields }),
        );
      return true;
    };
    const differs = (key, actual) =>
      new RegExp(
        `apps/konsum: manifest\\.webmanifest ${key} is ${actual}, not "https://apps\\.example\\.org/konsum/"`,
      );
    assert.throws(
      () => buildSite(root, { build: withManifest({ id: '/other/' }) }),
      differs('id', '"https://apps\\.example\\.org/other/"'),
    );
    // The id resolves against the start URL's origin, not the manifest's
    // address: "./" names the site root, which every app would share.
    assert.throws(
      () => buildSite(root, { build: withManifest({ id: './' }) }),
      differs('id', '"https://apps\\.example\\.org/"'),
    );
    // Without a start URL, the browser starts at whichever page linked the
    // manifest.
    assert.throws(
      () => buildSite(root, { build: withManifest({ id: 'konsum/', start_url: '' }) }),
      differs('start_url', '""'),
    );
    // "konsum/" is the app, although it reads like a relative path. An empty
    // id falls back to the start URL, an empty scope to its directory.
    for (const fields of [{ id: 'konsum/' }, { id: '' }, { id: '', scope: '' }])
      buildSite(root, { build: withManifest(fields) });
  });

  it('reads the addresses of a manifest as a browser does', () => {
    const at = 'https://apps.example.org/konsum/manifest.webmanifest';
    const app = 'https://apps.example.org/konsum/';
    const read = (fields) => manifestAddresses({ start_url: './', ...fields }, at);
    assert.deepEqual(read({ id: 'konsum/#a', scope: '.?x#y' }), {
      id: app,
      start_url: app,
      scope: app,
    });
    // An id that is unset, empty, no string, invalid or of another origin
    // is the start URL.
    for (const id of [undefined, '', 7, 'https://other.example/', 'http://[x'])
      assert.equal(read({ id }).id, app, String(id));
    // A scope that is unset, empty, no string, invalid or does not contain
    // the start URL is the start URL's directory.
    for (const scope of [undefined, '', 1, 'http://[x', '/other/'])
      assert.equal(read({ scope, start_url: 'start.html?a' }).scope, app, String(scope));
    // Without a usable start URL, the addresses depend on the linking page.
    for (const start_url of [undefined, '', 'https://other.example/'])
      assert.deepEqual(read({ id: 'konsum/', start_url }), { start_url });
  });

  it('keeps client.json within the read limit as it is written', () => {
    configureSite(root, { production: 'https://apps.example.org' });
    const named = (name) => {
      writeFileSync(
        join(root, 'apps', 'konsum', 'app.json'),
        JSON.stringify({ lang: 'de', name, description: 'Was fehlt.' }),
      );
      regenerate(root);
    };
    named('E');
    buildSite(root, { build });
    const written = Buffer.byteLength(read('konsum/client.json'));
    // A name that fills the limit exactly, as written with its indentation.
    const name = 'E'.repeat(1 + CLIENT_LIMIT - written);
    named(name);
    buildSite(root, { build });
    assert.equal(Buffer.byteLength(read('konsum/client.json')), CLIENT_LIMIT);
    // The compact form of one byte more would still fit.
    named(`${name}E`);
    assert.ok(
      Buffer.byteLength(JSON.stringify(JSON.parse(read('konsum/client.json')))) + 1 <=
        CLIENT_LIMIT,
    );
    assert.throws(
      () => buildSite(root, { build }),
      /apps\/konsum: client\.json is larger than 5000 bytes; shorten the app's names/,
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

  it('shows every app on the overview as its description has it', () => {
    configureSite(root, { production: 'https://apps.example.org' });
    rmSync(join(root, 'apps', 'notes', 'public', 'icon-192.png'));
    writeFileSync(join(root, 'apps', 'konsum', 'details.md'), '## Wofür\n\nFür alle.\n');
    buildSite(root, { build });
    const html = read('index.html');
    // The apps are shown in German and English, English first.
    assert.match(html, /<html lang="en" data-languages="en de">/);
    assert.match(html, /<a class="launch" href="\/konsum\/" target="_blank" rel="noopener noreferrer">/);
    assert.match(html, /<h2><span lang="de">Einkauf<\/span><\/h2>/);
    assert.match(html, /<img class="icon" src="\/konsum\/icon-192\.png" alt=""/);
    assert.match(html, /<a class="open" href="\/konsum\/" target="_blank" rel="noopener noreferrer">/);
    assert.match(html, /<article class="detail" id="konsum">/);
    assert.match(html, /<div class="text" lang="de"><h2>Wofür<\/h2>/);
    // Only a PWA can be installed.
    assert.match(html, /<article class="detail" id="konsum">[\s\S]*<details class="install">[\s\S]*<article class="detail" id="notes">/);
    assert.doesNotMatch(html.split('<article class="detail" id="notes">')[1], /class="install"/);
    // Without an icon, a letter stands in.
    assert.match(html, /<span class="icon letter" aria-hidden="true">N<\/span>/);
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
