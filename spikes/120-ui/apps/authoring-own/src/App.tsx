// Focus: Zen and List views, a task screen and its "Not today" action as
// addresses, the creation screen and not-found pages.
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
  useContexts,
  useList,
  useSdkLocale,
} from '@sempods/app-sdk/react';
import { kit } from '@sempods-spike/ui-aria';
import { taskFields } from '@spike/harness';
import { replaceUrl, useNav, type Nav } from './sempods/router.tsx';
import { BASE, decodeSubject, encodeSubject, places, returnAddress, type Place } from './places.ts';

const runtime = createBrowserRuntime({
  identity: { kind: 'dynamic', name: 'Focus', redirectUri: location.origin + BASE + 'callback' },
  // Sign-in returns to the address it started from.
  returnTo: returnAddress,
  replaceUrl,
  development: 'loopback-http',
});

const ZEN: Place = { kind: 'view', view: 'zen' };

export default function App() {
  return (
    <SempodsProvider runtime={runtime} language="en" locale="en-GB">
      <Frame />
    </SempodsProvider>
  );
}

function Frame() {
  const nav = useNav(places);
  const [managing, setManaging] = useState(false);
  const { connections } = useAppState();
  const { messages } = useSdkLocale();
  const view = nav.place.kind === 'view' ? nav.place.view : 'zen';
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-4">
      {connections.length > 0 && (
        <header className="flex items-center justify-between pb-4">
          <h1 className="text-lg font-semibold">Focus</h1>
          <kit.HeaderMenu
            label="Menu"
            items={[
              {
                label: 'View',
                choices: [
                  { label: 'Zen', checked: view === 'zen', onSelect: () => nav.go(ZEN) },
                  { label: 'List', checked: view === 'list', onSelect: () => nav.go({ kind: 'view', view: 'list' }) },
                ],
              },
              null,
              { label: messages.controls.dataAccess, onSelect: () => setManaging(true) },
            ]}
          />
        </header>
      )}
      <AppAccess appName="Focus" description="Tasks" headingLevel={connections.length ? 2 : 1} open={managing} onClose={() => setManaging(false)} />
      <TargetScreen>
        <Tasks nav={nav} view={view} />
      </TargetScreen>
      {/* Signed out, sign-in stays usable: the error shows once connected. */}
      {nav.place.kind === 'not-found' && connections.length > 0 && (
        <kit.ScreenDialog title="Not found" closeLabel="Close" open onRequestClose={() => nav.go(ZEN, { replace: true })}>
          <p data-testid="not-found">{nav.place.reason === 'invalid' ? 'This task link is not valid.' : 'This address does not lead anywhere in Focus.'}</p>
        </kit.ScreenDialog>
      )}
    </main>
  );
}

function Tasks({ nav, view }: { readonly nav: Nav<Place>; readonly view: 'zen' | 'list' }) {
  const list = useList(taskFields);
  const { view: target } = useAppState();
  const items = (list.data?.items ?? []).filter((item) => !item.data.done);
  const first = items[0];
  // Links name the task's source Context.
  const taskPlace = (iri: string, action?: 'postpone'): Place => ({
    kind: 'task',
    id: encodeSubject(iri),
    ...(target ? { context: target.contextIri } : {}),
    ...(action ? { action } : {}),
  });
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
      {target && <TaskScreen nav={nav} selected={target.contextIri} />}
      {nav.place.kind === 'new' && (
        <kit.ScreenDialog title="New task" closeLabel="Close" open onRequestClose={() => nav.close(ZEN)}>
          <p data-testid="new-task">A new task would be written here.</p>
        </kit.ScreenDialog>
      )}
    </>
  );
}

/**
 * The task screen, open while the address names a task. It edits the source
 * Context the address names; only an address without one uses the selected
 * Context. A named source the person cannot read is an explicit error.
 */
function TaskScreen({ nav, selected }: { readonly nav: Nav<Place>; readonly selected: string }) {
  const place = nav.place.kind === 'task' ? nav.place : null;
  const contexts = useContexts();
  const readable = !place?.context || contexts.contexts.some((c) => c.iri === place.context);
  const context = place?.context ?? selected;
  const subject = place && readable ? decodeSubject(place.id) : null;
  const edit = useContextEditor(taskFields);
  const { open, close } = edit;
  const { changing } = useAppState();
  useEffect(() => {
    if (changing) return;
    if (subject) void open({ subject, context });
    else void close();
  }, [subject, context, changing, open, close]);
  const editor = subject && edit.target?.subject === subject && edit.target?.context === context ? edit.editor : null;
  // The SDK asks before a dirty draft is discarded; then the screen closes.
  const leave = async () => {
    if (!readable || (await edit.close())) nav.close(ZEN);
  };
  return (
    <kit.ScreenDialog title={place?.action === 'postpone' ? 'Not today' : 'Details'} closeLabel="Close" open={!!place} onRequestClose={() => void leave()}>
      <p className="text-sm text-muted-foreground" data-testid="source">{context.split('/').pop()}</p>
      {!readable && <p role="alert" data-testid="source-missing">The source of this task is not available to you.</p>}
      {readable && <ResourceEditor editor={editor} quiet onClose={() => void leave()} labels={{ title: 'Title' }}>
        {(draft, change) => (
          <label className="grid gap-1.5">
            Title
            <input value={draft.title} onChange={(e) => change({ ...draft, title: e.target.value })} />
          </label>
        )}
      </ResourceEditor>}
    </kit.ScreenDialog>
  );
}
