// Focus: Zen and List views, a task screen and its "Not today" action as
// routes, the creation screen and not-found pages.
import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, RouterProvider, useMatch, useNavigate, useParams, useSearchParams } from 'react-router';
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
import { BASE, createAppRouter, useClose } from './sempods/router.tsx';
import { decodeSubject, returnAddress, taskPath, validContext } from './addresses.ts';

const { router, replaceUrl } = createAppRouter([
  {
    element: <Frame />,
    children: [
      { index: true, element: <Start /> },
      { path: 'list', element: null },
      { path: 'tasks/add', element: <NewTask /> },
      // Legacy creation address.
      { path: 'tasks/new', element: <Navigate to="/tasks/add" replace /> },
      { path: 'tasks/:id', element: <TaskScreen /> },
      { path: 'tasks/:id/postpone', element: <TaskScreen action="postpone" /> },
      { path: 'tasks/*', element: <NotFound reason="invalid" /> },
      { path: 'callback', element: null },
      { path: '*', element: <NotFound reason="unknown" /> },
    ],
  },
]);

const runtime = createBrowserRuntime({
  identity: { kind: 'dynamic', name: 'Focus', redirectUri: location.origin + BASE + 'callback' },
  // Sign-in returns to the address it started from.
  returnTo: returnAddress,
  replaceUrl,
  development: 'loopback-http',
});

export default function App() {
  return (
    <SempodsProvider runtime={runtime} language="en" locale="en-GB">
      <RouterProvider router={router} />
    </SempodsProvider>
  );
}

function Frame() {
  const navigate = useNavigate();
  const view = useMatch('/list') ? 'list' : 'zen';
  const [managing, setManaging] = useState(false);
  const { connections } = useAppState();
  const { messages } = useSdkLocale();
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
                  { label: 'Zen', checked: view === 'zen', onSelect: () => void navigate('/') },
                  { label: 'List', checked: view === 'list', onSelect: () => void navigate('/list') },
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
        <Tasks view={view} />
        {/* The screens of the current route, over the overview. */}
        <Outlet />
      </TargetScreen>
    </main>
  );
}

function Tasks({ view }: { readonly view: 'zen' | 'list' }) {
  const navigate = useNavigate();
  const list = useList(taskFields);
  const { view: target } = useAppState();
  const items = (list.data?.items ?? []).filter((item) => !item.data.done);
  const first = items[0];
  // Links name the task's source Context.
  const context = target?.contextIri;
  return (
    <>
      <LoadNotice {...list} />
      {view === 'list' ? (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.iri}>
              <Link className="block py-3" to={taskPath(item.iri, context)}>{item.data.title}</Link>
            </li>
          ))}
        </ul>
      ) : (
        first && (
          <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center" aria-label="Zen">
            <h2 className="text-3xl">
              <Link className="zen-title" to={taskPath(first.iri, context)}>{first.data.title}</Link>
            </h2>
            <kit.Button variant="secondary" onPress={() => void navigate(taskPath(first.iri, context, 'postpone'))}>Not today</kit.Button>
          </section>
        )
      )}
    </>
  );
}

/** The start page; the legacy link `?task=<id>` becomes the task's address. */
function Start() {
  const [query] = useSearchParams();
  const legacy = query.get('task');
  if (legacy === null) return null;
  const context = query.get('context');
  if (!decodeSubject(legacy) || !validContext(context)) return <NotFound reason="invalid" />;
  return <Navigate replace to={`/tasks/${legacy}${context ? '?context=' + encodeURIComponent(context) : ''}`} />;
}

function NewTask() {
  const close = useClose('/');
  return (
    <kit.ScreenDialog title="New task" closeLabel="Close" open onRequestClose={close}>
      <p data-testid="new-task">A new task would be written here.</p>
    </kit.ScreenDialog>
  );
}

function NotFound({ reason }: { readonly reason: 'unknown' | 'invalid' }) {
  const navigate = useNavigate();
  return (
    <kit.ScreenDialog title="Not found" closeLabel="Close" open onRequestClose={() => void navigate('/', { replace: true })}>
      <p data-testid="not-found">{reason === 'invalid' ? 'This task link is not valid.' : 'This address does not lead anywhere in Focus.'}</p>
    </kit.ScreenDialog>
  );
}

/**
 * The task screen. It edits the source Context the address names; only an
 * address without one uses the selected Context. A named source the person
 * cannot read is an explicit error.
 */
function TaskScreen({ action }: { readonly action?: 'postpone' }) {
  const { id = '' } = useParams();
  const [query] = useSearchParams();
  const named = query.get('context');
  const { view: target, changing } = useAppState();
  const contexts = useContexts();
  const close = useClose('/');
  const readable = !named || contexts.contexts.some((c) => c.iri === named);
  const context = named ?? target?.contextIri ?? '';
  const valid = !!decodeSubject(id) && validContext(named);
  const subject = valid && readable ? decodeSubject(id) : null;
  const edit = useContextEditor(taskFields);
  const { open, close: closeEditor } = edit;
  useEffect(() => {
    if (changing) return;
    if (subject) void open({ subject, context });
    else void closeEditor();
  }, [subject, context, changing, open, closeEditor]);
  if (!valid) return <NotFound reason="invalid" />;
  const editor = subject && edit.target?.subject === subject && edit.target?.context === context ? edit.editor : null;
  // The SDK asks before a dirty draft is discarded; then the screen closes.
  const leave = async () => {
    if (!readable || (await edit.close())) close();
  };
  return (
    <kit.ScreenDialog title={action === 'postpone' ? 'Not today' : 'Details'} closeLabel="Close" open onRequestClose={() => void leave()}>
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
