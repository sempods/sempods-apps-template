import type { AddressModel } from '@sempods/app-ui';
import { app } from './sempods.generated.ts';

// The app's addresses as places: the start page at the app's path, a view per
// route in apps.json `routes` (for example /<id>/bought), an item per
// resource address (/<id>/items/<id>), the sign-in callback and an explicit
// page for anything else. `useNav(places)` in App.tsx moves between them:
// links, bookmarks and Back work, and an unsaved edit asks first. The address
// model is the app's own; change places and addresses here.

/** A route listed in apps.json. */
export type Route = (typeof app.routes)[number];

export type Place =
  | { readonly kind: 'start' }
  | { readonly kind: 'view'; readonly route: Route }
  /**
   * One item of src/examples/ListScreen.tsx, at `items/<id>`. `context` is
   * the source Context the address names; the item is edited there, never
   * in another one. Rename it with the list (for example `tasks/:id`).
   */
  | {
      readonly kind: 'item';
      readonly subject: string;
      readonly context?: string;
    }
  | { readonly kind: 'callback' }
  | { readonly kind: 'not-found'; readonly reason: 'unknown' | 'invalid' };

/** The resource pattern of an item; apps.json `resources` declares it. */
export const ITEM = 'items/:id';

/** An absolute IRI, as the SDK accepts it: a scheme and a rest. */
const absolute = (value: string) => /^[A-Za-z][A-Za-z0-9+.-]*:\S+$/.test(value);

/** A subject IRI as one path segment: UTF-8 in base64url. */
export function encodeSubject(iri: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(iri))
    binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The subject IRI of a path segment; null when it names none. */
export function decodeSubject(id: string): string | null {
  if (!/^[\w-]+$/.test(id)) return null;
  try {
    const binary = atob(id.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const iri = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return absolute(iri) ? iri : null;
  } catch {
    return null;
  }
}

/**
 * The address model over the app's path, routes and resource patterns. An
 * address the app does not declare in apps.json is not found, so the parser,
 * the host and the installed app always agree.
 */
export function addressModel(config: {
  readonly basePath: string;
  readonly routes: readonly string[];
  readonly resources: readonly string[];
}): AddressModel<Place> {
  const { basePath } = config;
  const model: AddressModel<Place> = {
    format(place) {
      switch (place.kind) {
        case 'start':
        case 'not-found':
          return basePath;
        case 'view':
          return basePath + place.route;
        case 'callback':
          return basePath + 'callback';
        case 'item': {
          const path = `${basePath}items/${encodeSubject(place.subject)}`;
          return place.context
            ? `${path}?context=${encodeURIComponent(place.context)}`
            : path;
        }
      }
    },
    parse(pathname, search) {
      const here = pathname + search;
      // A known address in another form (a trailing slash) becomes its
      // canonical one. Its query stays, so a deep link keeps it through
      // sign-in; parameters the address sets itself come first.
      const known = (place: Place) => {
        const address = model.format(place);
        const own = address.split('?')[1];
        if (own === undefined) return { place, canonical: address + search };
        const set = new URLSearchParams(own);
        const rest = new URLSearchParams(
          [...new URLSearchParams(search)].filter(([key]) => !set.has(key)),
        ).toString();
        return { place, canonical: rest ? `${address}&${rest}` : address };
      };
      // An unknown or invalid address keeps itself, so its page shows the
      // address the person followed.
      const missing = (reason: 'unknown' | 'invalid') => ({
        place: { kind: 'not-found', reason } as const,
        canonical: here,
      });
      if (!(pathname + '/').startsWith(basePath)) return missing('unknown');
      const path = pathname.slice(basePath.length).replace(/\/$/, '');
      // The runtime reads the callback's parameters: it keeps its address.
      if (path === 'callback')
        return { place: { kind: 'callback' }, canonical: here };
      if (path === '') return known({ kind: 'start' });
      // Literal routes win over resource patterns sharing their prefix.
      const route = config.routes.find((r) => r === path);
      if (route !== undefined)
        return known({ kind: 'view', route: route as Route });
      const item = /^items\/([^/]+)$/.exec(path);
      if (item?.[1] && config.resources.includes(ITEM)) {
        const subject = decodeSubject(item[1]);
        const context = new URLSearchParams(search).get('context');
        if (!subject || (context !== null && !absolute(context)))
          return missing('invalid');
        return known({
          kind: 'item',
          subject,
          ...(context ? { context } : {}),
        });
      }
      return missing('unknown');
    },
  };
  return model;
}

/**
 * The address a sign-in callback returns to, kept in the app. A callback
 * without a matching sign-in, for example an expired one, returns to `/` when
 * `returnTo` is a function, as the generated one is; that is the site's
 * overview, so the app's start page takes its place.
 */
export function inApp(url: string): string {
  return url.startsWith(app.basePath) ? url : app.basePath;
}

/** The app's address model; pass it to `useNav` once, in the frame. */
export const places = addressModel(app);
