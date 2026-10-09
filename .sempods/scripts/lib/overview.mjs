// The site's static overview and not-found pages. They run no script and no
// SDK runtime; each entry links to its app's own page. The entry shape is the
// data model a richer app overview can build on.
import { escapeHtml as escape } from './html.mjs';

const TEXT = {
  en: {
    title: 'Apps',
    empty: 'No apps yet.',
    missing: 'Page not found',
    back: 'All apps',
  },
  de: {
    title: 'Apps',
    empty: 'Noch keine Apps.',
    missing: 'Seite nicht gefunden',
    back: 'Alle Apps',
  },
};

// System colors follow light and dark mode and keep their contrast.
const STYLE = `
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; background: Canvas; color: CanvasText; }
  main { max-width: 56rem; margin: 0 auto; padding: 2rem 1rem; }
  h1 { font-size: 1.75rem; margin: 0 0 1.5rem; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 1rem;
       grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); }
  a { display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
      padding: 1.25rem 1rem; border: 1px solid GrayText; border-radius: 1rem;
      color: inherit; text-decoration: none; text-align: center; }
  a:hover { border-color: LinkText; }
  a:focus-visible { outline: 3px solid Highlight; outline-offset: 3px; }
  img, .letter { width: 4rem; height: 4rem; border-radius: 1rem; }
  .letter { display: grid; place-items: center; font-size: 2rem;
            font-weight: 600; background: GrayText; color: Canvas; }
  .name { font-weight: 600; }
  .description { font-size: 0.9rem; }
`;

function page(language, title, body) {
  return `<!doctype html>
<html lang="${escape(language)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escape(title)}</title>
    <style>${STYLE}</style>
  </head>
  <body>
    <main>
${body}
    </main>
  </body>
</html>
`;
}

function card(entry) {
  // The name follows as text, so the icon is decorative.
  const letter = [...entry.title.trim()][0]?.toUpperCase() ?? '?';
  const icon = entry.icon
    ? `<img src="${escape(entry.icon)}" alt="" width="64" height="64" />`
    : `<span class="letter" aria-hidden="true">${escape(letter)}</span>`;
  const description = entry.description
    ? `\n          <span class="description">${escape(entry.description)}</span>`
    : '';
  return `        <li>
          <a href="${escape(entry.href)}" lang="${escape(entry.language)}">
          ${icon}
          <span class="name">${escape(entry.title)}</span>${description}
          </a>
        </li>`;
}

/** One language for a site page: the apps' shared language, else English. */
export function siteLanguage(entries) {
  const languages = new Set(entries.map((entry) => entry.language));
  const [only] = languages;
  return languages.size === 1 && TEXT[only] ? only : 'en';
}

/**
 * The overview: one card per `{ id, title, language, href, icon?,
 * description? }`, in the given order.
 */
export function renderOverview(entries) {
  const language = siteLanguage(entries);
  const text = TEXT[language];
  const list = entries.length
    ? `      <ul>\n${entries.map(card).join('\n')}\n      </ul>`
    : `      <p>${escape(text.empty)}</p>`;
  return page(language, text.title, `      <h1>${escape(text.title)}</h1>\n${list}`);
}

/** The page for unknown paths, so no host falls back to an app or the overview. */
export function renderNotFound(entries) {
  const language = siteLanguage(entries);
  const text = TEXT[language];
  return page(
    language,
    text.missing,
    `      <h1>${escape(text.missing)}</h1>\n      <p><a href="/">${escape(text.back)}</a></p>`,
  );
}
