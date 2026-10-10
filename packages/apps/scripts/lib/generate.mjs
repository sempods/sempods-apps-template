// Generated configuration of one app. App code imports these files and never
// edits them; new-app writes them, and later commands regenerate them from
// apps.json, so template updates reach existing apps.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_PROFILES, siteIdentity } from './apps.mjs';

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
  returnTo: app.basePath,
};
`;
}

/**
 * Runtime settings per profile: local development with a dynamic identity on
 * loopback HTTP, and the did:web identities of the configured site origins.
 */
export function runtimeSource(app, site) {
  const published = SITE_PROFILES.filter((name) => site?.[name]);
  const modes = SITE_PROFILES.map(
    (name) => `  ${json(PROFILE_MODES[name])}: ${json(name)},`,
  ).join('\n');
  return `${HEADER}
import type { BrowserRuntimeOptions, Language } from '@sempods/app-sdk';

export const app = {
  id: ${json(app.id)},
  title: ${json(app.title)},
  language: ${json(app.language)} as Language,
  basePath: ${json(app.path)},
  pwa: ${app.pwa},
} as const;

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
  returnTo: app.basePath,
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
      lang: ${json(app.language)},
      start_url: ${json(p)},
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
      // Serve the cached shell only for this app's start route. The callback,
      // Pod and login pages always go to the network.
      navigateFallback: ${json(`${p}index.html`)},
      navigateFallbackAllowlist: [/^${escaped}$/],
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

export function writeGenerated(appDir, app, site) {
  for (const [file, source] of Object.entries(generatedFiles(app, site)))
    writeFileSync(join(appDir, file), source);
}

/** Lists generated files whose content differs from what apps.json produces. */
export function staleGenerated(appDir, app, site) {
  return Object.entries(generatedFiles(app, site))
    .filter(([file, source]) => {
      try {
        return readFileSync(join(appDir, file), 'utf8') !== source;
      } catch {
        return true;
      }
    })
    .map(([file]) => file);
}
