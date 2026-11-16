// An app's use of the tooling's exports (@sempods/apps/vite and
// @sempods/apps/browser-theme): the app declares the tooling at its exact
// version, and the migration moves a browser-theme helper copied from the
// skeleton onto the shared one. App code the owner changed stays theirs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { replaceFile } from './files.mjs';
import { readJson, sortedKeys, writeJson } from './json.mjs';
import { PACKAGE } from './shared.mjs';

export const BROWSER_THEME = 'src/browser-theme.ts';
const SHARED_THEME = `${PACKAGE}/browser-theme`;

// The helper the skeleton of 0.11.0-dev.1 copied into each app.
const COPIED_THEME = `/** Browser/PWA chrome follows the resolved app background, including overrides.
 * Remove data-sempods-theme from a meta element to own its colour separately. */
export function syncBrowserTheme() {
  const probe = document.createElement('span');
  probe.style.color = 'var(--background)';
  document.body.append(probe);
  const background = getComputedStyle(probe).color;
  probe.remove();
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"][data-sempods-theme]',
  ))
    meta.content = background;
}

syncBrowserTheme();
const system = matchMedia('(prefers-color-scheme: dark)');
system.addEventListener('change', syncBrowserTheme);
if (import.meta.hot)
  import.meta.hot.dispose(() =>
    system.removeEventListener('change', syncBrowserTheme),
  );
`;

// What replaces an unchanged copy: the same module contract (imported for its
// effect by main.tsx, syncBrowserTheme for appearance settings), with the
// behaviour from the tooling.
export const THEME_BRIDGE = `// The browser's theme colour follows the app's background, also when the
// system's appearance changes. The behaviour comes from ${SHARED_THEME};
// this file keeps the imports of main.tsx and of appearance settings.
import {
  followBrowserTheme,
  syncBrowserTheme,
} from '${SHARED_THEME}';

export { syncBrowserTheme };

const stop = followBrowserTheme();
import.meta.hot?.dispose(stop);
`;

const lines = (text) => text.replace(/\r\n/g, '\n');

/**
 * Declares `version` of the tooling in the app's package.json, where the app
 * declares it already or else in devDependencies. Returns whether it changed.
 */
export function adoptToolingPin(appDir, version) {
  const file = join(appDir, 'package.json');
  const pkg = readJson(file);
  const field = pkg.dependencies?.[PACKAGE] ? 'dependencies' : 'devDependencies';
  if (pkg[field]?.[PACKAGE] === version) return false;
  pkg[field] = sortedKeys({ ...pkg[field], [PACKAGE]: version });
  writeJson(file, pkg);
  return true;
}

/**
 * Moves the skeleton's copied browser-theme helper onto the shared one when
 * the app left it unchanged. Returns `{ changed }` or, for a copy the owner
 * changed, `{ note }`; an app without the copy, or one that already uses the
 * shared helper, gets `{}`.
 */
export function adoptBrowserTheme(appDir, id) {
  const file = join(appDir, BROWSER_THEME);
  let source;
  try {
    source = lines(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
  if (source === COPIED_THEME) {
    // A new file renamed into place: the old or the complete new one remains.
    replaceFile(file, THEME_BRIDGE);
    return { changed: true };
  }
  if (source.includes(`'${SHARED_THEME}'`)) return {};
  return {
    note: `apps/${id}/${BROWSER_THEME} differs from the copy the skeleton shipped and stays as it is. ${SHARED_THEME} now holds this behaviour (followBrowserTheme, syncBrowserTheme): keep the changes that matter to the owner and use the shared helper for the rest, as the skeleton's src/main.tsx does.`,
  };
}
