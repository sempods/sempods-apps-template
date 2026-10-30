// A Focus-like app under /focus/ for the routing spike: Zen and List views,
// a task resource screen and its "Not today" action as addresses, the legacy
// query link and not-found pages. Identical for every router; the adapter is
// chosen at build time (@router, ROUTER=own|react-router|tanstack).
import { useEffect, useState } from 'react';
import { createBrowserRuntime } from '@sempods/app-sdk';
import {
  AppAccess,
  LoadNotice,
  ResourceEditor,
  SempodsProvider,
  TargetScreen,
  useAppState,
  useContextEditor,
  useList,
  useSdkLocale,
} from '@sempods/app-sdk/react';
import { kit } from '@sempods-spike/ui-aria';
import { taskFields } from '@spike/harness';
import { router } from '@router';
import { BASE, decodeSubject, encodeSubject, returnAddress, type Nav, type Place } from './places.ts';

declare const __ROUTER__: string;

const runtime = createBrowserRuntime({
  identity: { kind: 'dynamic', name: 'Focus routing', redirectUri: location.origin + BASE + 'callback' },
  // Sign-in returns to the place it started from, resource links included.
  returnTo: returnAddress,
  replaceUrl: router.replaceUrl,
  development: 'loopback-http',
});

export default function App() {
  return (
    <SempodsProvider runtime={runtime} language="en" locale="en-GB">
      <router.Root>
        <Frame />
      </router.Root>
    </SempodsProvider>
  );
}

function Frame() {
  const nav = router.useNav();
  const [managing, setManaging] = useState(false);
  const { connections } = useAppState();
  const { messages } = useSdkLocale();
  const view = nav.place.kind === 'view' ? nav.place.view : 'zen';
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-4">
      {connections.length > 0 && (
        <header className="flex items-center justify-between pb-4">
          <h1 className="text-lg font-semibold">
            Focus <small className="block text-xs font-normal text-muted-foreground" data-testid="router">{__ROUTER__}: {router.name}</small>
          </h1>
          <kit.HeaderMenu
            label="Menu"
            items={[
              {
                label: 'View',
                choices: [
                  { label: 'Zen', checked: view === 'zen', onSelect: () => nav.go({ kind: 'view', view: 'zen' }) },
                  { label: 'List', checked: view === 'list', onSelect: () => nav.go({ kind: 'view', view: 'list' }) },
                ],
              },
              null,
              { label: messages.controls.dataAccess, onSelect: () => setManaging(true) },
            ]}
          />
        </header>
      )}
      <AppAccess appName="Focus" description="Routing spike" headingLevel={connections.length ? 2 : 1} open={managing} onClose={() => setManaging(false)} />
      <TargetScreen>
        <Tasks nav={nav} view={view} />
      </TargetScreen>
      {nav.place.kind === 'not-found' && (
        <kit.ScreenDialog title="Not found" closeLabel="Close" open onRequestClose={() => nav.go({ kind: 'view', view: 'zen' }, { replace: true })}>
          <p data-testid="not-found">{nav.place.reason === 'invalid' ? 'This task link is not valid.' : 'This address does not lead anywhere in Focus.'}</p>
        </kit.ScreenDialog>
      )}
    </main>
  );
}

function Tasks({ nav, view }: { readonly nav: Nav; readonly view: 'zen' | 'list' }) {
  const list = useList(taskFields);
  const { view: target } = useAppState();
  const items = (list.data?.items ?? []).filter((item) => !item.data.done);
  const first = items[0];
  const taskPlace = (iri: string, action?: 'postpone'): Place => ({ kind: 'task', id: encodeSubject(iri), ...(action ? { action } : {}) });
  return (
    <>
      <LoadNotice {...list} />
      {view === 'list' ? (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.iri}>
              <a className="block py-3" {...nav.link(taskPlace(item.iri))}>{item.data.title}</a>
            </li>
          ))}
        </ul>
      ) : (
        first && (
          <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center" aria-label="Zen">
            <h2 className="text-3xl">
              <a className="zen-title" {...nav.link(taskPlace(first.iri))}>{first.data.title}</a>
            </h2>
            <kit.Button variant="secondary" onPress={() => nav.go(taskPlace(first.iri, 'postpone'))}>Not today</kit.Button>
          </section>
        )
      )}
      {target && <TaskScreen nav={nav} context={target.contextIri} />}
    </>
  );
}

/** The task's resource screen: open while the address names a task. */
function TaskScreen({ nav, context }: { readonly nav: Nav; readonly context: string }) {
  const place = nav.place.kind === 'task' ? nav.place : null;
  const subject = place ? decodeSubject(place.id) : null;
  const edit = useContextEditor(taskFields);
  const { open, close } = edit;
  const { changing } = useAppState();
  useEffect(() => {
    if (changing) return;
    if (subject) void open({ subject, context });
    else void close();
  }, [subject, context, changing, open, close]);
  const editor = subject && edit.target?.subject === subject ? edit.editor : null;
  // Guarded: the SDK asks before a dirty draft is discarded, then the
  // address goes back to the opener (or the start page on a direct entry).
  const leave = async () => {
    if (await edit.close()) nav.close();
  };
  return (
    <kit.ScreenDialog title={place?.action === 'postpone' ? 'Not today' : 'Details'} closeLabel="Close" open={!!place} onRequestClose={() => void leave()}>
      <ResourceEditor editor={editor} quiet onClose={() => void leave()} labels={{ title: 'Title' }}>
        {(draft, change) => (
          <label className="grid gap-1.5">
            Title
            <input value={draft.title} onChange={(e) => change({ ...draft, title: e.target.value })} />
          </label>
        )}
      </ResourceEditor>
    </kit.ScreenDialog>
  );
}
