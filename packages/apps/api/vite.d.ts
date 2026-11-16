// Types of @sempods/apps/vite. vite and vite-plugin-pwa are optional peer
// dependencies: an app that uses this export declares both itself.
import type { Plugin } from 'vite';
import type { ManifestOptions, VitePWAOptions } from 'vite-plugin-pwa';

/** The page's initial colours, from the app's theme. */
export interface PageColours {
  /** Light background: browser chrome and splash. */
  readonly light: string;
  /** Dark background. */
  readonly dark: string;
  /** Light text of the splash. */
  readonly text: string;
  /** Dark text of the splash. */
  readonly darkText: string;
}

export interface PageOptions {
  /** The app's ID, named in recovery commands. */
  readonly app: string;
  /** The app's path, for example `/tasks/`, with both slashes. */
  readonly base: string;
  /** The page title (`<title>`), as plain text. */
  readonly title: string;
  /** The name the startup splash shows, as plain text. */
  readonly splashName: string;
  readonly colours: PageColours;
  /**
   * Content-addressed launcher icons: the published path below `base`, whose
   * name ends in `-<digest>.png`, mapped to its source file in `publicDir`.
   * The entry for `apple-touch-icon.png` also becomes the page's Apple touch
   * icon link unless the page has one of its own.
   */
  readonly icons?: Readonly<Record<string, string>>;
  /** The app's `public/` directory: a directory URL ending in `/`, or a path. */
  readonly publicDir: URL | string;
}

/**
 * The page plugin: title, description link, initial colours, splash name and
 * launcher icons for every page Vite serves or builds. Building or serving
 * fails with a recovery command when an icon is missing or its bytes no
 * longer match its digest.
 */
export function sempodsPage(options: PageOptions): Plugin;

/** The options vite.config.ts passes to `VitePWA`. */
export type PwaOptions = Partial<VitePWAOptions>;

/**
 * The app's own manifest members; `sempodsPwa` adds `id`, `start_url`,
 * `scope` and `display`. The translations (`name_localized` and the like,
 * Chrome and Edge 148) are newer than the plugin's types, hence the wider
 * type.
 */
export type AppManifest = Partial<
  Omit<ManifestOptions, 'id' | 'start_url' | 'scope' | 'display'>
> &
  Record<`${string}_localized`, Record<string, string>>;

export interface PwaSettings {
  /** The app's path: identity, start address and scope of the manifest. */
  readonly base: string;
  readonly manifest: AppManifest;
  /**
   * The addresses the cached shell answers offline, with any query: the
   * start page, the app's routes and its resource patterns.
   */
  readonly addresses: RegExp;
}

/** The vite-plugin-pwa options of an installable app. */
export function sempodsPwa(settings: PwaSettings): PwaOptions;
