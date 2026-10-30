// The app's addresses, owned by the app as #114 asks: Focus-like views,
// resource and action paths with the subject in base64url and its source
// Context in the query, a creation route, the legacy forms, the callback and
// explicit not-found pages. Every router adapter uses this model; the
// routers only move through the browser history.

/** The app's path on the site. */
export const BASE = '/focus/';

export type View = 'zen' | 'list';
export type Place =
  | { readonly kind: 'view'; readonly view: View }
  /** `context`: the source Context the address names; never substituted. */
  | { readonly kind: 'task'; readonly id: string; readonly context?: string; readonly action?: 'postpone' }
  | { readonly kind: 'new' }
  | { readonly kind: 'callback' }
  | { readonly kind: 'not-found'; readonly reason: 'unknown' | 'invalid' };

/** UTF-8 base64url, as in Focus's task links. */
export function encodeSubject(subject: string): string {
  const bytes = new TextEncoder().encode(subject);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeSubject(id: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  try {
    const binary = atob(id.replace(/-/g, '+').replace(/_/g, '/'));
    const subject = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    return /^https?:\/\//.test(subject) ? subject : null;
  } catch {
    return null;
  }
}
const absolute = (value: string) => /^https?:\/\/[^\s]+$/.test(value);

/** The path and query of a place, below BASE without its leading slash. */
export function pathOf(place: Place): string {
  switch (place.kind) {
    case 'view':
      return place.view === 'zen' ? '' : 'list';
    case 'task': {
      const path = `tasks/${place.id}${place.action ? '/' + place.action : ''}`;
      return place.context ? `${path}?context=${encodeURIComponent(place.context)}` : path;
    }
    case 'new':
      return 'tasks/add';
    case 'callback':
      return 'callback';
    case 'not-found':
      return '';
  }
}
export const addressOf = (place: Place) => BASE + pathOf(place);

/**
 * The place of an address and its canonical form. Legacy links (`?task=<id>`
 * on the start page, `tasks/new`) become canonical, keeping the source
 * Context; a trailing slash goes. Unknown or invalid addresses keep their
 * address as canonical, so their explicit page stays.
 */
export function placeOf(pathname: string, search: string): { place: Place; canonical: string } {
  const here = pathname + search;
  const path = pathname.startsWith(BASE) ? pathname.slice(BASE.length).replace(/\/$/, '') : null;
  const query = new URLSearchParams(search);
  const at = (place: Place) => ({ place, canonical: addressOf(place) });
  const missing = (reason: 'unknown' | 'invalid') => ({ place: { kind: 'not-found', reason } as Place, canonical: here });
  if (path === null) return missing('unknown');
  if (path === 'callback') return { place: { kind: 'callback' }, canonical: here };
  const context = query.get('context');
  if (context !== null && !absolute(context)) return missing('invalid');
  const task = (id: string, action?: 'postpone') =>
    decodeSubject(id) ? at({ kind: 'task', id, ...(context ? { context } : {}), ...(action ? { action } : {}) }) : missing('invalid');
  const legacy = query.get('task');
  if (path === '' && legacy !== null) return task(legacy);
  if (path === '') return at({ kind: 'view', view: 'zen' });
  if (path === 'list') return at({ kind: 'view', view: 'list' });
  // Literal routes win over the resource pattern below.
  if (path === 'tasks/add' || path === 'tasks/new') return at({ kind: 'new' });
  const match = /^tasks\/([^/]+)(?:\/(postpone))?$/.exec(path);
  if (match) return task(match[1]!, match[2] ? 'postpone' : undefined);
  return missing(/^tasks\//.test(path) ? 'invalid' : 'unknown');
}

/**
 * Where sign-in returns: the address as it is, if it is the app's (below
 * BASE) and not the callback, so even an explicit error shows afterwards;
 * otherwise the start page. Bounded to the app: never another path.
 */
export function returnAddress(): string {
  const address = location.pathname + location.search;
  return address.startsWith(BASE) && !address.startsWith(BASE + 'callback') ? address : BASE;
}

/**
 * What a router adapter gives the screen. Call `useNav` once, in the frame:
 * it owns the history listeners. `go` and Back/Forward run under the SDK's
 * leave policy (its `navigate`): an unsaved edit asks first.
 */
export type Nav = {
  readonly place: Place;
  /** Switch in place; `replace` keeps the history length. */
  go(place: Place, options?: { readonly replace?: boolean }): void;
  /** Leave a resource screen: back to the in-app opener, else replace with the start. */
  close(): void;
  /** Props for an `<a>`: its own address, so modified clicks open a new tab. */
  link(place: Place): { readonly href: string; readonly onClick: (event: React.MouseEvent) => void };
};
export type RouterKit = {
  readonly name: string;
  readonly Root: (props: { readonly children: React.ReactNode }) => React.ReactNode;
  readonly useNav: () => Nav;
  /** For the runtime's `replaceUrl` after sign-in. */
  readonly replaceUrl: (url: string) => void;
};

/** A plain left click without modifiers: switch in place. */
export const plainClick = (event: React.MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
