// What build-site publishes about each app besides the app itself, all from
// the same app.json, apps.json and site origin: the JSON-LD description for
// the overview, the store and any RDF reader (app.jsonld), the Client ID
// Metadata Document for authorization servers (client.json), the list of the
// published files with their digests (build.json) and the site catalog
// (/apps.jsonld). Every document names the app by its IRI, the HTTPS address
// of its start page; identifierProblems checks that they agree.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { siteIdentity } from './apps.mjs';
import { appDir } from './describe.mjs';
import { formatJson, ifPresent } from './json.mjs';
import { DETAILS_FILE, uiLanguages } from './texts.mjs';

export const APP_DESCRIPTION = 'app.jsonld';
export const CLIENT_DOCUMENT = 'client.json';
export const BUILD_LIST = 'build.json';
export const SITE_CATALOG = 'apps.jsonld';
// The Client ID Metadata Document draft recommends that a server read at most
// 5 kilobytes of it; the stricter reading, in bytes as written.
export const CLIENT_LIMIT = 5000;

// schema.org, with the localized texts as language maps.
const CONTEXT = [
  'https://schema.org/',
  {
    name: { '@container': '@language' },
    description: { '@container': '@language' },
  },
];

/** The app's IRI on a site origin: the address of its start page. */
export const appIri = (origin, app) => `${origin}${app.path}`;

/**
 * A language map over `languages`: the base text in `lang`, the translations
 * from `localized`, and `fallback` for a language without one.
 */
function languageMap(languages, lang, base, localized, fallback) {
  const map = {};
  for (const language of languages) {
    const text =
      language === lang ? base : (localized?.[language] ?? fallback);
    if (text !== undefined) map[language] = text;
  }
  return map;
}

/** The detail texts of an app as schema.org TextObjects, one per language. */
function detailTexts(root, app, languages) {
  return languages.flatMap((language) => {
    const file =
      language === app.about.lang ? DETAILS_FILE : `details.${language}.md`;
    const text = ifPresent(() =>
      readFileSync(join(appDir(root, app.id), file), 'utf8'),
    );
    return text === undefined
      ? []
      : [
          {
            '@type': 'TextObject',
            inLanguage: language,
            encodingFormat: 'text/markdown',
            text,
          },
        ];
  });
}

/**
 * The app's JSON-LD description, app.jsonld. `icon` is the address of its
 * largest icon when it has one; `publisher` the catalog's WebID.
 */
export function appDescription(root, app, origin, { icon, publisher } = {}) {
  const iri = appIri(origin, app);
  const { about } = app;
  const languages = uiLanguages(app);
  // A name needs no translation, so every language shows at least the base.
  const name = languageMap(
    languages,
    about.lang,
    about.name,
    about.name_localized,
    about.name,
  );
  const description = languageMap(
    languages,
    about.lang,
    about.description,
    about.description_localized,
  );
  const details = detailTexts(root, app, languages);
  return {
    '@context': CONTEXT,
    '@id': iri,
    '@type': 'WebApplication',
    name,
    ...(Object.keys(description).length > 0 ? { description } : {}),
    ...(details.length > 0 ? { subjectOf: details } : {}),
    ...(about.categories ? { applicationCategory: about.categories } : {}),
    inLanguage: languages,
    url: iri,
    ...(icon ? { image: icon } : {}),
    isPartOf: { '@id': `${origin}/` },
    ...(publisher ? { publisher: { '@id': publisher } } : {}),
    identifier: [
      siteIdentity(origin, app).clientId,
      `${iri}${CLIENT_DOCUMENT}`,
    ],
  };
}

/**
 * The Client ID Metadata Document, client.json: the app as a public client
 * without secrets or keys, named in its base language and, with RFC 7591's
 * `#<language>` suffix, in every other language it is shown in. The draft
 * names the authentication methods in `token_endpoint_auth_methods_supported`;
 * the singular RFC 7591 field, which the draft still allows for backwards
 * compatibility, keeps servers that read only it from assuming a secret.
 */
export function clientDocument(app, origin, { icon } = {}) {
  const iri = appIri(origin, app);
  const { about } = app;
  const names = Object.fromEntries(
    uiLanguages(app)
      .filter((language) => language !== about.lang)
      .map((language) => [
        `client_name#${language}`,
        about.name_localized?.[language] ?? about.name,
      ]),
  );
  return {
    client_id: `${iri}${CLIENT_DOCUMENT}`,
    client_name: about.name,
    ...names,
    client_uri: iri,
    ...(icon ? { logo_uri: icon } : {}),
    redirect_uris: [siteIdentity(origin, app).redirectUri],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_methods_supported: ['none'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
  };
}

/** A card of the site catalog: the fields of a description a list shows. */
const CARD_KEYS = [
  '@id',
  '@type',
  'name',
  'description',
  'applicationCategory',
  'inLanguage',
  'url',
  'image',
];

/**
 * The site catalog, /apps.jsonld: the catalog's texts and publisher from
 * apps.json and one card per app, so a reader needs one request for the list.
 */
export function siteCatalog(origin, descriptions, catalog) {
  const text = (base, localized) =>
    catalog?.lang
      ? languageMap(
          [catalog.lang, ...Object.keys(localized ?? {})],
          catalog.lang,
          base,
          localized,
        )
      : base;
  return {
    '@context': CONTEXT,
    '@id': `${origin}/`,
    '@type': 'ItemList',
    ...(catalog?.name
      ? { name: text(catalog.name, catalog.name_localized) }
      : {}),
    ...(catalog?.description
      ? {
          description: text(
            catalog.description,
            catalog.description_localized,
          ),
        }
      : {}),
    ...(catalog?.publisher ? { publisher: { '@id': catalog.publisher } } : {}),
    numberOfItems: descriptions.length,
    itemListElement: descriptions.map((description, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: Object.fromEntries(
        CARD_KEYS.filter((key) => description[key] !== undefined).map(
          (key) => [key, description[key]],
        ),
      ),
    })),
  };
}

/** Every file below `dir`, as paths relative to it with forward slashes. */
function filesBelow(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'),
    );
}

/**
 * build.json: every published file of the app with its address and SHA-256
 * digest, sorted by address. Its own digest is the build's fingerprint: any
 * other content, under any name, gives another one.
 */
export function buildList(appOut, app) {
  const files = filesBelow(appOut)
    .filter((file) => file !== BUILD_LIST)
    .map((file) => ({
      path: `${app.path}${file}`,
      sha256: createHash('sha256')
        .update(readFileSync(join(appOut, file)))
        .digest('hex'),
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files };
}

/**
 * The _headers file Netlify and Cloudflare Pages read: the descriptions may
 * be read from any origin, for example by the store's page. They are public
 * and the request carries no credentials. GitHub Pages sends the header for
 * every file by itself.
 */
export function headersFile(apps) {
  const open = (path) => `${path}\n  Access-Control-Allow-Origin: *`;
  return `# Generated by pnpm run build-site: the published descriptions may be read
# from any origin.
${[`/${SITE_CATALOG}`, ...apps.map((app) => `${app.path}${APP_DESCRIPTION}`)]
  .map(open)
  .join('\n')}
`;
}

/** `value` as a URL resolved against `base`, or undefined. */
function parsed(value, base) {
  if (typeof value !== 'string') return undefined;
  try {
    return new URL(value, base);
  } catch {
    return undefined;
  }
}

/**
 * The addresses a browser takes from a web app manifest served at
 * `manifestUrl`: `start_url` and `scope` resolve against the manifest's
 * address, the `id` against the start URL's origin and without its fragment.
 * An `id` that is missing, invalid or of another origin falls back to the
 * start URL. A field that does not resolve keeps its raw value.
 */
export function manifestAddresses(manifest, manifestUrl) {
  const start = parsed(manifest.start_url, manifestUrl);
  const scope = parsed(manifest.scope, manifestUrl);
  let id;
  if (start) {
    const own = parsed(manifest.id, start.origin);
    id = new URL(own?.origin === start.origin ? own : start);
    id.hash = '';
  }
  return {
    id: id?.href ?? manifest.id,
    start_url: start?.href ?? manifest.start_url,
    scope: scope?.href ?? manifest.scope,
  };
}

/**
 * Where the published documents of one app name it differently: the
 * description, the client document, the DID document and, for a PWA, the
 * built web app manifest must all lead to the app's IRI and identity.
 */
export function identifierProblems(app, origin, { description, client, did, manifest }) {
  const iri = appIri(origin, app);
  const { clientId, redirectUri } = siteIdentity(origin, app);
  const where = `apps/${app.id}`;
  const problems = [];
  const expect = (what, actual, expected) => {
    if (actual !== expected)
      problems.push(
        `${where}: ${what} is ${JSON.stringify(actual)}, not ${JSON.stringify(expected)}`,
      );
  };
  expect(`${APP_DESCRIPTION} @id`, description['@id'], iri);
  expect(`${CLIENT_DOCUMENT} client_uri`, client.client_uri, iri);
  expect(`${CLIENT_DOCUMENT} client_id`, client.client_id, `${iri}${CLIENT_DOCUMENT}`);
  expect('did.json id', did.id, clientId);
  expect(
    `${CLIENT_DOCUMENT} redirect_uris`,
    JSON.stringify(client.redirect_uris),
    JSON.stringify([redirectUri]),
  );
  for (const identifier of [did.id, client.client_id])
    if (!description.identifier?.includes(identifier))
      problems.push(`${where}: ${APP_DESCRIPTION} does not name ${identifier}`);
  if (app.pwa) {
    if (!manifest)
      problems.push(`${where}: the build wrote no manifest.webmanifest`);
    else {
      const addresses = manifestAddresses(manifest, `${iri}manifest.webmanifest`);
      for (const key of ['id', 'start_url', 'scope'])
        expect(`manifest.webmanifest ${key}`, addresses[key], iri);
    }
  }
  // Measured as build-site writes it.
  if (Buffer.byteLength(formatJson(client)) > CLIENT_LIMIT)
    problems.push(
      `${where}: ${CLIENT_DOCUMENT} is larger than ${CLIENT_LIMIT} bytes; shorten the app's names`,
    );
  return problems;
}
