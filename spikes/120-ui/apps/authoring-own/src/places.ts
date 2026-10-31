// The app's addresses: views, the task screen and its "Not today" action,
// the creation screen, legacy links and explicit not-found pages. The task's
// subject is base64url in the path, its source Context in the query.
import type { AddressModel } from './sempods/router.tsx';

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

function format(place: Place): string {
  switch (place.kind) {
    case 'view':
      return BASE + (place.view === 'zen' ? '' : 'list');
    case 'task': {
      const path = `${BASE}tasks/${place.id}${place.action ? '/' + place.action : ''}`;
      return place.context ? `${path}?context=${encodeURIComponent(place.context)}` : path;
    }
    case 'new':
      return BASE + 'tasks/add';
    case 'callback':
      return BASE + 'callback';
    case 'not-found':
      return BASE;
  }
}

/**
 * Legacy links (`?task=<id>` on the start page, `tasks/new`) become
 * canonical, keeping the source Context; a trailing slash goes. Unknown or
 * invalid addresses keep their address, so their explicit page stays.
 */
function parse(pathname: string, search: string): { place: Place; canonical: string } {
  const here = pathname + search;
  const path = pathname.startsWith(BASE) ? pathname.slice(BASE.length).replace(/\/$/, '') : null;
  const query = new URLSearchParams(search);
  const at = (place: Place) => ({ place, canonical: format(place) });
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
  // Literal addresses come before the task pattern.
  if (path === 'tasks/add' || path === 'tasks/new') return at({ kind: 'new' });
  const match = /^tasks\/([^/]+)(?:\/(postpone))?$/.exec(path);
  if (match) return task(match[1]!, match[2] ? 'postpone' : undefined);
  return missing(/^tasks\//.test(path) ? 'invalid' : 'unknown');
}

export const places: AddressModel<Place> = { parse, format };

/** Where sign-in returns: this address if it is the app's, else the start page. */
export function returnAddress(): string {
  const address = location.pathname + location.search;
  return address.startsWith(BASE) && !address.startsWith(BASE + 'callback') ? address : BASE;
}
