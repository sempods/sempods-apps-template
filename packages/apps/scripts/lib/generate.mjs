// Generated configuration of one app. App code imports these files and never
// edits them; new-app writes them, and later commands regenerate them from
// apps.json, so tooling updates reach existing apps. The page title in
// index.html follows apps.json the same way.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTO, SITE_PROFILES, siteIdentity } from './apps.mjs';
import { escapeHtml } from './html.mjs';
import { ifPresent } from './json.mjs';

const HEADER = `// Generated from apps.json by @sempods/apps. Do not edit: change apps.json
// and run pnpm run regenerate.`;

export const GENERATED_FILES = [
  'src/sempods.generated.ts',
  'vite.sempods.generated.ts',
];

const json = (value) => JSON.stringify(value);

// build-site selects a published profile through Vite's mode, which only the
// command line sets; dev, plain builds and tests run the local profile.
export const PROFILE_MODES = {
  production: 'sempods-production',
  preview: 'sempods-preview',
};

/** A published profile: the did:web identity for one site origin. */
function publishedProfile(name, origin, app) {
  const { clientId, redirectUri } = siteIdentity(origin, app);
  return `
// ${name === 'production' ? 'Published site' : 'Fixed preview address'}: ${origin}
const ${name}: BrowserRuntimeOptions = {
  identity: {
    kind: 'did-web',
    clientId: ${json(clientId)},
    redirectUri: ${json(redirectUri)},
  },
  ${RETURN_TO[Boolean(app.routes?.length)]},
};
`;
}

// With routes, sign-in returns to the route it started from: read when the
// runtime is created, as the callback is, so tests can import the module.
const RETURN_TO = {
  false: 'returnTo: app.basePath',
  true: `get returnTo() {
    return returnPath();
  }`,
};

const RETURN_PATH = `
// The page sign-in returns to: the current route, otherwise the start page.
function returnPath(): string {
  const routes: readonly string[] = app.routes;
  const route = location.pathname
    .slice(app.basePath.length)
    .replace(/\\/$/, '');
  return location.pathname.startsWith(app.basePath) && routes.includes(route)
    ? app.basePath + route
    : app.basePath;
}
`;

/**
 * Runtime settings per profile: local development with a dynamic identity on
 * loopback HTTP, and the did:web identities of the configured site origins.
 */
export function runtimeSource(app, site) {
  const published = SITE_PROFILES.filter((name) => site?.[name]);
  const modes = SITE_PROFILES.map(
    (name) => `  ${json(PROFILE_MODES[name])}: ${json(name)},`,
  ).join('\n');
  // "auto" stays a literal: the app resolves it from the browser.
  const language =
    app.language === AUTO ? json(AUTO) : `${json(app.language)} as Language`;
  return `${HEADER}
import type { BrowserRuntimeOptions${app.language === AUTO ? '' : ', Language'} } from '@sempods/app-sdk';

export const app = {
  id: ${json(app.id)},
  title: ${json(app.title)},
  language: ${language},
  basePath: ${json(app.path)},
  pwa: ${app.pwa},
  routes: ${json(app.routes ?? [])},
} as const;
${app.routes?.length ? RETURN_PATH : ''}
// Local development: a dynamic identity, local HTTP only.
const local: BrowserRuntimeOptions = {
  identity: {
    kind: 'dynamic',
    name: app.title,
    // Read when the runtime is created, not on import, so tests can import
    // this module outside a browser.
    get redirectUri() {
      return \`\${location.origin}${app.path}callback\`;
    },
  },
  ${RETURN_TO[Boolean(app.routes?.length)]},
  development: 'loopback-http',
};
${published.map((name) => publishedProfile(name, site[name], app)).join('')}
export const profiles: Readonly<Record<string, BrowserRuntimeOptions>> = {
${['local', ...published].map((name) => `  ${name},`).join('\n')}
};

// pnpm run build-site builds with one of these modes; any other mode is local.
const modes: Readonly<Record<string, string>> = {
${modes}
};

export const profile: string = modes[import.meta.env?.MODE ?? ''] ?? 'local';

function unconfigured(name: string): never {
  throw new Error(
    \`apps.json has no site.\${name}; run pnpm run configure-site\`,
  );
}

export const runtimeOptions: BrowserRuntimeOptions =
  profiles[profile] ?? unconfigured(profile);
`;
}

/** Vite base path, development server and PWA settings for this app's path. */
export function viteSource(app) {
  const p = app.path;
  // The start page and every route, with or without a trailing slash, as the
  // app's router accepts them; route names need no escaping.
  const routes = app.routes?.length
    ? `((${app.routes.join('|')})\\/?)?`
    : '';
  const escaped = p.replaceAll('/', '\\/');
  const pwa = app.pwa
    ? `{
    // The app registers its worker itself (src/main.tsx) and never takes over
    // an open page: an update applies once every window is closed.
    registerType: 'prompt',
    injectRegister: false,
    manifest: {
      id: ${json(p)},
      name: ${json(app.title)},
      short_name: ${json(app.title)},
${app.language === AUTO ? '' : `      lang: ${json(app.language)},
`}      start_url: ${json(p)},
      scope: ${json(p)},
      display: 'standalone',
      background_color: '#f6faf9',
      theme_color: '#176354',
      icons: [
        { src: ${json(`${p}icon-192.png`)}, sizes: '192x192', type: 'image/png' },
        { src: ${json(`${p}icon-512.png`)}, sizes: '512x512', type: 'image/png' },
      ],
    },
    workbox: {
      // Precache the built shell only; nothing is cached at runtime.
      globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
      runtimeCaching: [],
      // Serve the cached shell only for this app's start page and routes. The
      // callback, Pod and login pages always go to the network.
      navigateFallback: ${json(`${p}index.html`)},
      navigateFallbackAllowlist: [/^${escaped}${routes}$/],
      skipWaiting: false,
      clientsClaim: false,
      cleanupOutdatedCaches: true,
    },
  }`
    : 'null';
  return `${HEADER}
import type { VitePWAOptions } from 'vite-plugin-pwa';

export const base = ${json(p)};

export const server = {
  host: '127.0.0.1',
  port: ${app.devPort},
  strictPort: true,
} as const;

export const pwa: Partial<VitePWAOptions> | null = ${pwa};
`;
}

export function generatedFiles(app, site) {
  return {
    'src/sempods.generated.ts': runtimeSource(app, site),
    'vite.sempods.generated.ts': viteSource(app),
  };
}

// index.html is the owner's file except for its page title, which follows
// apps.json like the manifest and the sign-in screen.
export const PAGE = 'index.html';
// HTML tag names ignore case, and the element may carry attributes; both stay.
const TITLE = /(<title(?=[\s>])[^>]*>)[^<]*(<\/title\s*>)/i;

// Where a missing title goes: before </head>, or, as the end tag is
// optional, after <head> or before <body>.
const HEAD_END = /<\/head\s*>/i;
const HEAD_START = /<head(?=[\s>])[^>]*>/i;
const BODY_START = /<body(?=[\s>])/i;

/** The page with the app's title; a page without a title gets one. */
export function titledPage(html, app) {
  const text = escapeHtml(app.title);
  if (TITLE.test(html))
    return html.replace(TITLE, (_, open, close) => `${open}${text}${close}`);
  const title = `<title>${text}</title>`;
  if (HEAD_END.test(html))
    return html.replace(HEAD_END, (end) => `  ${title}\n  ${end}`);
  if (HEAD_START.test(html))
    return html.replace(HEAD_START, (start) => `${start}\n    ${title}`);
  return BODY_START.test(html)
    ? html.replace(BODY_START, (start) => `${title}\n  ${start}`)
    : `${title}\n${html}`;
}

/** Generated files and the page whose content differs from apps.json. */
function changes(appDir, app, site) {
  const files = Object.entries(generatedFiles(app, site)).filter(
    ([file, source]) =>
      ifPresent(() => readFileSync(join(appDir, file), 'utf8')) !== source,
  );
  // A missing page is the build's problem, not the generator's.
  const html = ifPresent(() => readFileSync(join(appDir, PAGE), 'utf8'));
  if (html !== undefined && titledPage(html, app) !== html)
    files.push([PAGE, titledPage(html, app)]);
  return files;
}

export function writeGenerated(appDir, app, site) {
  for (const [file, source] of changes(appDir, app, site))
    writeFileSync(join(appDir, file), source);
}

/** Lists generated files and the page whose content differs from apps.json. */
export function staleGenerated(appDir, app, site) {
  return changes(appDir, app, site).map(([file]) => file);
}
