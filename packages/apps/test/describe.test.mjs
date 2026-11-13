import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { readApps, validateApps, validateCatalog } from '../scripts/lib/apps.mjs';
import {
  adoptDescriptions,
  describedApp,
  validateDescription,
} from '../scripts/lib/describe.mjs';
import { readJson, writeJson } from '../scripts/lib/json.mjs';
import { markdownProblems, textCompleteness } from '../scripts/lib/texts.mjs';
import { staticProblems } from '../scripts/check.mjs';
import { createApp } from '../scripts/new-app.mjs';
import { regenerate } from '../scripts/regenerate.mjs';
import { tempRepository } from './fixture.mjs';

const entry = {
  id: 'konsum',
  language: 'de',
  path: '/konsum/',
  devPort: 5174,
  pwa: true,
};

describe('apps.json schema 2', () => {
  it('keeps titles and descriptions out of apps.json', () => {
    const problems = validateApps({
      schemaVersion: 2,
      apps: [{ ...entry, title: 'Konsum', description: 'Einkaufen.' }],
    });
    assert.match(problems.join(), /title belongs in apps\/konsum\/app\.json/);
    assert.match(problems.join(), /description belongs in apps\/konsum\/app\.json/);
  });
  it('asks for migrate on a schema 1 apps.json', () => {
    const root = tempRepository('sempods-schema-');
    try {
      writeJson(join(root, 'apps.json'), { schemaVersion: 1, apps: [] });
      assert.throws(() => readApps(root), /schemaVersion 1; run pnpm run migrate/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('accepts a catalog with translations and a publisher', () => {
    assert.deepEqual(
      validateCatalog({
        lang: 'de',
        name: 'Danilos Apps',
        description: 'Kleine Apps für den Alltag.',
        name_localized: { en: "Danilo's apps" },
        description_localized: { en: 'Small everyday apps.' },
        publisher: 'https://pod.example.org/profile/card#me',
      }),
      [],
    );
    const problems = validateCatalog({
      lang: 'fr',
      description: 'x'.repeat(121),
      name_localized: { de: 'Apps', es: 'Apps' },
      publisher: 'http://pod.example.org/me',
      theme: 'warm',
    }).join('\n');
    assert.match(problems, /catalog\.theme is not a known field/);
    assert.match(problems, /catalog\.lang must be one of en, de/);
    assert.match(problems, /catalog\.name is required/);
    assert.match(problems, /catalog\.description: .*at most 120 characters/);
    assert.match(problems, /name_localized\.es: the language must be one of/);
    assert.match(problems, /catalog\.publisher must be an HTTPS URL/);
  });
});

describe('app.json', () => {
  it('accepts manifest fields with translations and categories', () => {
    assert.deepEqual(
      validateDescription({
        lang: 'de',
        name: 'Konsum',
        short_name: 'Konsum',
        description: 'Was im Haushalt fehlt, für alle.',
        categories: ['shopping', 'lifestyle'],
        name_localized: { en: 'Konsum' },
        description_localized: { en: 'What the household needs.' },
      }),
      [],
    );
  });
  it('reports unknown fields, languages and categories', () => {
    const problems = validateDescription({
      lang: 'de',
      name: ' ',
      title: 'Konsum',
      description_localized: { de: 'Doppelt.' },
      categories: ['shopping', 'shopping', 'cooking'],
    }).join('\n');
    assert.match(problems, /title is not a known field/);
    assert.match(problems, /name: a name must be text/);
    assert.match(problems, /description_localized\.de repeats the base language/);
    assert.match(problems, /shopping is listed twice/);
    assert.match(problems, /"cooking" is not a known category/);
    assert.match(validateDescription([]).join(), /must be an object/);
  });
});

describe('texts of an app', () => {
  let root;
  const dir = () => join(root, 'apps', 'konsum');
  const write = (file, text) => writeFileSync(join(dir(), file), text);
  const describeAs = (value) => writeJson(join(dir(), 'app.json'), value);
  beforeEach(() => {
    root = tempRepository('sempods-texts-');
    createApp(root, {
      id: 'konsum',
      title: 'Konsum',
      description: 'Was im Haushalt fehlt.',
      language: 'auto',
      textLanguage: 'de',
    });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const app = () => readApps(root).apps[0];

  it("gives the manifest the owner's short names, else the name's", () => {
    const shortNames = (value) => {
      describeAs({ lang: 'en', name: 'Tasks', ...value });
      return describedApp(root, app()).about.short_name_localized;
    };
    assert.deepEqual(
      shortNames({
        name_localized: { de: 'Aufgabenliste' },
        short_name_localized: { de: 'Aufgaben' },
      }),
      { de: 'Aufgaben' },
    );
    assert.deepEqual(shortNames({ name_localized: { de: 'Aufgabenliste' } }), {
      de: 'Aufgabenliste',
    });
    assert.deepEqual(shortNames({ short_name_localized: { de: 'Aufgaben' } }), {
      de: 'Aufgaben',
    });
    // A short name of its own keeps its translations to itself.
    assert.equal(
      shortNames({ short_name: 'Tasks', name_localized: { de: 'Aufgabenliste' } }),
      undefined,
    );
  });

  it('needs the description in every language the app is shown in', () => {
    assert.deepEqual(textCompleteness(root, app()), [
      'apps/konsum/app.json: description_localized.en is missing; the app is also shown in en',
    ]);
    assert.match(staticProblems(root).join(), /description_localized\.en/);
    describeAs({
      ...readJson(join(dir(), 'app.json')),
      description_localized: { en: 'What the household needs.' },
    });
    assert.deepEqual(textCompleteness(root, app()), []);
    // The installed app's manifest carries the translation too.
    assert.match(staticProblems(root).join(), /does not match apps\.json, apps\/konsum\/app\.json/);
    regenerate(root);
    assert.deepEqual(staticProblems(root), []);
  });
  it('needs texts in a language the app is shown in', () => {
    const manifest = readApps(root);
    manifest.apps[0].language = 'en';
    writeJson(join(root, 'apps.json'), manifest);
    assert.match(
      textCompleteness(root, readApps(root).apps[0]).join(),
      /lang is de, but the app is shown in en/,
    );
  });
  it('needs a detail text for every language once there is one', () => {
    describeAs({ lang: 'de', name: 'Konsum' });
    write('details.md', '## Wofür\n\nEinkaufen.\n');
    assert.deepEqual(textCompleteness(root, app()), [
      'apps/konsum/details.en.md is missing; a detail text exists, so every language the app is shown in needs one',
    ]);
    write('details.en.md', '## What for\n\nShopping.\n');
    write('details.de.md', '## Doppelt\n');
    write('details.fr.md', '## Non\n');
    const problems = textCompleteness(root, app()).join('\n');
    assert.match(problems, /details\.de\.md: details\.md holds the text in de/);
    assert.match(problems, /details\.fr\.md: the app is not shown in fr/);
  });
  it('keeps detail texts to Markdown every reader can show', () => {
    const problems = (text) =>
      markdownProblems(text, { path: '/konsum/' }, 'details.md').join('\n');
    assert.equal(
      problems(
        '## Wofür\n\nSiehe [die Seite](https://example.org) und ![Bild](/konsum/shot.png).\n\n[ref]: https://example.org/a\n',
      ),
      '',
    );
    assert.match(problems('# Konsum\n'), /details\.md:1: headings start at level 2/);
    assert.match(problems('Text <b>fett</b>\n'), /raw HTML is not allowed/);
    assert.match(problems('<div>\nx\n</div>\n'), /raw HTML is not allowed/);
    assert.match(problems('[x](http://example.org)\n'), /https:\/\/ addresses/);
    assert.match(problems('[x](javascript:alert(1))\n'), /https:\/\/ addresses/);
    assert.match(problems('![x](https://example.org/a.png)\n'), /images must come from below \/konsum\//);
    assert.match(problems('![x](/other/a.png)\n'), /images must come from below/);
    assert.match(
      problems('![x][shot]\n\n[shot]: https://example.org/a.png\n'),
      /details\.md:1: images must come from below/,
    );
    assert.equal(problems('[x][1]\n\n[1]: https://example.org\n'), '');
    // The first definition of a label counts, as when the text is rendered.
    assert.match(
      problems('![x][shot]\n\n[shot]: https://example.org/a.png\n[shot]: /konsum/a.png\n'),
      /images must come from below/,
    );
    assert.equal(
      problems('![x][shot]\n\n[shot]: /konsum/a.png\n[Shot]: https://example.org/a.png\n'),
      '',
    );
    // Image paths count where a browser resolves them.
    for (const path of [
      '/konsum/../other/a.png',
      '/konsum/%2e%2e/other/a.png',
      '/konsum/.%2E/other/a.png',
      '/konsum\\..\\other/a.png',
      '/konsum/..%2fother/a.png',
      '//example.org/konsum/a.png',
      '/\\example.org/konsum/a.png',
      'konsum/a.png',
      '/konsum/',
    ])
      assert.match(problems(`![x](${path})\n`), /images must come from below/, path);
    assert.equal(problems('![x](/konsum/img/%2e/a%20b.png)\n'), '');
    assert.match(problems('x'.repeat(16 * 1024 + 1)), /larger than 16 KB/);
  });
});

describe('moving descriptions out of apps.json', () => {
  let root;
  beforeEach(() => {
    root = tempRepository('sempods-adopt-');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const legacy = (apps, extra = {}) =>
    writeJson(join(root, 'apps.json'), { schemaVersion: 1, apps, ...extra });

  it('writes app.json from title and description and raises the schema', () => {
    for (const id of ['konsum', 'notes', 'gone-later'])
      mkdirSync(join(root, 'apps', id), { recursive: true });
    rmSync(join(root, 'apps', 'gone-later'), { recursive: true });
    legacy(
      [
        { ...entry, title: ' Einkauf ', description: 'Was fehlt.' },
        {
          ...entry,
          id: 'notes',
          path: '/notes/',
          devPort: 5175,
          language: 'auto',
          title: 'Notes',
        },
        { ...entry, id: 'gone-later', path: '/gone-later/', title: 'Gone' },
      ],
      { note: 'owner' },
    );
    const { changed, notes } = adoptDescriptions(root);
    assert.deepEqual(changed, [
      'apps/konsum/app.json',
      'apps/notes/app.json',
      'apps.json',
    ]);
    assert.match(notes.join('\n'), /notes\/app\.json: the app follows the browser's language/);
    assert.match(notes.join('\n'), /apps\/gone-later is missing/);
    assert.deepEqual(readJson(join(root, 'apps', 'konsum', 'app.json')), {
      lang: 'de',
      name: 'Einkauf',
      description: 'Was fehlt.',
    });
    assert.deepEqual(readJson(join(root, 'apps', 'notes', 'app.json')), {
      lang: 'en',
      name: 'Notes',
    });
    const manifest = readJson(join(root, 'apps.json'));
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.note, 'owner');
    assert.deepEqual(manifest.apps.map((app) => app.id), ['konsum', 'notes', 'gone-later']);
    assert.ok(manifest.apps.every((app) => !('title' in app)));
    assert.equal(describedApp(root, manifest.apps[0]).title, 'Einkauf');
    // A second run finds schema 2 and changes nothing.
    assert.deepEqual(adoptDescriptions(root), { changed: [], notes: [] });
  });
  it('keeps an app.json that already holds the same texts', () => {
    mkdirSync(join(root, 'apps', 'konsum'), { recursive: true });
    const own = { lang: 'de', name: 'Einkauf', categories: ['shopping'] };
    writeJson(join(root, 'apps', 'konsum', 'app.json'), own);
    legacy([{ ...entry, title: ' Einkauf ' }]);
    assert.deepEqual(adoptDescriptions(root), { changed: ['apps.json'], notes: [] });
    assert.deepEqual(readJson(join(root, 'apps', 'konsum', 'app.json')), own);
    assert.equal(readJson(join(root, 'apps.json')).schemaVersion, 2);
  });
  it('changes nothing while an existing app.json would lose a text', () => {
    const file = join(root, 'apps', 'konsum', 'app.json');
    const cases = [
      [() => writeJson(file, { settings: { sort: 'name' } }), /is not an app description/],
      [() => mkdirSync(file), /is not a JSON file/],
      [() => writeFileSync(file, '{'), /is not a JSON file/],
      [() => writeJson(file, { lang: 'de', name: 'Eigen', description: 'Was fehlt.' }), /another title than apps\.json/],
      [
        () => writeJson(file, { lang: 'de', name: 'Einkauf' }),
        /another description than apps\.json/,
      ],
    ];
    for (const [existing, reason] of cases) {
      rmSync(join(root, 'apps'), { recursive: true, force: true });
      mkdirSync(join(root, 'apps', 'konsum'), { recursive: true });
      existing();
      legacy([{ ...entry, title: 'Einkauf', description: 'Was fehlt.' }]);
      const before = readFileSync(join(root, 'apps.json'), 'utf8');
      assert.throws(() => adoptDescriptions(root), reason);
      assert.throws(() => adoptDescriptions(root), /apps\.json was not changed/);
      assert.equal(readFileSync(join(root, 'apps.json'), 'utf8'), before);
    }
  });
});
