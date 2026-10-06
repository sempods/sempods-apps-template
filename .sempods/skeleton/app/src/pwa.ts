// Adapted from the sempods TypeScript SDK v0.2.0 recipe
// examples/todo/pwa/register.tsx, licensed under Apache-2.0; see
// the LICENSE and NOTICE of the @sempods/app-sdk package. Changes: this header; the notice
// component moved to NewVersionNotice.tsx.
/**
 * Registers the app's service worker. Call it once from the app entry, never on
 * library import. Resolves to undefined where service workers are unavailable
 * (plain HTTP other than loopback, blocked by policy) or registration fails:
 * the app keeps working as an ordinary page.
 */
export function registerAppWorker(
  url = '/sw.js',
): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return Promise.resolve(undefined);
  // The default scope is the worker's directory: '/' for /sw.js, '/tasks/' for
  // /tasks/sw.js. That scope is also the worker's base path.
  return navigator.serviceWorker.register(url).catch(() => undefined);
}
