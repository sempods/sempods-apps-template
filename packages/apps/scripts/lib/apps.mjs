// Reads and validates apps.json, the owner's manifest of apps.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJson, writeJson } from './json.mjs';

export const SCHEMA_VERSION = 1;
export const FIRST_DEV_PORT = 5174;
// The UI languages of the SDK; "auto" follows the browser among them.
export const LANGUAGES = ['en', 'de'];
export const AUTO = 'auto';
export const APP_LANGUAGES = [AUTO, ...LANGUAGES];
// Where the site is published (configure-site): one origin per profile and the
// host whose routing build-site writes for.
export const SITE_PROFILES = ['production', 'preview'];
const SITE_KEYS = new Set(SITE_PROFILES);

const ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
// Paths the site itself uses, and directory names that would confuse the
// repository layout.
const SITE_RESERVED = new Set([
  'apps',
  'assets',
  'callback',
  'index',
  'node_modules',
  'public',
  'reference',
  'src',
  'static',
]);
// Windows reserves these device names, with or without an extension.
const WINDOWS_DEVICES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

/** Returns a reason when `id` cannot name an app, otherwise undefined. */
export function invalidId(id) {
  if (typeof id !== 'string' || !ID_PATTERN.test(id))
    return 'an app ID is one lowercase segment: a letter, then up to 39 letters, digits or hyphens';
  if (id.endsWith('-')) return 'an app ID does not end with a hyphen';
  if (SITE_RESERVED.has(id)) return `"${id}" is reserved by the site layout`;
  if (WINDOWS_DEVICES.has(id))
    return `"${id}" is a reserved device name on Windows`;
  return undefined;
}

// Routes answer as <id>/<route>.html next to the app's own build output.
const ROUTE_RESERVED = new Set([
  'assets',
  'callback',
  'did',
  'index',
  'licenses',
]);

/**
 * Returns a reason when `description` cannot describe an app, otherwise
 * undefined. It is optional: one short sentence for the sign-in screen, the
 * installed app and the overview.
 */
export function invalidDescription(description) {
  if (description === undefined) return undefined;
  if (typeof description !== 'string' || description.trim() === '')
    return 'description must be text';
  if (description.trim().length > 120)
    return 'description must be one short sentence, at most 120 characters';
  return undefined;
}

/** Returns a reason when `route` cannot name a route, otherwise undefined. */
export function invalidRoute(route) {
  if (
    typeof route !== 'string' ||
    !ID_PATTERN.test(route) ||
    route.endsWith('-')
  )
    return 'a route is one lowercase segment: a letter, then up to 39 letters, digits or hyphens';
  if (ROUTE_RESERVED.has(route))
    return `"${route}" is reserved by the site layout`;
  // build-site writes <route>.html, which Windows refuses for device names.
  if (WINDOWS_DEVICES.has(route))
    return `"${route}" is a reserved device name on Windows`;
  return undefined;
}

/**
 * Returns a reason when `value` is not an origin as apps.json records it,
 * otherwise undefined. configure-site also lets the SDK check the identity.
 */
export function invalidOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    url = undefined;
  }
  // The origin round trip rejects a path, query, credentials and uppercase:
  // did:web and the callback derive from exactly this host.
  if (url?.protocol !== 'https:' || url.origin !== value || url.port)
    return 'must be an HTTPS origin without a path or port, such as https://apps.example.org';
  return undefined;
}

/** The did:web identity and callback of an app published at `origin`. */
export function siteIdentity(origin, app) {
  return {
    clientId: `did:web:${new URL(origin).hostname}:${app.id}`,
    redirectUri: `${origin}${app.path}callback`,
  };
}

/** Lists every problem of the optional site configuration. */
export function validateSite(site) {
  if (site === undefined) return [];
  if (site === null || typeof site !== 'object' || Array.isArray(site))
    return ['site must be an object'];
  const problems = [];
  for (const key of Object.keys(site))
    if (!SITE_KEYS.has(key)) problems.push(`site.${key} is not a known field`);
  if (site.production === undefined)
    problems.push('site.production is required once site is set');
  for (const profile of SITE_PROFILES) {
    if (site[profile] === undefined) continue;
    const reason = invalidOrigin(site[profile]);
    if (reason) problems.push(`site.${profile} ${reason}`);
  }
  if (site.preview !== undefined && site.preview === site.production)
    problems.push('site.preview must differ from site.production');
  return problems;
}

export function appsFile(root) {
  return join(root, 'apps.json');
}

/** Reads apps.json. Throws when it is missing or invalid. */
export function readApps(root) {
  const file = appsFile(root);
  if (!existsSync(file))
    throw new Error(
      'apps.json is missing; it lists the apps of this repository and must exist, even with no apps',
    );
  const manifest = readJson(file);
  const problems = validateApps(manifest);
  if (problems.length > 0) throw new Error(`apps.json: ${problems.join('; ')}`);
  return manifest;
}

export function writeApps(root, manifest) {
  const apps = [...manifest.apps].sort((a, b) => a.id.localeCompare(b.id));
  writeJson(appsFile(root), { ...manifest, apps });
}

/** Lists every problem of a parsed apps.json. */
export function validateApps(manifest) {
  const problems = [];
  if (manifest?.schemaVersion !== SCHEMA_VERSION)
    problems.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  problems.push(...validateSite(manifest?.site));
  if (!Array.isArray(manifest?.apps))
    return [...problems, 'apps must be a list'];
  const ids = new Set();
  const ports = new Set();
  for (const app of manifest.apps) {
    const reason = invalidId(app?.id);
    if (reason) {
      problems.push(`${JSON.stringify(app?.id)}: ${reason}`);
      continue;
    }
    if (ids.has(app.id)) problems.push(`${app.id}: listed twice`);
    ids.add(app.id);
    if (typeof app.title !== 'string' || app.title.trim() === '')
      problems.push(`${app.id}: title must be text`);
    const description = invalidDescription(app.description);
    if (description) problems.push(`${app.id}: ${description}`);
    if (!APP_LANGUAGES.includes(app.language))
      problems.push(
        `${app.id}: language must be one of ${APP_LANGUAGES.join(', ')}`,
      );
    if (app.path !== `/${app.id}/`)
      problems.push(`${app.id}: path must be "/${app.id}/"`);
    if (
      !Number.isInteger(app.devPort) ||
      app.devPort < 1024 ||
      app.devPort > 65535
    )
      problems.push(`${app.id}: devPort must be a port number from 1024`);
    else if (ports.has(app.devPort))
      problems.push(`${app.id}: devPort ${app.devPort} is used twice`);
    ports.add(app.devPort);
    if (typeof app.pwa !== 'boolean')
      problems.push(`${app.id}: pwa must be true or false`);
    if (app.routes !== undefined && !Array.isArray(app.routes))
      problems.push(`${app.id}: routes must be a list`);
    else if (app.routes)
      app.routes.forEach((route, i) => {
        const reason = invalidRoute(route);
        if (reason)
          problems.push(`${app.id}: route ${JSON.stringify(route)}: ${reason}`);
        else if (app.routes.indexOf(route) !== i)
          problems.push(`${app.id}: route ${route} is listed twice`);
      });
  }
  return problems;
}

/** The first development port after the ones in use. */
export function nextDevPort(manifest) {
  const used = new Set(manifest.apps.map((app) => app.devPort));
  let port = FIRST_DEV_PORT;
  while (used.has(port)) port += 1;
  return port;
}
