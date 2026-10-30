// The template's own router (skeleton routes.ts), extended from static views
// to the app's resource and action paths. No library: the History API, the
// shown entry's position in history.state, and the SDK's navigate.
import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useApp } from '@sempods/app-sdk/react';
import { addressOf, placeOf, plainClick, type Nav, type Place, type RouterKit } from '../places.ts';

// The address the app shows. It changes only through the functions below, so
// a declined navigation keeps the current view.
let shown = location.pathname + location.search;
// The position of the shown entry in the session history, kept in its state,
// so a declined back or forward can return to it without a new entry.
let position: number = history.state?.position ?? 0;
// Set while the router itself undoes a step, whose popstate it ignores.
let undoing = false;
const listeners = new Set<() => void>();
function show(address: string) {
  shown = address;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

function replaceUrl(url: string) {
  history.replaceState({ ...history.state, position }, '', url);
  show(location.pathname + location.search);
}

function useNav(): Nav {
  const address = useSyncExternalStore(subscribe, () => shown);
  const query = address.indexOf('?');
  const { place, canonical } = query < 0 ? placeOf(address, '') : placeOf(address.slice(0, query), address.slice(query));
  const { navigate } = useApp();
  useEffect(() => {
    const onPop = () => {
      if (undoing) {
        undoing = false;
        return;
      }
      const to = location.pathname + location.search;
      const target: number = history.state?.position ?? 0;
      void navigate(() => {
        position = target;
        show(to);
      }).then((left) => {
        // Staying: step back to the shown entry; the history stays intact.
        if (left || target === position) return;
        undoing = true;
        history.go(position - target);
      });
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, [navigate]);
  // Legacy and non-canonical addresses become canonical without history.
  useEffect(() => {
    if (address !== canonical) replaceUrl(canonical);
  }, [address, canonical]);
  const go = useCallback(
    (next: Place, options?: { readonly replace?: boolean }) => {
      const url = addressOf(next);
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
    [navigate, address],
  );
  const close = useCallback(() => {
    if (typeof history.state?.opener === 'string') history.back();
    else go({ kind: 'view', view: 'zen' }, { replace: true });
  }, [go]);
  const link = useCallback(
    (next: Place) => ({
      href: addressOf(next),
      onClick: (event: React.MouseEvent) => {
        if (!plainClick(event)) return;
        event.preventDefault();
        go(next);
      },
    }),
    [go],
  );
  return { place, go, close, link };
}

export const router: RouterKit = {
  name: 'own (template routes.ts)',
  Root: ({ children }: { readonly children: ReactNode }) => children,
  useNav,
  replaceUrl,
};
