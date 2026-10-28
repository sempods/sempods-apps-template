#!/usr/bin/env node
// Draws an app's icon again: the monogram of its title in apps.json, in the
// accent of the theme its src/main.tsx imports, for example after a rename or
// a theme change. It replaces public/favicon.svg, icon-192.png and
// icon-512.png. Usage: pnpm run icon <id>
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readApps } from './lib/apps.mjs';
import { writeAppIcons } from './lib/icon.mjs';
import { repositoryRoot } from './lib/paths.mjs';
import { scriptArgs } from './lib/pnpm.mjs';
import { appTheme, iconColours, themeCss } from './lib/themes.mjs';

/** Writes the icons of app `id`; returns them as apps/<id>/<file>. */
export function drawIcon(root, id) {
  const app = readApps(root).apps.find((entry) => entry.id === id);
  if (!app) throw new Error(`apps.json lists no app "${id}"`);
  const dir = join(root, 'apps', id);
  if (!existsSync(dir)) throw new Error(`apps/${id} is missing`);
  const theme = appTheme(dir);
  if (!theme || !existsSync(join(dir, 'src', 'themes', `${theme}.css`)))
    throw new Error(
      `apps/${id}/src/main.tsx imports no theme from src/themes/; import one as the skeleton does, then run this again`,
    );
  return writeAppIcons(dir, app.title, iconColours(themeCss(dir, theme))).map(
    (file) => `apps/${id}/${file}`,
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
    const files = drawIcon(repositoryRoot(), id);
    console.log(`Drew:\n${files.map((file) => `  ${file}`).join('\n')}`);
  } catch (error) {
    console.error(`icon: ${error.message}`);
    process.exitCode = 1;
  }
}
