// Provided by the sempods UI package: React Router 8 set up for sempods
// apps. Do not edit; apps declare their routes and use React Router as usual
// (Link, useNavigate, useParams, useSearchParams, Navigate).
//
// Every navigation, Link, navigate(), Back and Forward included, is paused
// and handed to the SDK's navigate: it asks before an unsaved edit is lost,
// and staying keeps the address, the screen and the history.
import { useEffect } from 'react';
import { createBrowserRouter, Outlet, useBlocker, useNavigate, type RouteObject } from 'react-router';
import { useApp } from '@sempods/app-sdk/react';

/** The app's path on the site. */
export const BASE = '/focus/';

function Guard() {
  const { navigate } = useApp();
  const blocker = useBlocker(true);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void navigate(() => blocker.proceed()).then((left) => {
      if (!left) blocker.reset();
    });
  }, [blocker, navigate]);
  return null;
}

/** The app's router: its routes below BASE, guarded. Create it once, at module level. */
export function createAppRouter(routes: RouteObject[]) {
  const router = createBrowserRouter(
    [
      {
        element: (
          <>
            <Guard />
            <Outlet />
          </>
        ),
        children: routes,
      },
    ],
    { basename: BASE },
  );
  return {
    router,
    /** For the runtime's `replaceUrl` after sign-in. */
    replaceUrl(url: string) {
      const target = new URL(url, location.origin);
      void router.navigate(target.pathname.slice(BASE.length - 1) + target.search, { replace: true });
    },
  };
}

/**
 * Leave a screen: back to the in-app screen that opened it, else to
 * `fallback` in place (after a direct entry there is nothing to go back to).
 */
export function useClose(fallback: string) {
  const navigate = useNavigate();
  return () => {
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (index > 0) void navigate(-1);
    else void navigate(fallback, { replace: true });
  };
}
