// The skeleton's themes: one CSS file per theme in src/themes/, which sets the
// palette roles of the UI kit's theme contract (--primary, --background, …)
// in light and dark mode. An app imports one of them in its src/index.css;
// its icon takes that theme's primary colour.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ifPresent } from './json.mjs';
import { SKELETON } from './paths.mjs';

export const DEFAULT_THEME = 'sage';
const THEMES_DIR = join('src', 'themes');
// The import line in src/index.css; apps from before the UI kit import their
// theme in src/main.tsx.
const IMPORTS = [
  ['index.css', /^@import '\.\/themes\/([a-z-]+)\.css';$/m],
  ['main.tsx', /^import '\.\/themes\/([a-z-]+)\.css';$/m],
];

/** The theme names the skeleton ships, the default first. */
export function themeNames(skeleton = SKELETON) {
  const names = readdirSync(join(skeleton, THEMES_DIR))
    .filter((file) => file.endsWith('.css'))
    .map((file) => file.slice(0, -'.css'.length))
    .sort();
  return [DEFAULT_THEME, ...names.filter((name) => name !== DEFAULT_THEME)];
}

/**
 * A custom property's light and dark colour, from
 * `--name: light-dark(#light, #dark)`; undefined when the theme lacks it.
 */
export function tokenColours(css, property) {
  const match = css.match(
    new RegExp(
      `(?:^|[\\s;{])--${property}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`,
      'i',
    ),
  );
  return match
    ? { light: match[1].toLowerCase(), dark: match[2].toLowerCase() }
    : undefined;
}

/**
 * The icon's colours for a theme file: the primary role as the square and the
 * text on it as the letter, in light and dark mode. A theme from before the UI
 * kit gives its --sempods-accent tokens instead.
 */
export function iconColours(css) {
  const pair = (background, letter) => {
    const square = tokenColours(css, background);
    const text = tokenColours(css, letter);
    return square && text ? { square, text } : undefined;
  };
  const found =
    pair('primary', 'primary-foreground') ??
    pair('sempods-accent', 'sempods-on-accent');
  if (!found)
    throw new Error(
      'the theme sets no --primary and --primary-foreground in light-dark(#light, #dark)',
    );
  const { square, text } = found;
  return {
    light: { background: square.light, letter: text.light },
    dark: { background: square.dark, letter: text.dark },
  };
}

/** The theme an app imports, if it imports one of these. */
export function appTheme(appDir) {
  for (const [file, pattern] of IMPORTS) {
    const source = ifPresent(() =>
      readFileSync(join(appDir, 'src', file), 'utf8'),
    );
    const name = source?.match(pattern)?.[1];
    if (name) return name;
  }
  return undefined;
}

/** The CSS of a theme file in an app or in the skeleton. */
export function themeCss(dir, name) {
  return readFileSync(join(dir, THEMES_DIR, `${name}.css`), 'utf8');
}

// The manifest's colours when an app imports no theme the tooling can read.
export const PLAIN_COLOURS = { background: '#ffffff', darkBackground: '#111315' };

/**
 * The installed app's colours for the web app manifest: the light background
 * of the theme for the launch screen, and the light primary as a stable brand
 * colour for installed chrome. Widely supported manifest colours are static;
 * the running page sets its background through theme-color meta elements.
 */
export function manifestColours(appDir) {
  const theme = appTheme(appDir);
  const css = theme && ifPresent(() => themeCss(appDir, theme));
  const background = css && tokenColours(css, 'background');
  const primary = css && tokenColours(css, 'primary');
  return background ? {
    background: background.light,
    darkBackground: background.dark,
    theme: primary?.light ?? background.light,
  } : PLAIN_COLOURS;
}
