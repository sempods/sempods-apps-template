// The skeleton's themes: one CSS file per theme in src/themes/, which sets the
// --sempods-* tokens in light and dark mode. An app imports one of them in its
// src/main.tsx; its icon takes that theme's accent.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ifPresent } from './json.mjs';
import { SKELETON } from './paths.mjs';

export const DEFAULT_THEME = 'calm';
const THEMES_DIR = join('src', 'themes');
const IMPORT = /^import '\.\/themes\/([a-z-]+)\.css';$/m;

/** The theme names the skeleton ships, the default first. */
export function themeNames(skeleton = SKELETON) {
  const names = readdirSync(join(skeleton, THEMES_DIR))
    .filter((file) => file.endsWith('.css'))
    .map((file) => file.slice(0, -'.css'.length))
    .sort();
  return [DEFAULT_THEME, ...names.filter((name) => name !== DEFAULT_THEME)];
}

/** A token's light and dark colour, from `--name: light-dark(#light, #dark)`. */
export function tokenColours(css, token) {
  const match = css.match(
    new RegExp(
      `--sempods-${token}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`,
      'i',
    ),
  );
  if (!match) throw new Error(`the theme sets no --sempods-${token}`);
  return { light: match[1].toLowerCase(), dark: match[2].toLowerCase() };
}

/**
 * The icon's colours for a theme file: the accent as the square and the text
 * on the accent as the letter, in light and dark mode.
 */
export function iconColours(css) {
  const accent = tokenColours(css, 'accent');
  const on = tokenColours(css, 'on-accent');
  return {
    light: { background: accent.light, letter: on.light },
    dark: { background: accent.dark, letter: on.dark },
  };
}

/** The theme an app imports in src/main.tsx, if it imports one of these. */
export function appTheme(appDir) {
  const main = ifPresent(() =>
    readFileSync(join(appDir, 'src', 'main.tsx'), 'utf8'),
  );
  return main?.match(IMPORT)?.[1];
}

/** The CSS of a theme file in an app or in the skeleton. */
export function themeCss(dir, name) {
  return readFileSync(join(dir, THEMES_DIR, `${name}.css`), 'utf8');
}
