// @sempods/apps/vite: the build and development behaviour every app shares.
// An app's generated vite.sempods.generated.ts calls it with the app's data
// from apps.json and app.json; its vite.config.ts stays the app's own. Runs in
// Node, inside Vite; nothing here reaches the browser bundle.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeHtml } from '../scripts/lib/html.mjs';

const TOUCH_ICON = 'apple-touch-icon.png';

// An apple-touch-icon link of the page's own, outside comments, in any
// attribute quoting: the page keeps it and gets none added.
const OWN_TOUCH_ICON =
  /<link\b[^>]*\srel\s*=\s*(?:"(?:[^"]*\s)?apple-touch-icon(?:\s[^"]*)?"|'(?:[^']*\s)?apple-touch-icon(?:\s[^']*)?'|apple-touch-icon(?=[\s>]))/i;
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;

/**
 * The page plugin: the static title from app.json, the link to the app's
 * published description, the theme's initial light/dark colours and the name
 * for the browser chrome and the startup splash, resolved for every page Vite
 * serves or builds. It also emits the content-addressed launcher icons at
 * build time, serves the same bytes in development and adds the Apple touch
 * icon link. Links are absolute, since the same page answers the app's
 * routes.
 */
export function sempodsPage({
  app,
  base,
  title,
  splashName,
  colours,
  icons = {},
  publicDir,
}) {
  const file = (name) =>
    typeof publicDir === 'string'
      ? join(publicDir, name)
      : new URL(name, publicDir);
  // Different bytes get a different URL: the digest in the name must match.
  // Originals stay the inputs; an icon is never derived from an emitted one.
  const readIcon = (path) => {
    const source = file(icons[path]);
    if (!existsSync(source))
      throw new Error(
        `Icon missing: public/${icons[path]}. Restore it with pnpm run icon ${app}, then run pnpm run regenerate before building or serving.`,
      );
    const bytes = readFileSync(source);
    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    if (!path.endsWith(`-${digest}.png`))
      throw new Error(
        'Icon changed: run pnpm run regenerate before building or serving.',
      );
    return bytes;
  };
  const touchIcon = Object.keys(icons).find(
    (path) => icons[path] === TOUCH_ICON,
  );
  const fill = {
    __THEME_LIGHT__: colours.light,
    __THEME_DARK__: colours.dark,
    __THEME_TEXT_LIGHT__: colours.text,
    __THEME_TEXT_DARK__: colours.darkText,
    __APP_NAME__: escapeHtml(splashName),
  };
  return {
    name: 'sempods-page-title',
    generateBundle() {
      for (const fileName of Object.keys(icons))
        this.emitFile({ type: 'asset', fileName, source: readIcon(fileName) });
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname;
        const name = path.startsWith(base) ? path.slice(base.length) : '';
        if (!Object.hasOwn(icons, name)) return next();
        try {
          response.setHeader('Content-Type', 'image/png');
          response.end(readIcon(name));
        } catch (error) {
          next(error);
        }
      });
    },
    transformIndexHtml: (html) => ({
      html: Object.entries(fill).reduce(
        (page, [placeholder, value]) => page.replaceAll(placeholder, () => value),
        html,
      ),
      tags: [
        ...(touchIcon && !OWN_TOUCH_ICON.test(html.replace(COMMENT, ''))
          ? [
              {
                tag: 'link',
                attrs: {
                  rel: 'apple-touch-icon',
                  sizes: '180x180',
                  href: `${base}${touchIcon}`,
                },
                injectTo: 'head',
              },
            ]
          : []),
        { tag: 'title', children: escapeHtml(title), injectTo: 'head' },
        {
          tag: 'link',
          attrs: {
            rel: 'alternate',
            type: 'application/ld+json',
            href: `${base}app.jsonld`,
          },
          injectTo: 'head',
        },
      ],
    }),
  };
}

/**
 * The vite-plugin-pwa options of an installable app: its manifest with the
 * app's path as identity, start and scope, and a service worker that the app
 * registers itself (src/pwa.ts) and that never takes over an open page: an
 * update applies once every window is closed.
 */
export function sempodsPwa({ base, manifest, addresses }) {
  const { background_color, theme_color, icons, ...about } = manifest;
  return {
    registerType: 'prompt',
    injectRegister: false,
    manifest: {
      id: base,
      ...about,
      start_url: base,
      scope: base,
      display: 'standalone',
      background_color,
      theme_color,
      icons,
    },
    workbox: {
      // Precache the built shell only; nothing is cached at runtime.
      globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
      runtimeCaching: [],
      // Serve the cached shell only for the app's own addresses, with any
      // query. The callback, Pod and login pages always go to the network.
      navigateFallback: `${base}index.html`,
      navigateFallbackAllowlist: [addresses],
      skipWaiting: false,
      clientsClaim: false,
      cleanupOutdatedCaches: true,
    },
  };
}
