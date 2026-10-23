import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useApp } from '@sempods/app-sdk/react';
import { app } from './sempods.generated.ts';

// The app's views as addresses: the start page at the app's path and one
// route per entry in apps.json `routes` (for example /<id>/bought). Links,
// bookmarks and the back button work, and the published site answers every
// route without rewrites.

/** A route listed in apps.json; undefined is the start page. */
export type Route = (typeof app.routes)[number];

/** The route of an address; undefined for the start page and unknown paths. */
export function routeOf<R extends string>(
  path: string,
  routes: readonly R[],
  base: string,
): R | undefined {
  if (!path.startsWith(base)) return undefined;
  const segment = path.slice(base.length).replace(/\/$/, '');
  return routes.find((route) => route === segment);
}

/** The address of a route; the start page is the app's path. */
export function pathOf(route: string | undefined, base: string): string {
  return route === undefined ? base : `${base}${route}`;
}

// The address the app shows. It changes only through the functions below, so
// a declined navigation keeps the current view.
let shown = typeof location === 'object' ? location.pathname : '';
// The position of the shown entry in the session history, kept in its state,
// so a declined back or forward can return to it without a new entry.
let position: number =
  typeof history === 'object' ? (history.state?.position ?? 0) : 0;
// Set while the router itself undoes a step, whose popstate it ignores.
let undoing = false;
const listeners = new Set<() => void>();
function show(path: string) {
  shown = path;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/**
 * Replaces the address without a new history entry. Pass it to the runtime
 * (`replaceUrl`), so the return to the original route after a sign-in shows
 * that route.
 */
export function replaceUrl(url: string) {
  history.replaceState({ position }, '', url);
  show(location.pathname);
}

/**
 * The current route and `go` to switch it. Switching, back and forward run
 * under the SDK's leave policy: an unsaved edit asks first, and staying keeps
 * the view, its address and the history. Call it once, in the app's frame, and pass the
 * route down.
 */
export function useRoute() {
  const path = useSyncExternalStore(subscribe, () => shown);
  const route: Route | undefined = routeOf(path, app.routes, app.basePath);
  const { navigate } = useApp();

  useEffect(() => {
    const onPop = () => {
      if (undoing) {
        undoing = false;
        return;
      }
      const to = location.pathname;
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

  // One address per view: unknown paths show the start page, and a trailing
  // slash goes. The callback keeps its address until the runtime has read it.
  useEffect(() => {
    const normal = pathOf(route, app.basePath);
    if (path !== normal && path !== `${app.basePath}callback`)
      replaceUrl(normal + location.search + location.hash);
  }, [path, route]);

  const go = useCallback(
    (next: Route | undefined) => {
      if (next === route) return;
      void navigate(() => {
        position += 1;
        history.pushState({ position }, '', pathOf(next, app.basePath));
        show(location.pathname);
      });
    },
    [navigate, route],
  );
  return { route, go };
}
