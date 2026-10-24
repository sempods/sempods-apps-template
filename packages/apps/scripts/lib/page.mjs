// The page title comes from apps.json: the generated Vite plugin pageTitle
// adds it to the head, so an app's index.html has no <title> of its own and its
// vite.config.ts uses the plugin. check reports what stands in the way; the
// migration moves apps that still have the skeleton's files.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeHtml } from './html.mjs';
import { ifPresent } from './json.mjs';
import { SKELETON } from './paths.mjs';

export const PAGE = 'index.html';
export const VITE_CONFIG = 'vite.config.ts';

// The skeleton's vite.config.ts from 0.7.0 until the plugin, which the
// migration replaces with the current one.
const VITE_CONFIG_0_7 = `import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { base, pwa, server } from './vite.sempods.generated.ts';

// Base path, development port and PWA settings come from apps.json through the
// generated file; add your own plugins and options here.
export default defineConfig({
  base,
  server,
  preview: server,
  plugins: [react(), ...(pwa ? [VitePWA(pwa)] : [])],
});
`;

// A <title> element in the head; an SVG <title> in the body is not one.
const OWN_TITLE = /<title[\s>]/i;
const head = (html) => html.split(/<body[\s>]/i)[0];
const usesPlugin = (config) => /\bpageTitle\b/.test(config);

/** Why the page would not get its title from apps.json; empty when it does. */
export function pageProblems(appDir, id) {
  const problems = [];
  const html = ifPresent(() => readFileSync(join(appDir, PAGE), 'utf8'));
  if (html !== undefined && OWN_TITLE.test(head(html)))
    problems.push(
      `apps/${id}/${PAGE} has its own <title>; remove it, the page title comes from apps.json`,
    );
  const config = ifPresent(() =>
    readFileSync(join(appDir, VITE_CONFIG), 'utf8'),
  );
  if (config !== undefined && !usesPlugin(config))
    problems.push(
      `apps/${id}/${VITE_CONFIG} does not add pageTitle from vite.sempods.generated.ts to its plugins, so the page has no title`,
    );
  return problems;
}

/**
 * Moves one app to the generated page title where that is unambiguous: a
 * vite.config.ts unchanged from the skeleton gets the plugin, and a page
 * whose only title is the app's title from apps.json loses it. Returns the
 * changed files as apps/<id>/<file>; anything else is left to check.
 */
export function adoptPageTitle(appDir, app) {
  const changed = [];
  const configFile = join(appDir, VITE_CONFIG);
  const config = ifPresent(() => readFileSync(configFile, 'utf8'));
  if (config === VITE_CONFIG_0_7) {
    writeFileSync(
      configFile,
      readFileSync(join(SKELETON, VITE_CONFIG), 'utf8'),
    );
    changed.push(VITE_CONFIG);
  }
  const pageFile = join(appDir, PAGE);
  const html = ifPresent(() => readFileSync(pageFile, 'utf8'));
  const line = new RegExp(
    `^[ \\t]*<title>${escapeRegExp(escapeHtml(app.title))}</title>[ \\t]*\\r?\\n`,
    'm',
  );
  if (
    html !== undefined &&
    (changed.length > 0 || usesPlugin(config ?? '')) &&
    head(html).match(/<title[\s>]/gi)?.length === 1 &&
    line.test(head(html))
  ) {
    writeFileSync(pageFile, html.replace(line, ''));
    changed.push(PAGE);
  }
  return changed.map((file) => `apps/${app.id}/${file}`);
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
