// Reads and validates apps.json, the owner's manifest of apps.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJson, writeJson } from './json.mjs';
import { themeNames } from './themes.mjs';

export const SCHEMA_VERSION = 2;
// Schema 1 kept each app's title and description in apps.json; migrate moves
// them into apps/<id>/app.json.
export const LEGACY_SCHEMA_VERSION = 1;
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

// Routes answer as <id>/<route>.html next to the app's own build output; their
// first segment must not be one of the app's own paths.
const ROUTE_RESERVED = new Set([
  'assets',
  'callback',
  'did',
  'index',
  'licenses',
]);
// A route has at most this many segments, a resource pattern as well.
const MAX_SEGMENTS = 4;
// A placeholder of a resource pattern: one segment, named like a variable.
const PLACEHOLDER = /^:[a-z][a-zA-Z0-9]{0,39}$/;

/** Why `segment` cannot be a literal path segment, otherwise undefined. */
function invalidSegment(segment) {
  if (!ID_PATTERN.test(segment) || segment.endsWith('-'))
    return 'each segment is lowercase: a letter, then up to 39 letters, digits or hyphens';
  // build-site writes <segment>.html and <segment>/, which Windows refuses for
  // device names.
  if (WINDOWS_DEVICES.has(segment))
    return `"${segment}" is a reserved device name on Windows`;
  return undefined;
}

/** Why the segments of a route or pattern are not usable, otherwise undefined. */
function invalidSegments(value, { placeholders }) {
  const segments = value.split('/');
  if (segments.length > MAX_SEGMENTS)
    return `at most ${MAX_SEGMENTS} segments`;
  if (ROUTE_RESERVED.has(segments[0]))
    return `"${segments[0]}" is reserved by the site layout`;
  const names = new Set();
  for (const [i, segment] of segments.entries()) {
    if (placeholders && PLACEHOLDER.test(segment)) {
      // A pattern starting with a placeholder would also catch the callback,
      // assets and every other path of the app.
      if (i === 0) return 'the first segment is a word, not a placeholder';
      if (names.has(segment)) return `${segment} is used twice`;
      names.add(segment);
      continue;
    }
    const reason = invalidSegment(segment);
    if (reason)
      return placeholders
        ? `${reason}, or a placeholder such as :id`
        : reason;
  }
  if (placeholders && names.size === 0)
    return 'a pattern has a placeholder such as :id; list an address without one under routes';
  return undefined;
}

/**
 * Returns a reason when `route` cannot name a route, otherwise undefined. A
 * route is a literal address below the app's path: lowercase segments
 * separated by "/", for example "bought" or "tasks/add".
 */
export function invalidRoute(route) {
  if (typeof route !== 'string' || route === '')
    return 'a route is text, such as "bought" or "tasks/add"';
  return invalidSegments(route, { placeholders: false });
}

/**
 * Returns a reason when `pattern` cannot name a resource address, otherwise
 * undefined. A resource pattern has literal segments and placeholders for one
 * segment each, for example "tasks/:id" or "tasks/:id/postpone"; it starts
 * with a literal segment, so it never catches the callback or another path
 * of the app.
 */
function invalidResource(pattern) {
  if (typeof pattern !== 'string' || pattern === '')
    return 'a resource pattern is text, such as "tasks/:id"';
  return invalidSegments(pattern, { placeholders: true });
}

/** A resource pattern with each placeholder segment replaced. */
export const fillPlaceholders = (pattern, replacement) =>
  pattern
    .split('/')
    .map((segment) => (segment.startsWith(':') ? replacement : segment))
    .join('/');

/** A pattern's shape: the same addresses whatever its placeholders are called. */
const shape = (pattern) => fillPlaceholders(pattern, ':');

/** Lists the problems of one app's `routes` and `resources`. */
function addressProblems(app) {
  const problems = [];
  const list = (key, invalid) => {
    const values = app[key];
    if (values === undefined) return [];
    if (!Array.isArray(values)) {
      problems.push(`${app.id}: ${key} must be a list`);
      return [];
    }
    const name = key === 'routes' ? 'route' : 'resource';
    const valid = [];
    values.forEach((value, i) => {
      const reason = invalid(value);
      if (reason)
        problems.push(`${app.id}: ${name} ${JSON.stringify(value)}: ${reason}`);
      else if (values.indexOf(value) !== i)
        problems.push(`${app.id}: ${name} ${value} is listed twice`);
      else valid.push(value);
    });
    return valid;
  };
  list('routes', invalidRoute);
  const shapes = new Map();
  for (const pattern of list('resources', invalidResource)) {
    const other = shapes.get(shape(pattern));
    if (other !== undefined && other !== pattern)
      problems.push(
        `${app.id}: resources ${other} and ${pattern} name the same addresses`,
      );
    shapes.set(shape(pattern), pattern);
  }
  return problems;
}

/**
 * Returns a reason when `description` cannot describe an app or the site,
 * otherwise undefined. It is optional: one short sentence for the sign-in
 * screen, the installed app and the overview.
 */
export function invalidDescription(description) {
  if (description === undefined) return undefined;
  if (typeof description !== 'string' || description.trim() === '')
    return 'description must be text';
  if (description.trim().length > 120)
    return 'description must be one short sentence, at most 120 characters';
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

const CATALOG_KEYS = new Set([
  'lang',
  'name',
  'description',
  'name_localized',
  'description_localized',
  'publisher',
  'theme',
]);

/** Why `value` is not a map from another UI language to valid text. */
function localizedProblems(where, value, base, invalid) {
  if (value === undefined) return [];
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return [`${where} must be an object from language to text`];
  const problems = [];
  for (const [language, text] of Object.entries(value)) {
    if (!LANGUAGES.includes(language))
      problems.push(
        `${where}.${language}: the language must be one of ${LANGUAGES.join(', ')}`,
      );
    else if (language === base)
      problems.push(
        `${where}.${language} repeats the base language; write that text without _localized`,
      );
    else {
      const reason = invalid(text);
      if (reason) problems.push(`${where}.${language}: ${reason}`);
    }
  }
  return problems;
}

/** Returns a reason when `name` cannot name an app or the site. */
export function invalidName(name) {
  if (typeof name !== 'string' || name.trim() === '')
    return 'a name must be text';
  return undefined;
}

/**
 * Lists every problem of the texts an app or the site is described with: a
 * base language, a name and an optional description, and their translations
 * as `<field>_localized`. `fields` maps each text field to its check.
 */
export function textProblems(where, value, fields) {
  const problems = [];
  if (!LANGUAGES.includes(value.lang))
    problems.push(
      `${where}.lang must be one of ${LANGUAGES.join(', ')}: the language of its texts`,
    );
  for (const [field, { invalid, required }] of Object.entries(fields)) {
    if (value[field] === undefined) {
      if (required) problems.push(`${where}.${field} is required`);
    } else {
      const reason = invalid(value[field]);
      if (reason) problems.push(`${where}.${field}: ${reason}`);
    }
    problems.push(
      ...localizedProblems(
        `${where}.${field}_localized`,
        value[`${field}_localized`],
        value.lang,
        invalid,
      ),
    );
  }
  return problems;
}

/** Returns a reason when `value` is not an HTTPS URL, otherwise undefined. */
function invalidHttpsUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    url = undefined;
  }
  if (url?.protocol !== 'https:' || url.href !== value)
    return 'must be an HTTPS URL, such as https://pod.example.org/profile/card#me';
  return undefined;
}

/**
 * Lists every problem of the optional catalog: the site's name, description
 * and publisher for the overview and its machine-readable list, and the
 * overview's theme, one of the skeleton's.
 */
export function validateCatalog(catalog) {
  if (catalog === undefined) return [];
  if (catalog === null || typeof catalog !== 'object' || Array.isArray(catalog))
    return ['catalog must be an object'];
  const problems = [];
  for (const key of Object.keys(catalog))
    if (!CATALOG_KEYS.has(key))
      problems.push(`catalog.${key} is not a known field`);
  problems.push(
    ...textProblems('catalog', catalog, {
      name: { invalid: invalidName, required: true },
      description: { invalid: invalidDescription },
    }),
  );
  if (catalog.publisher !== undefined) {
    const reason = invalidHttpsUrl(catalog.publisher);
    if (reason) problems.push(`catalog.publisher ${reason}`);
  }
  if (catalog.theme !== undefined && !themeNames().includes(catalog.theme))
    problems.push(`catalog.theme must be one of ${themeNames().join(', ')}`);
  return problems;
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
  if (manifest?.schemaVersion === LEGACY_SCHEMA_VERSION)
    throw new Error(
      'apps.json still has schemaVersion 1; run pnpm run migrate, which moves each title and description into apps/<id>/app.json',
    );
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
  problems.push(...validateCatalog(manifest?.catalog));
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
    for (const key of ['title', 'description'])
      if (app[key] !== undefined)
        problems.push(
          `${app.id}: ${key} belongs in apps/${app.id}/app.json, not in apps.json`,
        );
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
    problems.push(...addressProblems(app));
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
