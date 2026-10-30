// The app's addresses, owned by the app as #114 asks: Focus-like views,
// resource and action paths with the subject in base64url, the legacy query
// form, the callback and explicit not-found pages. Every router adapter uses
// this model; the routers only move through the browser history.

/** The app's path on the site. */
export const BASE = '/focus/';

export type View = 'zen' | 'list';
export type Place =
  | { readonly kind: 'view'; readonly view: View }
  | { readonly kind: 'task'; readonly id: string; readonly action?: 'postpone' }
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

/** The path of a place, below BASE without its leading slash ("" is the start). */
export function pathOf(place: Place): string {
  switch (place.kind) {
    case 'view':
      return place.view === 'zen' ? '' : 'list';
    case 'task':
      return `tasks/${place.id}${place.action ? '/' + place.action : ''}`;
    case 'callback':
      return 'callback';
    case 'not-found':
      return '';
  }
}
export const addressOf = (place: Place) => BASE + pathOf(place);

/**
 * The place of an address and its canonical form. The legacy `?task=<id>`
 * on the start page becomes the task's path; a trailing slash goes.
 */
export function placeOf(pathname: string, search: string): { place: Place; canonical: string } {
  const path = pathname.startsWith(BASE) ? pathname.slice(BASE.length).replace(/\/$/, '') : null;
  const at = (place: Place) => ({ place, canonical: addressOf(place) });
  if (path === null) return { place: { kind: 'not-found', reason: 'unknown' }, canonical: pathname + search };
  if (path === 'callback') return { place: { kind: 'callback' }, canonical: pathname + search };
  const legacy = new URLSearchParams(search).get('task');
  if (path === '' && legacy) return at(decodeSubject(legacy) ? { kind: 'task', id: legacy } : { kind: 'not-found', reason: 'invalid' });
  if (path === '') return at({ kind: 'view', view: 'zen' });
  if (path === 'list') return at({ kind: 'view', view: 'list' });
  const task = /^tasks\/([^/]+)(?:\/(postpone))?$/.exec(path);
  if (task) {
    const id = task[1]!;
    if (!decodeSubject(id)) return { place: { kind: 'not-found', reason: 'invalid' }, canonical: pathname };
    return at({ kind: 'task', id, ...(task[2] ? { action: 'postpone' as const } : {}) });
  }
  return { place: { kind: 'not-found', reason: 'unknown' }, canonical: pathname };
}

/** Where sign-in returns: the current place, never the callback or other paths. */
export function returnAddress(): string {
  const { place, canonical } = placeOf(location.pathname, location.search);
  return place.kind === 'callback' || place.kind === 'not-found' ? BASE : canonical;
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
