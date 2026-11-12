#!/usr/bin/env node
// Draws an app's icon again: from the owner's apps/<id>/icon.svg when there
// is one, otherwise the monogram of its name in app.json in the accent of the
// theme its src/index.css imports, for example after a rename or a theme
// change. It replaces public/favicon.svg, icon-192.png, icon-512.png and
// icon-maskable-512.png. Usage: pnpm run icon <id>
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, MISSING_BROWSER } from './check-theme.mjs';
import { readApps } from './lib/apps.mjs';
import { describedApp } from './lib/describe.mjs';
import { OWNER_ICON, writeAppIcons, writeOwnerIcons } from './lib/icon.mjs';
import { repositoryRoot } from './lib/paths.mjs';
import { scriptArgs } from './lib/pnpm.mjs';
import {
  appTheme,
  iconColours,
  manifestColours,
  themeCss,
} from './lib/themes.mjs';

/**
 * Writes the icons of app `id`; returns them as apps/<id>/<file>. `browser`
 * starts the browser that draws an owner's icon.svg.
 */
export async function drawIcon(root, id, { browser: start = launch } = {}) {
  const entry = readApps(root).apps.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`apps.json lists no app "${id}"`);
  const dir = join(root, 'apps', id);
  if (!existsSync(dir)) throw new Error(`apps/${id} is missing`);
  const app = describedApp(root, entry);
  const inside = (files) => files.map((file) => `apps/${id}/${file}`);
  const own = join(dir, OWNER_ICON);
  if (existsSync(own)) {
    let browser;
    try {
      browser = await start();
    } catch (error) {
      if (error.message === MISSING_BROWSER)
        throw new Error(
          `the browser that draws ${OWNER_ICON} is missing: run pnpm run check:theme --install-browser once, then pnpm run icon ${id} again`,
        );
      throw error;
    }
    try {
      return inside(
        await writeOwnerIcons(
          dir,
          readFileSync(own, 'utf8'),
          manifestColours(dir).background,
          browser,
        ),
      );
    } finally {
      await browser.close();
    }
  }
  const theme = appTheme(dir);
  if (!theme || !existsSync(join(dir, 'src', 'themes', `${theme}.css`)))
    throw new Error(
      `apps/${id}/src/index.css imports no theme from src/themes/; import one as the skeleton does, then run this again`,
    );
  return inside(
    writeAppIcons(dir, app.title, iconColours(themeCss(dir, theme))),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [id, ...rest] = scriptArgs();
  if (!id || rest.length > 0) {
    console.error('Usage: pnpm run icon <id>');
    process.exit(2);
  }
  try {
    const files = await drawIcon(repositoryRoot(), id);
    console.log(`Drew:\n${files.map((file) => `  ${file}`).join('\n')}`);
  } catch (error) {
    console.error(`icon: ${error.message}`);
    process.exitCode = 1;
  }
}
