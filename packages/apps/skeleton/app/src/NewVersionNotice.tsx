// Adapted from the sempods TypeScript SDK v0.2.0 recipe
// examples/todo/pwa/register.tsx, licensed under Apache-2.0; see
// the LICENSE and NOTICE of the @sempods/app-sdk package. Changes: this header; the
// registration function moved to pwa.ts.
import { useEffect, useState } from 'react';
import { useSdkLocale } from '@sempods/app-sdk/react';

/**
 * Render beneath the app's actual locale provider so notices follow its language.
 * Keep it outside target/access gates: updates also matter while signed out.
 * Announces a downloaded version. It applies once every window of the app is
 * closed, so an update never reloads a page over unsaved drafts or unconfirmed
 * writes. App-owned recipe, not an SDK export.
 */
export function NewVersionNotice({
  registration,
}: {
  readonly registration: Promise<ServiceWorkerRegistration | undefined>;
}) {
  const [ready, setReady] = useState(false);
  const { language } = useSdkLocale();
  useEffect(() => {
    let active = true;
    let stop = () => {};
    void registration.then((r) => {
      if (!r || !active) return;
      // Only an update of a controlled page is news; a first install is not.
      const check = () => {
        if (active && r.waiting && navigator.serviceWorker.controller)
          setReady(true);
      };
      // Follow a worker that was already installing before this subscription
      // (updatefound fired earlier) as well as every later one.
      const watched = new Set<ServiceWorker>();
      const watch = (worker: ServiceWorker | null) => {
        if (!worker || watched.has(worker)) return;
        watched.add(worker);
        worker.addEventListener('statechange', check);
      };
      const found = () => watch(r.installing);
      r.addEventListener('updatefound', found);
      watch(r.installing);
      stop = () => {
        r.removeEventListener('updatefound', found);
        for (const worker of watched)
          worker.removeEventListener('statechange', check);
      };
      check();
    });
    return () => {
      active = false;
      stop();
    };
  }, [registration]);
  if (!ready) return null;
  return (
    <p role="status">
      {language === 'de'
        ? 'Eine neue Version ist bereit. Sie wird verwendet, sobald alle Fenster dieser App geschlossen sind.'
        : 'A new version is ready. It is used once every window of this app has been closed.'}
    </p>
  );
}
