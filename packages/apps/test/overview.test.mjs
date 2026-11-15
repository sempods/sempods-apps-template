import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  renderMarkdown,
  renderNotFound,
  renderOverview,
  SITE_THEME,
  siteLanguages,
} from '../scripts/lib/overview.mjs';
import { SKELETON } from '../scripts/lib/paths.mjs';
import { themeCss, themeNames, tokenColours } from '../scripts/lib/themes.mjs';

/** A role's light and dark colour, following `--role: var(--other)`. */
function role(css, name) {
  const alias = css.match(new RegExp(`--${name}:\\s*var\\(--([a-z-]+)\\)`));
  return alias ? role(css, alias[1]) : tokenColours(css, name);
}

/** The WCAG contrast ratio of two #rrggbb colours. */
function contrast(a, b) {
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

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
    // Neither script nor switch, in any spelling.
    assert.doesNotMatch(html, /<script\b|class="switch"/i);
    assert.deepEqual(
      siteLanguages(undefined, [entry('a', 'A'), entry('b', 'B', { lang: 'en' })]),
      ['en', 'de'],
    );
    assert.deepEqual(
      siteLanguages(undefined, [entry('a', 'A', { languages: ['en', 'de'] })]),
      ['en', 'de'],
    );
  });

  it('opens apps directly and keeps metadata in the secondary detail view', () => {
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
    assert.match(html, /<a class="launch" href="\/konsum\/" target="_blank" rel="noopener noreferrer">/);
    assert.match(html, /<a class="details-link" href="#konsum">/);
    assert.match(html, /<a class="open" href="\/konsum\/" target="_blank" rel="noopener noreferrer">/);
    assert.match(html, /<a class="open primary" href="\/konsum\/" target="_blank" rel="noopener noreferrer">/);
    assert.match(html, /<img class="icon" src="\/konsum\/icon-192\.png" alt="" width="52" height="52" \/>/);
    const [list, details] = html.split('<article class="detail" id="konsum">');
    assert.ok(details);
    // The list is for launching; metadata stays in the detail view.
    assert.doesNotMatch(list, />Einkaufen<|>Lifestyle<|Installierbar/);
    assert.match(details, />Einkaufen<[\s\S]*>Lifestyle</);
    assert.match(html, /<h2>Wofür<\/h2>\n<p>Für <a href="https:\/\/example\.org">alle<\/a>\.<\/p>/);
    assert.match(html, /<a href="https:\/\/pod\.example\.org\/profile\/card#me">/);
    // The install hint only for an app that can be installed.
    assert.equal(html.match(/<details class="install">/g).length, 1);
    assert.match(details, /<summary><span data-l="de" lang="de">Auf dem Gerät installieren<\/span>/);
    assert.doesNotMatch(html, /<details class="install" open/);
    assert.match(html, /Apps öffnen in einem neuen Tab\./);
    // Link names say so too, and name the app on the detail view's action.
    assert.match(html, /<span class="vh"> <span data-l="de" lang="de">\(öffnet in einem neuen Tab\)<\/span>/);
    assert.match(details, /<span data-l="de" lang="de">Konsum öffnen<\/span><span data-l="en" lang="en">Open Konsum<\/span>/);
  });

  it("takes its one colour from the site theme's palette", () => {
    const html = renderOverview([entry('a', 'A')]);
    assert.equal(SITE_THEME, 'fresh');
    // The fresh theme's checked roles, with no separate band palette.
    assert.match(html, /--primary: light-dark\(#0a6680, #5ec6e4\);/);
    assert.match(html, /<header class="bar">/);
    assert.match(html, /<li class="app-row">/);
  });

  it("uses the catalog's theme on the overview and the not-found page", () => {
    const themed = { ...catalog, theme: 'warm' };
    for (const html of [
      renderOverview([entry('a', 'A')], themed),
      renderNotFound([entry('a', 'A')], themed),
    ]) {
      assert.match(html, /--primary: light-dark\(#9c4128, #f0a184/);
      assert.doesNotMatch(html, /#0a6680/);
    }
  });

  it("keeps the overview's text readable in every theme a catalog can pick", () => {
    // Text pairs the overview uses beyond those check:theme covers in an app.
    const pairs = [
      ['foreground', 'muted'],
      ['muted-foreground', 'muted'],
      ['muted-foreground', 'card'],
      ['muted-foreground', 'secondary'],
      ['secondary-foreground', 'secondary'],
      ['primary', 'card'],
      ['primary', 'muted'],
      ['primary', 'accent'],
      ['primary-foreground', 'primary'],
    ];
    for (const theme of themeNames(SKELETON)) {
      const css = themeCss(SKELETON, theme);
      for (const [text, surface] of pairs)
        for (const scheme of ['light', 'dark']) {
          const ratio = contrast(role(css, text)[scheme], role(css, surface)[scheme]);
          assert.ok(ratio >= 4.5, `${theme} ${scheme}: ${text} on ${surface} is ${ratio.toFixed(2)}:1`);
        }
    }
  });

  it('renders Markdown without raw HTML or unsafe links', () => {
    const html = renderMarkdown('<script>x</script>\n\n[a](javascript:alert(1)) <b>b</b>\n');
    assert.doesNotMatch(html, /<script\b|<b\b|javascript:/i);
    assert.match(html, /&lt;script&gt;/);
  });

  it('keeps the owner order as the list grows, regardless of categories', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      entry(`app-${i}`, `App ${i}`, i === 0 ? {} : { categories: [i % 2 ? 'games' : 'shopping'] }),
    );
    const html = renderOverview(many);
    const ids = [...html.matchAll(/<a class="details-link" href="#([^"]+)">/g)].map(([, id]) => id);
    assert.deepEqual(ids, many.map(({ id }) => id));
    assert.equal(html.match(/<ul class="app-list">/g).length, 1);
  });

  it('keeps an app with no summary or Markdown usable without an empty text column', () => {
    const html = renderOverview([entry('plain', 'Plain')]);
    assert.match(html, /<a class="launch" href="\/plain\/"/);
    assert.match(html, /<div class="about no-text">/);
    assert.match(html, /<dl class="facts">/);
    assert.doesNotMatch(html, /<div class="text"|<details class="install">/);
  });

  it('has an empty state and a not-found page that links home', () => {
    assert.match(renderOverview([]), /No apps yet\./);
    const missing = renderNotFound([entry('a', 'A')], catalog);
    assert.match(missing, /<title>Seite nicht gefunden<\/title>/);
    assert.match(missing, /<a class="back" href="\/"><svg [^>]*>.*<\/svg><span data-l="de" lang="de">Alle Apps<\/span><span data-l="en" lang="en">All apps<\/span><\/a>/);
  });
});
