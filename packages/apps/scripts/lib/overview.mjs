// The site's static overview and not-found pages, in the look of an app store:
// a card per app and a detail view at /#<id>. They run no SDK runtime and no
// sign-in. The page holds every text in every site language; without script
// it shows the first, and a few lines of inline script pick the visitor's
// language and offer a switch. The entries carry what an app's description
// (app.jsonld) carries, so another reader of those descriptions, such as the
// store, can show the same.
import { micromark } from 'micromark';
import { LANGUAGES } from './apps.mjs';
import { escapeHtml as escape } from './html.mjs';
import { SKELETON } from './paths.mjs';
import { DEFAULT_THEME, themeCss } from './themes.mjs';

// The overview's own words.
const TEXT = {
  en: {
    title: 'Apps',
    empty: 'No apps yet.',
    missing: 'Page not found',
    back: 'All apps',
    open: 'Open',
    installable: 'Can be installed',
    categories: 'Categories',
    languages: 'Languages',
    publisher: 'Published by',
    other: 'Other apps',
    language: 'Language',
    install: 'Install',
    installSteps:
      'Open the app first: a browser offers to install an app only on its own page. In Chrome and Edge, use the install icon in the address bar or the menu; in Safari on iPhone and iPad, Share and then “Add to Home Screen”. Firefox on the desktop installs no apps.',
    installCaveat:
      'Installed apps are still experimental. The app in the browser always works.',
  },
  de: {
    title: 'Apps',
    empty: 'Noch keine Apps.',
    missing: 'Seite nicht gefunden',
    back: 'Alle Apps',
    open: 'Öffnen',
    installable: 'Installierbar',
    categories: 'Kategorien',
    languages: 'Sprachen',
    publisher: 'Herausgegeben von',
    other: 'Weitere Apps',
    language: 'Sprache',
    install: 'Installieren',
    installSteps:
      'Öffne zuerst die App: Ein Browser bietet die Installation nur auf der Seite der App selbst an. In Chrome und Edge über das Installationssymbol in der Adressleiste oder das Menü, in Safari auf iPhone und iPad über Teilen und dann „Zum Home-Bildschirm“. Firefox auf dem Desktop installiert keine Apps.',
    installCaveat:
      'Installierte Apps sind noch experimentell. Im Browser funktioniert die App immer.',
  },
};

// Each language in its own name, as a language switch shows it.
const LANGUAGE_NAMES = { en: 'English', de: 'Deutsch' };

// The web app manifest's known categories, as the overview names them.
const CATEGORY_NAMES = {
  books: ['Books', 'Bücher'],
  business: ['Business', 'Business'],
  education: ['Education', 'Bildung'],
  entertainment: ['Entertainment', 'Unterhaltung'],
  finance: ['Finance', 'Finanzen'],
  fitness: ['Fitness', 'Fitness'],
  food: ['Food', 'Essen'],
  games: ['Games', 'Spiele'],
  government: ['Government', 'Verwaltung'],
  health: ['Health', 'Gesundheit'],
  kids: ['Kids', 'Kinder'],
  lifestyle: ['Lifestyle', 'Lifestyle'],
  magazines: ['Magazines', 'Magazine'],
  medical: ['Medical', 'Medizin'],
  music: ['Music', 'Musik'],
  navigation: ['Navigation', 'Navigation'],
  news: ['News', 'Nachrichten'],
  personalization: ['Personalization', 'Personalisierung'],
  photo: ['Photo', 'Foto'],
  politics: ['Politics', 'Politik'],
  productivity: ['Productivity', 'Produktivität'],
  security: ['Security', 'Sicherheit'],
  shopping: ['Shopping', 'Einkaufen'],
  social: ['Social', 'Soziales'],
  sports: ['Sports', 'Sport'],
  travel: ['Travel', 'Reisen'],
  utilities: ['Utilities', 'Werkzeuge'],
  weather: ['Weather', 'Wetter'],
};
const categoryName = (category, language) =>
  CATEGORY_NAMES[category]?.[language === 'de' ? 1 : 0] ?? category;

// From this many apps, the overview groups them by their first category.
export const GROUP_FROM = 8;

// Where the page remembers a visitor's choice of language. Apps share the
// origin's storage, so the key names the overview.
const STORAGE_KEY = 'sempods-overview-language';

/**
 * The site's languages, the one shown without script first: the catalog's
 * languages, else the languages the apps are shown in, the apps' shared one
 * first, otherwise English. Only languages the overview has words for.
 */
export function siteLanguages(catalog, entries) {
  const known = (languages) =>
    [...new Set(languages)].filter((language) => TEXT[language]);
  if (catalog)
    return known([
      catalog.lang,
      ...Object.keys(catalog.name_localized ?? {}),
      ...Object.keys(catalog.description_localized ?? {}),
    ]);
  const shown = entries.map((entry) => entry.languages);
  const shared = shown.every(
    (languages) => languages.length === 1 && languages[0] === shown[0][0],
  );
  const first = shown.length > 0 && shared ? shown[0][0] : 'en';
  return known([first, ...LANGUAGES.filter((l) => shown.flat().includes(l))]);
}

/**
 * The text of a language map for a page language: its own, else the base
 * language's, with the language the text is in. Undefined without either.
 */
function textIn(map, language, base) {
  if (map?.[language] !== undefined) return { text: map[language], lang: language };
  if (map?.[base] !== undefined) return { text: map[base], lang: base };
  return undefined;
}

/**
 * One element per distinct text over the page languages. Each carries the
 * page languages it is shown in, unless one text serves all of them, and
 * the language it is written in. `pick` gives `{ text, lang }` or undefined;
 * `html` text is inserted as it is.
 */
function localized(languages, tag, pick, { attrs = '', html = false } = {}) {
  const groups = [];
  for (const language of languages) {
    const value = pick(language);
    if (value === undefined) continue;
    const same = groups.find(
      (group) => group.text === value.text && group.lang === value.lang,
    );
    if (same) same.languages.push(language);
    else groups.push({ ...value, languages: [language] });
  }
  const everywhere =
    groups.length === 1 && groups[0].languages.length === languages.length;
  return groups
    .map(({ text, lang, languages: shownIn }) => {
      const only = everywhere ? '' : ` data-l="${shownIn.join(' ')}"`;
      return `<${tag}${attrs}${only} lang="${escape(lang)}">${html ? text : escape(text)}</${tag}>`;
    })
    .join('');
}

/** One of the overview's own words in every page language. */
const word = (languages, key, tag = 'span', attrs = '') =>
  localized(languages, tag, (language) => ({ text: TEXT[language][key], lang: language }), { attrs });

// The theme's palette, from the skeleton's default theme, and the page's
// layout. Text pairs keep the theme's checked contrast in both modes.
const STYLE = `
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.5; }
  body { margin: 0; background: var(--background); color: var(--foreground); }
  .bar, .intro, main { max-width: 64rem; margin: 0 auto; padding: 0 1rem; }
  .bar { display: flex; justify-content: flex-end; padding-top: 1rem; }
  .intro { padding-top: 1rem; padding-bottom: 1.5rem; }
  h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 0.5rem; }
  .intro p { margin: 0; color: var(--muted-foreground); font-size: 1.1rem; }
  main { padding-bottom: 3rem; }
  h2 { font-size: 1.25rem; margin: 2rem 0 1rem; }
  ul.grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 1rem;
            grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); }
  .card { position: relative; display: grid; grid-template-columns: 4rem 1fr;
          grid-template-rows: auto auto auto 1fr; gap: 0.25rem 1rem; padding: 1rem;
          background: var(--card); color: var(--card-foreground);
          border: 1px solid var(--border); border-radius: 1rem; }
  .card:hover { border-color: var(--ring); }
  .card .icon { grid-row: 1 / 4; }
  .card h2, .card h3 { font-size: 1.05rem; margin: 0; align-self: end; }
  .card h2 a, .card h3 a { color: inherit; text-decoration: none; }
  .card h2 a::after, .card h3 a::after { content: ''; position: absolute; inset: 0;
                                         border-radius: 1rem; }
  .card .summary { margin: 0; color: var(--muted-foreground); font-size: 0.9rem; }
  .card .note { margin: 0; }
  .card .meta { grid-column: 1 / -1; grid-row: 4; align-self: end; display: flex;
                flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-top: 0.75rem; }
  .card .open { margin-left: auto; position: relative; }
  .icon { width: 4rem; height: 4rem; border-radius: 22%; object-fit: cover;
          box-shadow: 0 1px 3px rgb(0 0 0 / 0.2), 0 4px 12px rgb(0 0 0 / 0.08); }
  .letter { display: grid; place-items: center; font-size: 2rem; font-weight: 600;
            background: var(--primary); color: var(--primary-foreground); }
  .chip { display: inline-block; padding: 0.1rem 0.6rem; border-radius: 999px;
          background: var(--secondary); color: var(--secondary-foreground); font-size: 0.8rem; }
  .note { color: var(--muted-foreground); font-size: 0.8rem; }
  .open { display: inline-block; padding: 0.35rem 1rem; border-radius: 999px;
          background: var(--primary); color: var(--primary-foreground);
          font-weight: 600; text-decoration: none; }
  a { color: inherit; }
  a:focus-visible, button:focus-visible { outline: 3px solid var(--ring); outline-offset: 3px; }
  .card h2 a:focus-visible, .card h3 a:focus-visible { outline: none; }
  .card:has(h2 a:focus-visible, h3 a:focus-visible) { outline: 3px solid var(--ring);
                                                       outline-offset: 3px; }
  .switch { display: flex; gap: 0.25rem; }
  .switch[hidden] { display: none; }
  .switch button { font: inherit; font-size: 0.9rem; padding: 0.25rem 0.75rem;
                   border: 1px solid var(--border); border-radius: 999px;
                   background: transparent; color: var(--foreground); cursor: pointer; }
  .switch button[aria-pressed='true'] { background: var(--secondary); border-color: var(--input); }
  .detail { display: none; }
  .detail:target { display: block; }
  body:has(.detail:target) .intro, body:has(.detail:target) .apps { display: none; }
  .detail .back { display: inline-block; margin: 1rem 0 1.5rem; }
  .detail header { display: grid; grid-template-columns: 6rem 1fr; gap: 0 1.25rem;
                   align-items: center; }
  .detail header .icon { width: 6rem; height: 6rem; grid-row: span 3; }
  .detail header p { margin: 0 0 0.75rem; color: var(--muted-foreground); }
  .detail header .open { justify-self: start; }
  .text { max-width: 40rem; margin-top: 1.5rem; }
  .text img { max-width: 100%; height: auto; border-radius: 0.5rem; }
  .facts { display: grid; grid-template-columns: max-content 1fr; gap: 0.5rem 1.5rem;
           margin: 2rem 0 0; }
  .facts dt { color: var(--muted-foreground); }
  .facts dd { margin: 0; overflow-wrap: anywhere; }
  .facts .chip + .chip { margin-left: 0.5rem; }
  .install { max-width: 40rem; margin-top: 2rem; padding: 1rem 1.25rem;
             background: var(--muted); border-radius: 1rem; }
  .install h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }
  .install p { margin: 0.5rem 0 0; }
  @media (max-width: 30rem) {
    .detail header { grid-template-columns: 4.5rem 1fr; }
    .detail header .icon { width: 4.5rem; height: 4.5rem; }
  }
  .vh { position: absolute; width: 1px; height: 1px; overflow: hidden;
        clip-path: inset(50%); white-space: nowrap; }
`;

/** The CSS that shows each element only in the page languages it carries. */
const languageRules = (languages) =>
  languages
    .map(
      (language) =>
        `  html[lang="${language}"] [data-l]:not([data-l~="${language}"]) { display: none !important; }`,
    )
    .join('\n');

// Before the page shows: the visitor's earlier choice, else the first of the
// browser's languages the site has; without script, the first site language.
const CHOOSE = `(() => {
      const html = document.documentElement;
      const offered = html.dataset.languages.split(' ');
      let chosen;
      try { chosen = localStorage.getItem('${STORAGE_KEY}'); } catch {}
      if (!offered.includes(chosen))
        chosen = (navigator.languages ?? [])
          .map((tag) => tag.split('-')[0].toLowerCase())
          .find((tag) => offered.includes(tag));
      if (chosen) html.lang = chosen;
    })();`;

// The switch, which exists only with script: it changes the page language
// and the title, and remembers the choice.
const SWITCH = `(() => {
      const html = document.documentElement;
      const nav = document.querySelector('.switch');
      const heading = document.querySelector('.intro h1');
      const show = (language) => {
        html.lang = language;
        for (const button of nav.querySelectorAll('button'))
          button.setAttribute('aria-pressed', String(button.dataset.set === language));
        const title = heading.querySelector('[data-l~="' + language + '"]') ?? heading;
        document.title = title.textContent.trim();
      };
      nav.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        try { localStorage.setItem('${STORAGE_KEY}', button.dataset.set); } catch {}
        show(button.dataset.set);
      });
      nav.hidden = false;
      show(html.lang);
    })();`;

function page(languages, { title, heading, intro = '', body, head = '' }) {
  const several = languages.length > 1;
  const choose = several ? `\n    <script>${CHOOSE}</script>` : '';
  const buttons = languages
    .map(
      (language) =>
        `<button type="button" data-set="${language}" lang="${language}" aria-pressed="false">${LANGUAGE_NAMES[language]}</button>`,
    )
    .join('');
  const nav = several
    ? `\n      <div class="bar"><nav class="switch" hidden aria-label="${escape(TEXT[languages[0]].language)}">${buttons}</nav></div>`
    : '';
  const script = several ? `\n    <script>${SWITCH}</script>` : '';
  return `<!doctype html>
<html lang="${languages[0]}" data-languages="${languages.join(' ')}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>${escape(title)}</title>${head}${choose}
    <style>${themeCss(SKELETON, DEFAULT_THEME)}${STYLE}${languageRules(languages)}
    </style>
  </head>
  <body>
    <header>${nav}
      <div class="intro">
        <h1>${heading}</h1>${intro}
      </div>
    </header>
    <main>
${body}
    </main>${script}
  </body>
</html>
`;
}

/** The catalog's name and description in every page language, or the defaults. */
function siteTexts(languages, catalog) {
  if (!catalog) return { heading: word(languages, 'title'), title: TEXT[languages[0]].title };
  const pick = (base, map) => (language) => textIn({ [catalog.lang]: base, ...map }, language, catalog.lang);
  const name = pick(catalog.name, catalog.name_localized);
  const description = catalog.description
    ? `\n        ${localized(languages, 'p', pick(catalog.description, catalog.description_localized))}`
    : '';
  return {
    heading: localized(languages, 'span', name),
    title: name(languages[0]).text,
    intro: description,
  };
}

function icon(entry, size) {
  // The name follows as text, so the icon is decorative.
  if (entry.icon)
    return `<img class="icon" src="${escape(entry.icon)}" alt="" width="${size}" height="${size}" />`;
  const letter = [...entry.name[entry.lang].trim()][0]?.toUpperCase() ?? '?';
  return `<span class="icon letter" aria-hidden="true">${escape(letter)}</span>`;
}

const categoryChips = (languages, categories) =>
  categories
    .map((category) =>
      localized(languages, 'span', (language) => ({ text: categoryName(category, language), lang: language }), {
        attrs: ' class="chip"',
      }),
    )
    .join('');

function card(languages, entry, level) {
  const name = (language) => textIn(entry.name, language, entry.lang);
  const summary = entry.description
    ? `\n            ${localized(languages, 'p', (language) => textIn(entry.description, language, entry.lang), { attrs: ' class="summary"' })}`
    : '';
  const chip = entry.categories?.length ? categoryChips(languages, entry.categories.slice(0, 1)) : '';
  const installable = entry.installable
    ? `\n            ${word(languages, 'installable', 'p', ' class="note"')}`
    : '';
  return `          <li class="card">
            ${icon(entry, 64)}
            <h${level}><a href="#${escape(entry.id)}">${localized(languages, 'span', name)}</a></h${level}>${summary}${installable}
            <div class="meta">${chip}<a class="open" href="${escape(entry.href)}">${word(languages, 'open')}<span class="vh"> ${localized(languages, 'span', name)}</span></a></div>
          </li>`;
}

/**
 * The apps in groups of their first category, those without one last. Below
 * GROUP_FROM apps, or when all share one group, there is one unnamed group.
 */
function groups(entries) {
  const byCategory = new Map();
  for (const entry of entries) {
    const key = entry.categories?.[0];
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(entry);
  }
  if (entries.length < GROUP_FROM || byCategory.size === 1) return [{ entries }];
  const rest = byCategory.get(undefined);
  byCategory.delete(undefined);
  return [
    ...[...byCategory].map(([category, members]) => ({ category, entries: members })),
    ...(rest ? [{ entries: rest }] : []),
  ];
}

function list(languages, entries) {
  const grouped = groups(entries);
  const single = grouped.length === 1;
  return grouped
    .map(({ category, entries: members }) => {
      const name =
        category === undefined
          ? word(languages, 'other')
          : localized(languages, 'span', (language) => ({ text: categoryName(category, language), lang: language }));
      const heading = single ? '' : `        <h2>${name}</h2>\n`;
      return `${heading}        <ul class="grid">\n${members.map((entry) => card(languages, entry, single ? 2 : 3)).join('\n')}\n        </ul>`;
    })
    .join('\n');
}

/**
 * Markdown in the restricted subset `check` allows, as HTML. micromark
 * follows CommonMark and leaves raw HTML and unsafe link protocols out.
 */
export const renderMarkdown = (text) => micromark(text);

function detail(languages, entry, publisher) {
  const name = (language) => textIn(entry.name, language, entry.lang);
  const summary = entry.description
    ? `\n            ${localized(languages, 'p', (language) => textIn(entry.description, language, entry.lang))}`
    : '';
  const text = entry.details
    ? `\n        ${localized(
        languages,
        'div',
        (language) => {
          const value = textIn(entry.details, language, entry.lang);
          return value && { ...value, text: renderMarkdown(value.text) };
        },
        { attrs: ' class="text"', html: true },
      )}`
    : '';
  const fact = (key, value) =>
    `\n          <dt>${word(languages, key)}</dt>\n          <dd>${value}</dd>`;
  const facts = [
    entry.categories?.length ? fact('categories', categoryChips(languages, entry.categories)) : '',
    fact(
      'languages',
      entry.languages
        .map((language) => `<span lang="${language}">${LANGUAGE_NAMES[language] ?? escape(language)}</span>`)
        .join(', '),
    ),
    publisher ? fact('publisher', `<a href="${escape(publisher)}">${escape(publisher)}</a>`) : '',
  ].join('');
  const install = entry.installable
    ? `\n        <section class="install">
          <h2>${word(languages, 'install')}</h2>
          ${word(languages, 'installSteps', 'p')}
          ${word(languages, 'installCaveat', 'p')}
        </section>`
    : '';
  return `      <article class="detail" id="${escape(entry.id)}">
        <a class="back" href="#">← ${word(languages, 'back')}</a>
        <header>
          ${icon(entry, 96)}
          <h1>${localized(languages, 'span', name)}</h1>${summary}
          <a class="open" href="${escape(entry.href)}">${word(languages, 'open')}</a>
        </header>${text}
        <dl class="facts">${facts}
        </dl>${install}
      </article>`;
}

/**
 * The overview of `entries`, in the given order: each
 * `{ id, href, lang, name, description?, details?, categories?, languages,
 * installable, icon? }`, where `name`, `description` and `details` (Markdown)
 * map languages to text and `lang` is the language of the base texts.
 * `catalog` is apps.json's catalog, if any.
 */
export function renderOverview(entries, catalog) {
  const languages = siteLanguages(catalog, entries);
  const { heading, title, intro } = siteTexts(languages, catalog);
  const body = entries.length
    ? `      <section class="apps">\n${list(languages, entries)}\n      </section>\n${entries.map((entry) => detail(languages, entry, catalog?.publisher)).join('\n')}`
    : `      ${word(languages, 'empty', 'p')}`;
  // Machines find the same list in the site catalog.
  const head = '\n    <link rel="alternate" type="application/ld+json" href="/apps.jsonld" />';
  return page(languages, { title, heading, intro, body, head });
}

/** The page for unknown paths, so no host falls back to an app or the overview. */
export function renderNotFound(entries, catalog) {
  const languages = siteLanguages(catalog, entries);
  return page(languages, {
    title: TEXT[languages[0]].missing,
    heading: word(languages, 'missing'),
    body: `      <p><a href="/">${word(languages, 'back')}</a></p>`,
  });
}
