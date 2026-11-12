// The owner's description of one app: apps/<id>/app.json with its name,
// description and categories in the Web App Manifest's field names, and an
// optional detail text in Markdown, details.md and details.<lang>.md. The
// generated configuration, the manifest and the overview are built from it;
// apps.json keeps only where and how an app runs.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  appsFile,
  AUTO,
  invalidDescription,
  invalidId,
  invalidName,
  LANGUAGES,
  LEGACY_SCHEMA_VERSION,
  readApps,
  SCHEMA_VERSION,
  textProblems,
} from './apps.mjs';
import { ifPresent, readJson, writeJson } from './json.mjs';

export const DESCRIPTION_FILE = 'app.json';

// The manifest's known categories
// (https://github.com/w3c/manifest/wiki/Categories).
export const CATEGORIES = [
  'books',
  'business',
  'education',
  'entertainment',
  'finance',
  'fitness',
  'food',
  'games',
  'government',
  'health',
  'kids',
  'lifestyle',
  'magazines',
  'medical',
  'music',
  'navigation',
  'news',
  'personalization',
  'photo',
  'politics',
  'productivity',
  'security',
  'shopping',
  'social',
  'sports',
  'travel',
  'utilities',
  'weather',
];

const TEXT_FIELDS = {
  name: { invalid: invalidName, required: true },
  short_name: { invalid: invalidName },
  description: { invalid: invalidDescription },
};
const KEYS = new Set([
  'lang',
  'categories',
  ...Object.keys(TEXT_FIELDS).flatMap((field) => [field, `${field}_localized`]),
]);

/** Lists every problem of a parsed app.json, named as `where`. */
export function validateDescription(description, where = DESCRIPTION_FILE) {
  if (
    description === null ||
    typeof description !== 'object' ||
    Array.isArray(description)
  )
    return [`${where} must be an object`];
  const problems = [];
  for (const key of Object.keys(description))
    if (!KEYS.has(key)) problems.push(`${where}: ${key} is not a known field`);
  problems.push(...textProblems(where, description, TEXT_FIELDS));
  const { categories } = description;
  if (categories !== undefined) {
    if (!Array.isArray(categories))
      problems.push(`${where}.categories must be a list`);
    else
      categories.forEach((category, i) => {
        if (!CATEGORIES.includes(category))
          problems.push(
            `${where}.categories: ${JSON.stringify(category)} is not a known category (${CATEGORIES.join(', ')})`,
          );
        else if (categories.indexOf(category) !== i)
          problems.push(`${where}.categories: ${category} is listed twice`);
      });
  }
  return problems;
}

export const appDir = (root, id) => join(root, 'apps', id);

/** Reads and validates apps/<id>/app.json. Throws when it is missing or invalid. */
export function readDescription(root, id) {
  const where = `apps/${id}/${DESCRIPTION_FILE}`;
  const description = ifPresent(() =>
    readJson(join(appDir(root, id), DESCRIPTION_FILE)),
  );
  if (description === undefined)
    throw new Error(
      `${where} is missing; it holds the app's name and description`,
    );
  const problems = validateDescription(description, where);
  if (problems.length > 0) throw new Error(problems.join('; '));
  return description;
}

export function writeDescription(dir, description) {
  writeJson(join(dir, DESCRIPTION_FILE), description);
}

/**
 * One app of apps.json with its title and description from app.json: the
 * shape the generator, the icon and the overview work with.
 */
export function describedApp(root, app) {
  const { name, description } = readDescription(root, app.id);
  return {
    ...app,
    title: name.trim(),
    ...(description === undefined ? {} : { description: description.trim() }),
  };
}

/** apps.json with every app described. Throws when an app.json is missing. */
export function describedApps(root) {
  const manifest = readApps(root);
  return {
    ...manifest,
    apps: manifest.apps.map((app) => describedApp(root, app)),
  };
}

const legacyText = (value) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/**
 * Why an app.json that exists before the migration cannot take the place of
 * apps.json's title and description, otherwise undefined. app.json was not
 * reserved before schema 2, so it may hold something else entirely.
 */
function collision(file, path, title, description) {
  let existing;
  try {
    existing = readJson(path);
  } catch {
    return `${file} already exists and is not a JSON file`;
  }
  if (validateDescription(existing, file).length > 0)
    return `${file} already exists and is not an app description`;
  const differs = [
    ['title', title, existing.name],
    ['description', description, existing.description],
  ].filter(
    ([, old, current]) =>
      old !== undefined && old !== current?.trim(),
  );
  if (differs.length > 0)
    return `${file} already exists with another ${differs.map(([key]) => key).join(' and ')} than apps.json`;
  return undefined;
}

/**
 * Moves each app's title and description from a schema 1 apps.json into a new
 * apps/<id>/app.json and raises the schema version. Does nothing for any other
 * apps.json. Returns the changed files and notes for the owner's assistant.
 * Throws, before it changes anything, when an app.json already exists and is
 * not the same description, so neither text is lost.
 */
export function adoptDescriptions(root) {
  const manifest = ifPresent(() => readJson(appsFile(root)));
  const result = { changed: [], notes: [] };
  if (
    manifest?.schemaVersion !== LEGACY_SCHEMA_VERSION ||
    !Array.isArray(manifest.apps)
  )
    return result;
  const known = (entry) =>
    entry !== null && typeof entry === 'object' && !invalidId(entry.id);
  const collisions = manifest.apps.filter(known).flatMap((entry) => {
    const path = join(appDir(root, entry.id), DESCRIPTION_FILE);
    if (!existsSync(path)) return [];
    const reason = collision(
      `apps/${entry.id}/${DESCRIPTION_FILE}`,
      path,
      legacyText(entry.title),
      legacyText(entry.description),
    );
    return reason ? [reason] : [];
  });
  if (collisions.length > 0)
    throw new Error(
      `${collisions.join('; ')}. From this version on, ${DESCRIPTION_FILE} holds an app's name and description. Move a file that holds something else elsewhere; where both hold texts, keep the right ones in ${DESCRIPTION_FILE} and remove title and description from that app in apps.json. Then run the same command again. apps.json was not changed.`,
    );
  const apps = manifest.apps.map((entry) => {
    if (!known(entry)) return entry;
    const { title, description, ...rest } = entry;
    const dir = appDir(root, entry.id);
    const file = `apps/${entry.id}/${DESCRIPTION_FILE}`;
    if (!existsSync(dir)) {
      result.notes.push(
        `apps/${entry.id} is missing, so its title ${JSON.stringify(title)} was not kept`,
      );
      return rest;
    }
    // Checked above: the same texts are already there.
    if (existsSync(join(dir, DESCRIPTION_FILE))) return rest;
    const lang = LANGUAGES.includes(entry.language) ? entry.language : 'en';
    const text = legacyText(description);
    writeDescription(dir, {
      lang,
      name: legacyText(title) ?? entry.id,
      ...(text === undefined ? {} : { description: text }),
    });
    result.changed.push(file);
    if (entry.language === AUTO)
      result.notes.push(
        `${file}: the app follows the browser's language, and its texts were taken as English (lang "en"). If they are German, set lang to "de"; then add the description in the other language as description_localized. pnpm run check lists what is missing.`,
      );
    return rest;
  });
  // The order and anything else in apps.json stay as they were.
  writeJson(appsFile(root), {
    ...manifest,
    schemaVersion: SCHEMA_VERSION,
    apps,
  });
  result.changed.push('apps.json');
  return result;
}
