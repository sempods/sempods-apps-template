// Adapted from the sempods TypeScript SDK v0.9.0-dev.4 recipe
// examples/todo/pwa/register.tsx, licensed under Apache-2.0; see
// the LICENSE and NOTICE of the @sempods/app-sdk package. Changes: this header; the
// registration function moved to pwa.ts; the text comes from texts.ts.
import { useEffect, useState } from 'react';
import { useMessages, useNotice } from '@sempods/app-sdk/react';
import { texts } from './texts.ts';

/**
 * Render beneath the app's actual locale provider so notices follow its language,
 * and beside the SDK's `Notices` host, which shows it outside the page's flow.
 * Keep it outside target/access gates: updates also matter while signed out,
 * and the host shows it inside the sign-in gate then. Announces a downloaded
 * version once. It applies once every window of the app is
 * closed, so an update never reloads a page over unsaved drafts or unconfirmed
 * writes. App-owned recipe, not an SDK export.
 */
export function NewVersionNotice({
  registration,
}: {
  readonly registration: Promise<ServiceWorkerRegistration | undefined>;
}) {
  const [ready, setReady] = useState(false);
  const t = useMessages(texts);
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
  // It stays until dismissed: the person did not ask for it and should
  // learn how the new version starts. A language change updates it in place.
  useNotice(
    ready
      ? { key: 'app-update', text: t.newVersion, duration: 'until-dismissed' }
      : null,
  );
  return null;
}
