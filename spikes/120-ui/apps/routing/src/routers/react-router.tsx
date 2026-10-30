// React Router 8 (data router, library use): history, links and its blocker.
// Back and Forward are blocked and handed to the SDK's navigate, which asks
// about unsaved edits and decides; programmatic switches run inside navigate.
import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider, useBlocker, useLocation, useNavigate } from 'react-router';
import { useApp } from '@sempods/app-sdk/react';
import { addressOf, BASE, pathOf, placeOf, plainClick, type Nav, type Place, type RouterKit } from '../places.ts';

const Children = createContext<ReactNode>(null);

/** Hands Back and Forward to the SDK: proceed when it leaves, else stay. */
function PopGuard() {
  const { navigate } = useApp();
  const blocker = useBlocker(({ historyAction }) => historyAction === 'POP');
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void navigate(() => blocker.proceed()).then((left) => {
      if (!left) blocker.reset();
    });
  }, [blocker, navigate]);
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
const instance = createBrowserRouter([{ path: '*', element: <Shell /> }], { basename: BASE });

function useNav(): Nav {
  const location = useLocation();
  const to = useNavigate();
  const { navigate } = useApp();
  // React Router reports the path below its basename.
  const { place, canonical } = placeOf(BASE.slice(0, -1) + location.pathname, location.search);
  const current = BASE.slice(0, -1) + location.pathname + location.search;
  useEffect(() => {
    if (current !== canonical && place.kind !== 'callback' && place.kind !== 'not-found')
      void to('/' + canonical.slice(BASE.length), { replace: true, state: location.state });
  }, [current, canonical, place.kind, to, location.state]);
  const go = useCallback(
    (next: Place, options?: { readonly replace?: boolean }) => {
      if (addressOf(next) === current) return;
      void navigate(() => {
        void to('/' + pathOf(next), options?.replace ? { replace: true } : { state: { opener: current } });
      });
    },
    [navigate, to, current],
  );
  const close = useCallback(() => {
    if (typeof (location.state as { opener?: unknown } | null)?.opener === 'string') void to(-1);
    else go({ kind: 'view', view: 'zen' }, { replace: true });
  }, [location.state, to, go]);
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
  name: 'React Router 8.5.1',
  Root: ({ children }: { readonly children: ReactNode }) => (
    <Children.Provider value={children}>
      <RouterProvider router={instance} />
    </Children.Provider>
  ),
  useNav,
  replaceUrl: (url: string) => {
    const target = new URL(url, location.origin);
    void instance.navigate(target.pathname.slice(BASE.length - 1) + target.search, { replace: true });
  },
};
