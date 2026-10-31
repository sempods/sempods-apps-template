// Provided by the sempods UI package: the template's router. Do not edit;
// apps describe their addresses in src/places.ts and use `useNav`.
//
// The History API, the shown entry's position in history.state and the SDK's
// navigate: every switch, Back and Forward asks before an unsaved edit is
// lost, and staying keeps the address, the screen and the history.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useApp } from '@sempods/app-sdk/react';

/** How the app maps its places to addresses and back. */
export type AddressModel<P> = {
  /** The place of an address and its canonical form (replaced in place). */
  parse(pathname: string, search: string): { readonly place: P; readonly canonical: string };
  /** The address of a place: path and query, starting with the app's path. */
  format(place: P): string;
};

export type Nav<P> = {
  readonly place: P;
  /** Switch to a place, as a new history entry, or in place with `replace`. */
  go(place: P, options?: { readonly replace?: boolean }): void;
  /** Leave a screen: back to the in-app screen that opened it, else to `fallback` in place. */
  close(fallback: P): void;
  /** Props for an `<a>`: a real address, so modified clicks open a new tab. */
  link(place: P): { readonly href: string; readonly onClick: (event: React.MouseEvent) => void };
};

// The address the app shows. It changes only through the functions below, so
// a declined navigation keeps the current screen.
let shown = location.pathname + location.search;
let position: number = history.state?.position ?? 0;
if (typeof history.state?.position !== 'number') history.replaceState({ ...history.state, position }, '');
let undoing = false;
let deciding = false;
const listeners = new Set<() => void>();
function show(address: string) {
  shown = address;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** For the runtime's `replaceUrl` after sign-in. */
export function replaceUrl(url: string) {
  history.replaceState({ ...history.state, position }, '', url);
  show(location.pathname + location.search);
}

const plainClick = (event: React.MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/** The current place and navigation. Call it once, in the app's frame, and pass `nav` down. */
export function useNav<P>(model: AddressModel<P>): Nav<P> {
  const address = useSyncExternalStore(subscribe, () => shown);
  const query = address.indexOf('?');
  const { place, canonical } = query < 0 ? model.parse(address, '') : model.parse(address.slice(0, query), address.slice(query));
  const { navigate } = useApp();
  useEffect(() => {
    const onPop = () => {
      if (undoing) {
        undoing = false;
        return;
      }
      if (deciding) return;
      deciding = true;
      void navigate(() => {
        position = history.state?.position ?? position;
        show(location.pathname + location.search);
      }).then((left) => {
        deciding = false;
        const target: unknown = history.state?.position;
        if (left) {
          if (location.pathname + location.search !== shown) onPop();
          return;
        }
        if (typeof target !== 'number') history.replaceState({ ...history.state, position }, '', shown);
        else if (target !== position) {
          undoing = true;
          history.go(position - target);
        }
      });
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, [navigate]);
  useEffect(() => {
    if (address !== canonical) replaceUrl(canonical);
  }, [address, canonical]);
  const { format } = model;
  const go = useCallback(
    (next: P, options?: { readonly replace?: boolean }) => {
      const url = format(next);
      if (url === address) return;
      void navigate(() => {
        if (options?.replace) history.replaceState({ ...history.state, position }, '', url);
        else {
          position += 1;
          history.pushState({ position, opener: address }, '', url);
        }
        show(location.pathname + location.search);
      });
    },
    [navigate, address, format],
  );
  const close = useCallback(
    (fallback: P) => {
      if (typeof history.state?.opener === 'string') history.back();
      else go(fallback, { replace: true });
    },
    [go],
  );
  const link = useCallback(
    (next: P) => ({
      href: format(next),
      onClick: (event: React.MouseEvent) => {
        if (!plainClick(event)) return;
        event.preventDefault();
        go(next);
      },
    }),
    [go, format],
  );
  return { place, go, close, link };
}
