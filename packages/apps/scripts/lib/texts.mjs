// What `check` asks of an app's texts beyond the shape of app.json: texts in
// every language the app is shown in, and detail texts in Markdown within the
// rules every reader can rely on. check and build-site use it.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { AUTO, LANGUAGES } from './apps.mjs';
import { appDir, DESCRIPTION_FILE, readDescription } from './describe.mjs';

export const DETAILS_FILE = 'details.md';
// The detail text stays small enough for every reader, the store included.
export const DETAILS_LIMIT = 16 * 1024;

/** The languages an app shows: both for "auto", else its one language. */
export const uiLanguages = (app) =>
  app.language === AUTO ? LANGUAGES : [app.language];

const DETAILS = /^details(?:\.([a-z]{2}))?\.md$/;

// Image paths are resolved as a browser does, so dot segments, encoded ones
// included, count where they lead.
const BASE = 'https://app.invalid';

/** Whether `url` is a path that a browser resolves to a file below `path`. */
function below(url, path) {
  if (!url.startsWith('/')) return false;
  let resolved;
  try {
    resolved = new URL(url, `${BASE}/`);
  } catch {
    return false;
  }
  return (
    resolved.origin === BASE &&
    resolved.pathname.startsWith(path) &&
    resolved.pathname.length > path.length &&
    // A server may read an encoded slash as a separator.
    !/%(?:2f|5c)/i.test(resolved.pathname)
  );
}

/** Why `url` may not be a link target or image in a detail text. */
function invalidTarget(url, { image }, app) {
  if (image)
    return below(url, app.path)
      ? undefined
      : `images must come from below ${app.path}, such as ${app.path}screenshot.png`;
  return /^https:\/\/[^\s]+$/.test(url)
    ? undefined
    : 'links must be https:// addresses';
}

/**
 * Lists the problems of one detail text: restricted CommonMark without raw
 * HTML, https links, images only from below the app's path, headings from
 * level 2, at most DETAILS_LIMIT bytes.
 */
export function markdownProblems(text, app, where) {
  if (Buffer.byteLength(text) > DETAILS_LIMIT)
    return [`${where} is larger than ${DETAILS_LIMIT / 1024} KB`];
  const tree = fromMarkdown(text);
  // A reference such as ![shot][1] takes its address from a definition, and
  // only its use decides whether that address is a link or an image. As in
  // CommonMark, the first definition of a label counts.
  const definitions = new Map();
  const collect = (node) => {
    if (node.type === 'definition' && !definitions.has(node.identifier))
      definitions.set(node.identifier, node.url);
    for (const child of node.children ?? []) collect(child);
  };
  collect(tree);
  const problems = [];
  const visit = (node) => {
    const line = node.position ? `${where}:${node.position.start.line}` : where;
    if (node.type === 'html')
      problems.push(`${line}: raw HTML is not allowed; write Markdown`);
    if (node.type === 'heading' && node.depth === 1)
      problems.push(
        `${line}: headings start at level 2 (##); the page shows the app's name above`,
      );
    const url = ['link', 'image'].includes(node.type)
      ? node.url
      : ['linkReference', 'imageReference'].includes(node.type)
        ? definitions.get(node.identifier)
        : undefined;
    if (url !== undefined) {
      const image = node.type.startsWith('image');
      const reason = invalidTarget(url, { image }, app);
      if (reason) problems.push(`${line}: ${reason}`);
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return problems;
}

/**
 * The problems `check` reports for an app's texts beyond app.json's own
 * shape: the base language must be one the app shows, the description needs
 * a translation for each other language it shows, and detail texts must exist
 * for every such language once there is one, each within the Markdown rules.
 * Names need no translation.
 */
export function textCompleteness(root, app) {
  const where = `apps/${app.id}`;
  let description;
  try {
    description = readDescription(root, app.id);
  } catch (error) {
    return [error.message];
  }
  const shown = uiLanguages(app);
  const { lang } = description;
  if (!shown.includes(lang))
    return [
      `${where}/${DESCRIPTION_FILE}: lang is ${lang}, but the app is shown in ${shown.join(' and ')}; write its texts in that language`,
    ];
  const others = shown.filter((language) => language !== lang);
  const problems = [];
  if (description.description !== undefined)
    for (const language of others)
      if (description.description_localized?.[language] === undefined)
        problems.push(
          `${where}/${DESCRIPTION_FILE}: description_localized.${language} is missing; the app is also shown in ${language}`,
        );

  const files = readdirSync(appDir(root, app.id)).filter((name) =>
    DETAILS.test(name),
  );
  for (const name of files) {
    const language = name.match(DETAILS)[1];
    if (language !== undefined && !others.includes(language))
      problems.push(
        `${where}/${name}: ${language === lang ? `details.md holds the text in ${lang}` : `the app is not shown in ${language}`}; remove or rename it`,
      );
  }
  if (files.length > 0) {
    for (const name of [
      DETAILS_FILE,
      ...others.map((language) => `details.${language}.md`),
    ])
      if (!files.includes(name))
        problems.push(
          `${where}/${name} is missing; a detail text exists, so every language the app is shown in needs one`,
        );
    for (const name of files)
      problems.push(
        ...markdownProblems(
          readFileSync(join(appDir(root, app.id), name), 'utf8'),
          app,
          `${where}/${name}`,
        ),
      );
  }
  return problems;
}
