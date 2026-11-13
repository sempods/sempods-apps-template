// The site's static app launcher and not-found page: a compact list with
// direct app links and a secondary detail view at /#<id>. No SDK runtime or
// sign-in. The page holds every text in every site language; without script
// it shows the first, and a few lines of inline script pick the visitor's
// language and offer a switch. The entries carry what an app's description
// (app.jsonld) carries, so another reader of those descriptions, such as the
// store, can show the same.
import { micromark } from 'micromark';
import { LANGUAGES } from './apps.mjs';
import { escapeHtml as escape } from './html.mjs';
import { SKELETON } from './paths.mjs';
import { themeCss } from './themes.mjs';

// The overview's own words.
const TEXT = {
  en: {
    title: 'Apps',
    empty: 'No apps yet.',
    missing: 'Page not found',
    back: 'All apps',
    open: 'Open',
    details: 'Details',
    openNamed: 'Open {name}',
    newTab: '(opens in a new tab)',
    launchHint: 'Apps open in a new tab.',
    categories: 'Categories',
    languages: 'Languages',
    publisher: 'Published by',
    language: 'Language',
    install: 'Install on your device',
    installSteps:
      'Open the app first: a browser offers to install an app only on its own page. In Chrome and Edge, use the install icon in the address bar or the menu; in Safari on iPhone and iPad, Share and then “Add to Home Screen”. Firefox on the desktop installs no apps.',
    installCaveat:
      'Installed apps are still experimental. You can also use the app in your browser.',
  },
  de: {
    title: 'Apps',
    empty: 'Noch keine Apps.',
    missing: 'Seite nicht gefunden',
    back: 'Alle Apps',
    open: 'Öffnen',
    details: 'Details',
    openNamed: '{name} öffnen',
    newTab: '(öffnet in einem neuen Tab)',
    launchHint: 'Apps öffnen in einem neuen Tab.',
    categories: 'Kategorien',
    languages: 'Sprachen',
    publisher: 'Herausgegeben von',
    language: 'Sprache',
    install: 'Auf dem Gerät installieren',
    installSteps:
      'Öffne zuerst die App: Ein Browser bietet die Installation nur auf der Seite der App selbst an. In Chrome und Edge über das Installationssymbol in der Adressleiste oder das Menü, in Safari auf iPhone und iPad über Teilen und dann „Zum Home-Bildschirm“. Firefox auf dem Desktop installiert keine Apps.',
    installCaveat:
      'Installierte Apps sind noch experimentell. Du kannst die App auch im Browser nutzen.',
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

// The same checked theme roles as the skeleton, with restrained surfaces and
// the primary colour on actions. App icons keep their own colours.
export const SITE_THEME = 'fresh';

const STYLE = `
  :root { color-scheme: light dark; font: 1rem/1.5 system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--muted); color: var(--foreground); }
  a { color: inherit; }
  a:focus-visible, button:focus-visible, summary:focus-visible {
    outline: 2px solid var(--ring); outline-offset: 3px;
  }
  .shell { max-width: 58.75rem; margin: 0 auto; padding-inline: 2.625rem; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
         gap: 1rem; min-height: 5.125rem; padding-block: 0.75rem;
         border-bottom: 1px solid var(--border); }
  .brand { display: inline-flex; align-items: center; gap: 0.5rem; text-decoration: none;
           font-size: 0.95rem; font-weight: 650; min-height: 2.75rem; }
  .brand svg { color: var(--primary); }
  .intro { padding-block: 2rem 1.75rem; }
  .intro h1 { margin: 0; font-size: clamp(1.7rem, 4vw, 2.125rem); line-height: 1.2;
              font-weight: 650; letter-spacing: -0.03em; overflow-wrap: anywhere; }
  .intro p { margin: 0.5rem 0 0; color: var(--muted-foreground); overflow-wrap: anywhere; }
  main { padding-bottom: 0.5rem; }
  footer { display: flex; align-items: center; gap: 0.5rem; padding-block: 1.25rem 2rem;
           color: var(--muted-foreground); font-size: 0.8rem; }
  footer svg { flex: none; }

  .switch { display: flex; flex-wrap: wrap; gap: 0.2rem; }
  .switch[hidden] { display: none; }
  .switch button { font: inherit; font-size: 0.85rem; padding: 0.5rem 0.65rem;
                   min-height: 2.75rem; border: 0; border-radius: 0.5rem;
                   background: transparent; color: var(--muted-foreground); cursor: pointer; }
  .switch button[aria-pressed='true'] { background: var(--secondary); color: var(--secondary-foreground);
                                       font-weight: 600; }

  .icon { display: block; flex: none; width: 3.25rem; height: 3.25rem;
          border-radius: 25%; object-fit: cover; }
  .letter { display: grid; place-items: center; font-weight: 650; font-size: 1.6rem;
            background: var(--primary); color: var(--primary-foreground); }
  .app-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border);
              border-radius: 1rem; background: var(--card); color: var(--card-foreground); }
  .app-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center;
             gap: 1.25rem; padding: 1.5rem; }
  .app-row + .app-row { border-top: 1px solid var(--border); }
  .launch { display: flex; align-items: center; gap: 1.125rem; min-width: 0;
            border-radius: 0.5rem; text-decoration: none; }
  .app-copy { min-width: 0; overflow-wrap: anywhere; }
  .app-copy h2 { margin: 0; font-size: 1.125rem; font-weight: 650; letter-spacing: -0.02em; }
  .launch:hover h2 { color: var(--primary); text-decoration: underline; text-underline-offset: 0.2em; }
  .summary { margin: 0.2rem 0 0; color: var(--muted-foreground); font-size: 0.9rem; }
  .actions { display: flex; align-items: center; flex-wrap: wrap; gap: 0.85rem; }
  .details-link { font-size: 0.85rem; color: var(--muted-foreground); padding: 0.75rem 0.15rem;
                  text-underline-offset: 0.2em; }
  .open { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
          max-width: 100%; min-width: 0; overflow-wrap: anywhere;
          padding: 0.6rem 0.95rem; min-height: 2.75rem; border: 1px solid var(--input);
          border-radius: 0.6rem; font-weight: 600; font-size: 0.9rem; text-decoration: none;
          background: var(--card); color: var(--primary); }
  .open svg { flex: none; }
  .open:hover { background: var(--accent); }
  .primary { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); }
  .primary:hover { background: var(--primary); text-decoration: underline; text-underline-offset: 0.2em; }

  .detail { display: none; padding-top: 1.5rem; }
  .detail:target { display: block; }
  body:has(.detail:target) .intro, body:has(.detail:target) .apps { display: none; }
  .back { display: inline-flex; align-items: center; gap: 0.4rem; min-height: 2.75rem;
          font-size: 0.9rem; color: var(--muted-foreground); text-decoration: none; }
  .back:hover { text-decoration: underline; text-underline-offset: 0.2em; }
  .hero-main { display: flex; align-items: center; justify-content: space-between;
               gap: 1.25rem; padding-block: 1.4rem 1.8rem; border-bottom: 1px solid var(--border); }
  .hero-heading { display: flex; align-items: center; gap: 1.2rem; min-width: 0; }
  .hero-copy { min-width: 0; overflow-wrap: anywhere; }
  .hero .icon { width: 4rem; height: 4rem; }
  .hero h1 { margin: 0; font-size: 1.75rem; line-height: 1.2; letter-spacing: -0.03em; font-weight: 650; }
  .hero p { margin: 0.4rem 0 0; color: var(--muted-foreground); font-size: 0.9rem; }
  .hero .open { flex: none; max-width: min(100%, 18rem); }
  .about { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 13rem);
           gap: 2.5rem; margin-top: 1.65rem; }
  .about.no-text { grid-template-columns: 1fr; }
  .text { font-size: 0.95rem; overflow-wrap: anywhere; min-width: 0; }
  .text > :first-child { margin-top: 0; }
  .text h2, .text h3 { font-weight: 600; line-height: 1.3; margin: 1.5rem 0 0.65rem; }
  .text h2 { font-size: 1.125rem; }
  .text h3 { font-size: 1rem; }
  .text a { color: var(--primary); }
  .text img { max-width: 100%; height: auto; border-radius: 0.75rem; }
  .text pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  .facts { margin: 0; display: grid; align-content: start; gap: 1.1rem; }
  .facts dt { font-size: 0.8rem; color: var(--muted-foreground); }
  .facts dd { margin: 0.2rem 0 0; font-size: 0.9rem; overflow-wrap: anywhere; }
  .facts .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .chip { display: inline-block; padding: 0.1rem 0.65rem; border-radius: 999px;
          background: var(--secondary); color: var(--secondary-foreground); }
  .no-text .facts { grid-template-columns: repeat(auto-fit, minmax(min(10rem, 100%), 1fr)); }
  .install { margin-top: 1.75rem; padding-block: 1rem; font-size: 0.9rem;
             border-block: 1px solid var(--border); }
  .install summary { font-weight: 500; padding-block: 0.5rem; cursor: pointer; }
  .install p { margin: 0.6rem 0 0; max-width: 40rem; color: var(--muted-foreground); }

  @media (max-width: 40rem) {
    .shell { padding-inline: 1.375rem; }
    .bar { min-height: 4.5rem; }
    .intro { padding-top: 1.75rem; }
    .app-row { grid-template-columns: 1fr; gap: 0.8rem; padding: 1.25rem; }
    .launch { align-items: flex-start; }
    .actions { margin-left: 4.375rem; justify-content: space-between; }
    .hero-main { flex-wrap: wrap; }
    .hero-main > .open { margin-left: 5.2rem; max-width: calc(100% - 5.2rem); }
    .about { grid-template-columns: 1fr; gap: 1.5rem; }
    .facts { grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr)); }
  }
  @media (max-width: 22.5rem) {
    .shell { padding-inline: 1rem; }
    .app-row { padding: 1rem; }
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

function page(languages, { title, heading, intro = '', body, head = '', launches = false }) {
  const several = languages.length > 1;
  const choose = several ? `\n    <script>${CHOOSE}</script>` : '';
  const buttons = languages
    .map(
      (language) =>
        `<button type="button" data-set="${language}" lang="${language}" aria-pressed="false">${LANGUAGE_NAMES[language]}</button>`,
    )
    .join('');
  const nav = several
    ? `<nav class="switch" hidden aria-label="${escape(TEXT[languages[0]].language)}">${buttons}</nav>`
    : '';
  const script = several ? `\n    <script>${SWITCH}</script>` : '';
  return `<!doctype html>
<html lang="${languages[0]}" data-languages="${languages.join(' ')}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>${escape(title)}</title>${head}${choose}
    <style>${themeCss(SKELETON, SITE_THEME)}${STYLE}${languageRules(languages)}
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="bar">
        <a class="brand" href="/">${BRAND_ICON}sempods</a>${nav}
      </header>
      <main>
        <div class="intro">
          <h1>${heading}</h1>${intro}
        </div>
${body}
      </main>
      ${launches ? `<footer>${OPEN_ICON}${word(languages, 'launchHint')}</footer>` : ''}
    </div>${script}
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

/** Direct app links announce that they open a separate tab, including without script. */
function openLink(languages, entry, { primary = false } = {}) {
  const name = (language) => textIn(entry.name, language, entry.lang);
  const label = primary
    ? localized(languages, 'span', (language) => ({
        text: TEXT[language].openNamed.replace('{name}', name(language).text),
        lang: language,
      }))
    : `${word(languages, 'open')}<span class="vh"> ${localized(languages, 'span', name)}</span>`;
  return `<a class="open${primary ? ' primary' : ''}" href="${escape(entry.href)}" target="_blank" rel="noopener noreferrer">${label}<span class="vh"> ${word(languages, 'newTab')}</span>${OPEN_ICON}</a>`;
}

function row(languages, entry) {
  const name = (language) => textIn(entry.name, language, entry.lang);
  const summary = entry.description
    ? `\n                ${localized(languages, 'p', (language) => textIn(entry.description, language, entry.lang), { attrs: ' class="summary"' })}`
    : '';
  return `          <li class="app-row">
            <a class="launch" href="${escape(entry.href)}" target="_blank" rel="noopener noreferrer">
              ${icon(entry, 52)}
              <div class="app-copy">
                <h2>${localized(languages, 'span', name)}</h2>${summary}
              </div>
              <span class="vh">${word(languages, 'newTab')}</span>
            </a>
            <div class="actions">
              <a class="details-link" href="#${escape(entry.id)}">${word(languages, 'details')}<span class="vh"> ${localized(languages, 'span', name)}</span></a>
              ${openLink(languages, entry)}
            </div>
          </li>`;
}

/** Preserve the owner's order regardless of the number or categories of apps. */
function list(languages, entries) {
  return `        <ul class="app-list">\n${entries.map((entry) => row(languages, entry)).join('\n')}\n        </ul>`;
}

/**
 * Markdown in the restricted subset `check` allows, as HTML. micromark
 * follows CommonMark and leaves raw HTML and unsafe link protocols out.
 */
export const renderMarkdown = (text) => micromark(text);

const OPEN_ICON =
  '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="M4 12 12 4M5 4h7v7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const BRAND_ICON =
  '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"><rect x="2" y="8" width="6" height="9" rx="1"/><rect x="11" y="2" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/></svg>';

const BACK_ICON =
  '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function detail(languages, entry, publisher) {
  const name = (language) => textIn(entry.name, language, entry.lang);
  const summary = entry.description
    ? `\n            ${localized(languages, 'p', (language) => textIn(entry.description, language, entry.lang))}`
    : '';
  const text = entry.details
    ? `\n          ${localized(
        languages,
        'div',
        (language) => {
          const value = textIn(entry.details, language, entry.lang);
          return value && { ...value, text: renderMarkdown(value.text) };
        },
        { attrs: ' class="text"', html: true },
      )}`
    : '';
  const fact = (key, value, attrs = '') =>
    `\n              <div><dt>${word(languages, key)}</dt><dd${attrs}>${value}</dd></div>`;
  const facts = [
    entry.categories?.length
      ? fact('categories', categoryChips(languages, entry.categories), ' class="chips"')
      : '',
    fact(
      'languages',
      entry.languages
        .map((language) => `<span lang="${language}">${LANGUAGE_NAMES[language] ?? escape(language)}</span>`)
        .join(', '),
    ),
    publisher ? fact('publisher', `<a href="${escape(publisher)}">${escape(publisher)}</a>`) : '',
  ].join('');
  const install = entry.installable
    ? `\n            <details class="install">
              <summary>${word(languages, 'install')}</summary>
              ${word(languages, 'installSteps', 'p')}
              ${word(languages, 'installCaveat', 'p')}
            </details>`
    : '';
  return `      <article class="detail" id="${escape(entry.id)}">
        <div class="hero">
          <a class="back" href="#">${BACK_ICON}${word(languages, 'back')}</a>
          <div class="hero-main">
            <div class="hero-heading">
              ${icon(entry, 64)}
              <div class="hero-copy"><h1>${localized(languages, 'span', name)}</h1>${summary}</div>
            </div>
            ${openLink(languages, entry, { primary: true })}
          </div>
        </div>
        <div class="about${entry.details ? '' : ' no-text'}">${text}
          <dl class="facts">${facts}
          </dl>
        </div>${install}
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
  return page(languages, { title, heading, intro, body, head, launches: entries.length > 0 });
}

/** The page for unknown paths, so no host falls back to an app or the overview. */
export function renderNotFound(entries, catalog) {
  const languages = siteLanguages(catalog, entries);
  return page(languages, {
    title: TEXT[languages[0]].missing,
    heading: word(languages, 'missing'),
    body: `      <p><a class="back" href="/">${BACK_ICON}${word(languages, 'back')}</a></p>`,
  });
}
