// Generated configuration of one app. App code imports these files and never
// edits them; new-app writes them, and later commands regenerate them from
// apps.json, so tooling updates reach existing apps.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUTO,
  fillPlaceholders,
  LANGUAGES,
  SITE_PROFILES,
  siteIdentity,
} from './apps.mjs';
import { MASKABLE_ICON, PNG_ICONS, TOUCH_ICON } from './icon.mjs';
import { manifestColours, PLAIN_COLOURS } from './themes.mjs';

const HEADER = `// Generated from apps.json and app.json by @sempods/apps. Do not edit:
// change them and run pnpm run regenerate.`;

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
  returnTo: returnPath,
};
`;
}

// One placeholder of a resource pattern matches one segment of these
// characters, for example a base64url-encoded IRI.
const PLACEHOLDER_SOURCE = '[A-Za-z0-9_-]+';

/**
 * The paths an app answers as a regular expression source, without the
 * slashes of a literal: the start page, each route and each resource
 * pattern, with or without a trailing slash, and an optional query when
 * `query` is set. Route and pattern segments need no escaping but the slash.
 */
function addressSource(app, { query = false } = {}) {
  const alternatives = [
    ...(app.routes ?? []),
    ...(app.resources ?? []).map((pattern) =>
      fillPlaceholders(pattern, PLACEHOLDER_SOURCE),
    ),
  ].map((address) => address.replaceAll('/', '\\/'));
  const rest = alternatives.length
    ? `(?:(?:${alternatives.join('|')})\\/?)?`
    : '';
  return `^${app.path.replaceAll('/', '\\/')}${rest}${query ? '(?:\\?[^#]*)?' : ''}$`;
}

const RETURN_PATH = (app) => `
// The addresses the app declares in apps.json: the start page, its routes and
// its resource patterns.
const ADDRESS = /${addressSource(app)}/;

// The query parameters of the sign-in callback; the SDK refuses a return
// address that carries one.
const RESERVED = ['code', 'state', 'error', 'iss', 'response'];

// The address sign-in returns to: the current one with its query when the app
// declares it, otherwise the start page. Never the callback or another app.
// The runtime calls it when each sign-in starts; the callback's parameters
// are dropped, the rest of the query stays.
function returnPath(): string {
  const { pathname, search } = location;
  if (!ADDRESS.test(pathname)) return app.basePath;
  const path =
    pathname === app.basePath ? pathname : pathname.replace(/\\/$/, '');
  const query = new URLSearchParams(search);
  if (!RESERVED.some((key) => query.has(key))) return path + search;
  for (const key of RESERVED) query.delete(key);
  const rest = query.toString();
  return rest ? path + '?' + rest : path;
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
  const localized = Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      {
        title: app.about?.name_localized?.[language] ?? app.about?.name ?? app.title,
        description:
          app.about?.description_localized?.[language] ??
          app.about?.description ??
          app.description ??
          null,
      },
    ]),
  );
  return `${HEADER}
import type { BrowserRuntimeOptions${app.language === AUTO ? '' : ', Language'} } from '@sempods/app-sdk';

export const app = {
  id: ${json(app.id)},
  title: ${json(app.title)},
  description: ${json(app.description ?? null)},
  language: ${language},
  localized: ${json(localized)},
  basePath: ${json(app.path)},
  pwa: ${app.pwa},
  routes: ${json(app.routes ?? [])},
  resources: ${json(app.resources ?? [])},
} as const;
${RETURN_PATH(app)}
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
  returnTo: returnPath,
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

// The manifest members taken from app.json, in the order they are written.
const ABOUT_KEYS = [
  'name',
  'name_localized',
  'short_name',
  'short_name_localized',
  'description',
  'description_localized',
  'lang',
  'categories',
];

// The generated Vite configuration imports what every app shares from here.
const VITE_EXPORT = '@sempods/apps/vite';

/** The PWA options: the app's manifest members and offline addresses. */
function pwaSource(app, colours, icons) {
  const icon = (file, size, purpose) =>
    `      { src: ${json(`${app.path}${icons[file] ?? file}`)}, sizes: '${size}x${size}', type: 'image/png', purpose: '${purpose}' },`;
  const about = ABOUT_KEYS.filter((key) => app.about[key] !== undefined).map(
    (key) => `    ${key}: ${json(app.about[key])},`,
  );
  return `sempodsPwa({
  base,
  // The installed app's manifest, from app.json and the app's theme.
  manifest: {
${about.join('\n')}
    background_color: ${json(colours.background)},
    theme_color: ${json(colours.theme ?? colours.background)},
    icons: [
${icon('icon-192.png', 192, 'any')}
${icon('icon-512.png', 512, 'any')}
${icon(MASKABLE_ICON, 512, 'maskable')}
    ],
  },
  // The start page, the routes and the resource patterns, with any query.
  addresses: /${addressSource(app, { query: true })}/,
})`;
}

// The splash shows the name in the page's language, as the app's startup
// screen does; an app that follows the browser shows its source name.
const splashName = (app) =>
  (app.language !== AUTO && app.about?.name_localized?.[app.language]) ||
  app.title;

/**
 * Vite base path, development server, page plugin and PWA settings: the
 * app's data and calls into @sempods/apps/vite, which holds the behaviour.
 */
export function viteSource(app, colours = PLAIN_COLOURS, icons = {}) {
  const assets = Object.fromEntries(
    Object.entries(icons).map(([file, path]) => [path, file]),
  );
  return `${HEADER}
import { ${app.pwa ? 'sempodsPage, sempodsPwa' : 'sempodsPage'}, type PwaOptions } from '${VITE_EXPORT}';

export const base = ${json(app.path)};

// Title, description link, initial colours, splash name and launcher icons
// of every page Vite serves or builds.
export const pageTitle = sempodsPage({
  app: ${json(app.id)},
  base,
  title: ${json(app.title)},
  splashName: ${json(splashName(app))},
  colours: {
    light: ${json(colours.background)},
    dark: ${json(colours.darkBackground ?? PLAIN_COLOURS.darkBackground)},
    text: ${json(colours.text ?? PLAIN_COLOURS.text)},
    darkText: ${json(colours.darkText ?? PLAIN_COLOURS.darkText)},
  },
  // Content-addressed copies of the icons in public/.
  icons: ${json(assets)},
  publicDir: new URL('./public/', import.meta.url),
});

export const server = {
  host: '127.0.0.1',
  port: ${app.devPort},
  strictPort: true,
} as const;

export const pwa: PwaOptions | null = ${app.pwa ? pwaSource(app, colours, icons) : 'null'};
`;
}

/**
 * The generated files of an app; `colours` are its theme's, as
 * manifestColours reads them from the app's folder.
 */
export function generatedFiles(app, site, colours = PLAIN_COLOURS, icons = {}) {
  return {
    'src/sempods.generated.ts': runtimeSource(app, site),
    'vite.sempods.generated.ts': viteSource(app, colours, icons),
  };
}

// Different bytes get a different URL; unrelated builds keep the exact URL.
// Only PNG launcher assets are versioned. The app/header/splash uses the SVG.
export function iconAssets(appDir) {
  return Object.fromEntries([...PNG_ICONS, MASKABLE_ICON, TOUCH_ICON].flatMap((file) => {
    const path = join(appDir, 'public', file);
    if (!existsSync(path)) return [];
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
    return [[file, `sempods-icons/${file.slice(0, -4)}-${hash}.png`]];
  }));
}

const filesFor = (appDir, app, site) =>
  generatedFiles(app, site, manifestColours(appDir), iconAssets(appDir));

export function writeGenerated(appDir, app, site) {
  for (const [file, source] of Object.entries(filesFor(appDir, app, site)))
    writeFileSync(join(appDir, file), source);
}

/** Lists generated files whose content differs from what apps.json produces. */
export function staleGenerated(appDir, app, site) {
  return Object.entries(filesFor(appDir, app, site))
    .filter(([file, source]) => {
      try {
        return readFileSync(join(appDir, file), 'utf8') !== source;
      } catch {
        return true;
      }
    })
    .map(([file]) => file);
}
