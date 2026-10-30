// TanStack Router 1 (code-based route tree): history, links and its blocker.
// Back and Forward ask the SDK's navigate before they apply; programmatic
// switches run inside navigate.
import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useBlocker,
  useLocation,
  useRouter,
} from '@tanstack/react-router';
import { useApp } from '@sempods/app-sdk/react';
import { addressOf, BASE, placeOf, plainClick, type Nav, type Place, type RouterKit } from '../places.ts';

const Children = createContext<ReactNode>(null);

/** Back and Forward wait for the SDK; it asks about unsaved edits. */
function PopGuard() {
  const { navigate } = useApp();
  useBlocker({
    shouldBlockFn: async ({ action }) => {
      if (action === 'PUSH' || action === 'REPLACE') return false;
      return !(await navigate(() => {}));
    },
    enableBeforeUnload: false,
  });
  return null;
}
function Shell() {
  return (
    <>
      <PopGuard />
      {useContext(Children)}
    </>
  );
}
// The app's paths as routes; the app's own model (places.ts) reads them, so
// unknown paths render the same shell and show the app's not-found page.
const root = createRootRoute({ component: Shell, notFoundComponent: () => null });
const tree = root.addChildren([
  createRoute({ getParentRoute: () => root, path: '/' }),
  createRoute({ getParentRoute: () => root, path: '/list' }),
  createRoute({ getParentRoute: () => root, path: '/tasks/$id' }),
  createRoute({ getParentRoute: () => root, path: '/tasks/$id/postpone' }),
  createRoute({ getParentRoute: () => root, path: '/callback' }),
]);
const instance = createRouter({ routeTree: tree, basepath: BASE.slice(0, -1) });

function useNav(): Nav {
  const location = useLocation();
  const router = useRouter();
  const { navigate } = useApp();
  // The browser path, whether the router reports it with or without its basepath.
  const raw = location.pathname.startsWith(BASE.slice(0, -1)) ? location.pathname : BASE.slice(0, -1) + location.pathname;
  const pathname = raw === BASE.slice(0, -1) ? BASE : raw;
  const search = location.searchStr;
  const { place, canonical } = placeOf(pathname, search);
  const current = pathname + search;
  const state = location.state as { opener?: unknown };
  useEffect(() => {
    if (current !== canonical && place.kind !== 'callback' && place.kind !== 'not-found')
      router.history.replace(canonical, location.state);
  }, [current, canonical, place.kind, router, location.state]);
  const go = useCallback(
    (next: Place, options?: { readonly replace?: boolean }) => {
      if (addressOf(next) === current) return;
      void navigate(() => {
        if (options?.replace) router.history.replace(addressOf(next));
        else router.history.push(addressOf(next), { opener: current } as never);
      });
    },
    [navigate, router, current],
  );
  const close = useCallback(() => {
    if (typeof state?.opener === 'string') router.history.back();
    else go({ kind: 'view', view: 'zen' }, { replace: true });
  }, [state, router, go]);
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
  name: 'TanStack Router 1.170.46',
  Root: ({ children }: { readonly children: ReactNode }) => (
    <Children.Provider value={children}>
      <RouterProvider router={instance} />
    </Children.Provider>
  ),
  useNav,
  replaceUrl: (url: string) => {
    const target = new URL(url, location.origin);
    instance.history.replace(target.pathname + target.search);
  },
};
