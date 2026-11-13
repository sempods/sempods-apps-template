import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GROUP_FROM,
  renderMarkdown,
  renderNotFound,
  renderOverview,
  siteLanguages,
} from '../scripts/lib/overview.mjs';

// An overview entry as build-site makes it from an app's description.
const entry = (id, name, { lang = 'de', languages = [lang], ...rest } = {}) => ({
  id,
  href: `/${id}/`,
  lang,
  name: Object.fromEntries(languages.map((language) => [language, name])),
  languages,
  installable: false,
  ...rest,
});

const catalog = {
  lang: 'de',
  name: 'Danilos Apps',
  name_localized: { en: "Danilo's apps" },
  description: 'Kleine Apps.',
  description_localized: { en: 'Small apps.' },
  publisher: 'https://pod.example.org/profile/card#me',
};

describe('overview page', () => {
  it('escapes every text and falls back to a letter without an icon', () => {
    const html = renderOverview([
      entry('a', 'Ä<b>', { description: { de: '"x" & <y>' } }),
    ]);
    assert.match(html, /<html lang="de" data-languages="de">/);
    assert.match(html, /Ä&#60;b&#62;/);
    assert.match(html, /&#34;x&#34; &#38; &#60;y&#62;/);
    assert.doesNotMatch(html, /<b>|<y>/);
    assert.match(html, /<span class="icon letter" aria-hidden="true">Ä<\/span>/);
    assert.match(html, /:focus-visible/);
    assert.match(html, /color-scheme: light dark/);
    // The palette of the skeleton's default theme.
    assert.match(html, /--primary: light-dark\(/);
  });

  it('offers the catalog languages, the first without script', () => {
    const html = renderOverview(
      [entry('konsum', 'Konsum', { languages: ['de', 'en'] })],
      catalog,
    );
    assert.deepEqual(siteLanguages(catalog, []), ['de', 'en']);
    assert.match(html, /<html lang="de" data-languages="de en">/);
    assert.match(html, /<title>Danilos Apps<\/title>/);
    assert.match(html, /<span data-l="de" lang="de">Danilos Apps<\/span><span data-l="en" lang="en">Danilo&#39;s apps<\/span>/);
    assert.match(html, /<p data-l="en" lang="en">Small apps\.<\/p>/);
    // The switch appears only with script, which also picks the language.
    assert.match(html, /<nav class="switch" hidden aria-label="Sprache">/);
    assert.match(html, /<button type="button" data-set="en" lang="en" aria-pressed="false">English<\/button>/);
    assert.match(html, /navigator\.languages/);
    assert.match(html, /html\[lang="en"\] \[data-l\]:not\(\[data-l~="en"\]\) \{ display: none !important; \}/);
    assert.match(html, /<link rel="alternate" type="application\/ld\+json" href="\/apps\.jsonld" \/>/);
  });

  it("keeps an app's own language where it has no translation", () => {
    const html = renderOverview(
      [entry('konsum', 'Konsum', { description: { de: 'Was fehlt.' } })],
      catalog,
    );
    // One German text for both page languages, marked as German.
    assert.match(html, /<p class="summary" lang="de">Was fehlt\.<\/p>/);
  });

  it('takes one language without a catalog when all apps share it', () => {
    const html = renderOverview([entry('a', 'A'), entry('b', 'B')]);
    assert.match(html, /<html lang="de" data-languages="de">/);
    assert.doesNotMatch(html, /<script>|class="switch"/);
    assert.deepEqual(
      siteLanguages(undefined, [entry('a', 'A'), entry('b', 'B', { lang: 'en' })]),
      ['en', 'de'],
    );
    assert.deepEqual(
      siteLanguages(undefined, [entry('a', 'A', { languages: ['en', 'de'] })]),
      ['en', 'de'],
    );
  });

  it('links each card to its detail view and its app', () => {
    const html = renderOverview(
      [
        entry('konsum', 'Konsum', {
          icon: '/konsum/icon-192.png',
          categories: ['shopping', 'lifestyle'],
          installable: true,
          details: { de: '## Wofür\n\nFür [alle](https://example.org).\n' },
        }),
        entry('notes', 'Notes', { lang: 'en' }),
      ],
      catalog,
    );
    assert.match(html, /<h2><a href="#konsum">/);
    assert.match(html, /<a class="open" href="\/konsum\/">/);
    assert.match(html, /<img class="icon" src="\/konsum\/icon-192\.png" alt="" width="64" height="64" \/>/);
    const [cards, details] = html.split('<article class="detail" id="konsum">');
    assert.ok(details);
    // The first category on the card, all of them in the detail view.
    assert.match(cards, />Einkaufen</);
    assert.doesNotMatch(cards, />Lifestyle</);
    assert.match(details, />Einkaufen<[\s\S]*>Lifestyle</);
    assert.match(html, /<h2>Wofür<\/h2>\n<p>Für <a href="https:\/\/example\.org">alle<\/a>\.<\/p>/);
    assert.match(html, /<a href="https:\/\/pod\.example\.org\/profile\/card#me">/);
    // The install hint only for an app that can be installed.
    assert.equal(html.match(/<section class="install">/g).length, 1);
    assert.match(cards, /<p class="note" data-l="de" lang="de">Installierbar<\/p>/);
    assert.equal(cards.split('<li class="card">')[2].includes('class="note"'), false);
  });

  it('renders Markdown without raw HTML or unsafe links', () => {
    const html = renderMarkdown('<script>x</script>\n\n[a](javascript:alert(1)) <b>b</b>\n');
    assert.doesNotMatch(html, /<script>|<b>|javascript:/);
    assert.match(html, /&lt;script&gt;/);
  });

  it(`groups by first category from ${GROUP_FROM} apps`, () => {
    const many = Array.from({ length: GROUP_FROM }, (_, i) =>
      entry(`app-${i}`, `App ${i}`, i === 0 ? {} : { categories: [i % 2 ? 'games' : 'shopping'] }),
    );
    const html = renderOverview(many);
    const groups = [...html.matchAll(/<h2>(.*?)<\/h2>/g)].map(([, name]) => name.replace(/<[^>]+>/g, ''));
    assert.deepEqual(groups.slice(0, 3), ['Spiele', 'Einkaufen', 'Weitere Apps']);
    assert.match(html, /<h3><a href="#app-1">/);
    // Fewer apps, or all in one group: one list without headings.
    assert.doesNotMatch(renderOverview(many.slice(1, GROUP_FROM)), /<h2>[^<]*<span/);
    assert.match(renderOverview(many.slice(1, GROUP_FROM)), /<h2><a href="#app-1">/);
  });

  it('has an empty state and a not-found page that links home', () => {
    assert.match(renderOverview([]), /No apps yet\./);
    const missing = renderNotFound([entry('a', 'A')], catalog);
    assert.match(missing, /<title>Seite nicht gefunden<\/title>/);
    assert.match(missing, /<a href="\/"><span data-l="de" lang="de">Alle Apps<\/span><span data-l="en" lang="en">All apps<\/span><\/a>/);
  });
});
