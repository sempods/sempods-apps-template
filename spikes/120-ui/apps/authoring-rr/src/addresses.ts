// The app's addresses: the task's subject is base64url in the path, its
// source Context in the query. Paths here are below the router's basename.
import { BASE } from './sempods/router.tsx';

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
/** A source Context named in an address must be an absolute IRI. */
export const validContext = (value: string | null) => value === null || /^https?:\/\/[^\s]+$/.test(value);

/** The task screen's path, naming the source Context. */
export function taskPath(subject: string, context?: string, action?: 'postpone'): string {
  const path = `/tasks/${encodeSubject(subject)}${action ? '/' + action : ''}`;
  return context ? `${path}?context=${encodeURIComponent(context)}` : path;
}

/** Where sign-in returns: this address if it is the app's, else the start page. */
export function returnAddress(): string {
  const address = location.pathname + location.search;
  return address.startsWith(BASE) && !address.startsWith(BASE + 'callback') ? address : BASE;
}
