import { useMemo, useState } from 'react';
import { createBrowserRuntime } from '@sempods/app-sdk';
import {
  AccessNotice,
  AppAccess,
  LoadNotice,
  RemoveButton,
  ResourceEditor,
  SempodsProvider,
  TargetScreen,
  UnresolvedNotices,
  UpdateNotice,
  useAppState,
  useCreation,
  useFieldUpdate,
  useList,
  useMessages,
  useResourceEditor,
  useSdkLocale,
  useSelection,
  useWorkflowAccess,
  type FieldUpdateRow,
} from '@sempods/app-sdk/react';
import { kit } from '@sempods-spike/ui-aria';
import { Button } from '@sempods-spike/ui-aria/ui/button';
import { Input } from '@sempods-spike/ui-aria/ui/input';
import { Textarea } from '@sempods-spike/ui-aria/ui/textarea';
import { PlusIcon } from 'lucide-react';
import { bodyValue, emptyNote, noteFields, type Note } from './notes.ts';
import { language, locale, texts } from './texts.ts';

// One runtime for the app's lifetime, created outside rendering.
const runtime = createBrowserRuntime({
  identity: { kind: 'dynamic', name: 'Notes', redirectUri: location.origin + '/callback' },
  returnTo: '/',
  development: 'loopback-http',
});
document.documentElement.lang = language;

export default function App() {
  return (
    <SempodsProvider runtime={runtime} language={language} locale={locale}>
      <Frame />
    </SempodsProvider>
  );
}

// The app owns its layout: a header with the app's name and a menu whose
// "Pods & sharing" opens AppAccess as a dialog; AppAccess beside the content
// for sign-in and recovery.
function Frame() {
  const [managing, setManaging] = useState(false);
  const { connections } = useAppState();
  const { messages } = useSdkLocale();
  const t = useMessages(texts);
  const header = connections.length > 0;
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pt-4 sm:px-6">
      {header && (
        <header className="flex items-center justify-between gap-2 pb-4">
          <h1 className="text-lg font-semibold tracking-tight">{t.appName}</h1>
          <kit.HeaderMenu
            label={t.menu}
            items={[{ label: messages.controls.dataAccess, onSelect: () => setManaging(true) }]}
          />
        </header>
      )}
      <AppAccess
        appName={t.appName}
        description={t.description}
        headingLevel={header ? 2 : 1}
        open={managing}
        onClose={() => setManaging(false)}
      />
      <AccessNotice only="write" />
      <TargetScreen>
        <NotesScreen />
      </TargetScreen>
    </main>
  );
}

/**
 * The notes of the chosen Context: a calm list sorted by title, a dialog to
 * read or edit one, and a dialog to write a new one. A Context the person can
 * only read shows the notes without add, edit or delete.
 */
function NotesScreen() {
  const t = useMessages(texts);
  const { messages, locale } = useSdkLocale();
  const access = useWorkflowAccess();
  const list = useList(noteFields);
  // One hook for the list; each row gets its part with `mutate.for(item)`.
  const mutate = useFieldUpdate(noteFields);
  const creation = useCreation(noteFields, { initial: emptyNote, collection: 'notes' });
  const { selected, select } = useSelection();
  const editor = useResourceEditor(selected, noteFields);
  // The new-note dialog. Closing it keeps the unsent draft for later.
  const [adding, setAdding] = useState(false);

  const items = list.data?.items;
  const sorted = useMemo(() => {
    if (!items) return undefined;
    const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
    return [...items].sort((a, b) => collator.compare(a.data.title, b.data.title));
  }, [items, locale]);
  const shown = items?.find((item) => item.iri === selected);
  const hasDraft = creation.draft.title !== '' || creation.draft.body !== null;
  // Read-only Contexts show the note as text. An editor with unsaved work or
  // an open comparison stays, so a draft is never hidden by an access change.
  const reading = !access.write && shown && !editor?.state.dirty && !editor?.state.review;

  async function add() {
    const outcome = await creation.create();
    // A confirmed note appears in the list; anything else stays here with its notice.
    if (outcome.kind === 'created') setAdding(false);
  }

  return (
    <section aria-label={t.notes} className="flex flex-1 flex-col">
      <LoadNotice {...list} />
      {list.data && list.data.items.length === 0 && list.data.skipped === 0 && (
        <p className="py-12 text-center text-muted-foreground">{access.write ? t.empty : t.emptyReadOnly}</p>
      )}
      {sorted && sorted.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {sorted.map((item) => (
            <NoteRow
              key={item.iri}
              row={mutate.for(item)}
              canWrite={access.write}
              onOpen={() => void select(item.iri)}
            />
          ))}
        </ul>
      )}
      {/* An unresolved save or delete whose note left the list keeps its recovery. */}
      <UnresolvedNotices of={mutate} shown={items} />
      {/* A new note whose outcome is open stays visible after its dialog closed. */}
      {!adding && <UpdateNotice {...creation.notice} quiet />}

      {access.write && (
        <div className="sticky bottom-0 mt-auto flex justify-center bg-linear-to-t from-background from-70% to-transparent pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <kit.Button variant="primary" onPress={() => setAdding(true)}>
            <PlusIcon aria-hidden="true" />
            {hasDraft ? t.continueNote : t.newNote}
          </kit.Button>
        </div>
      )}

      <kit.ScreenDialog title={t.note} closeLabel={t.close} open={selected !== null} onRequestClose={() => void select(null)}>
        {reading ? (
          <article className="flex flex-col gap-3">
            <p className="text-xl font-semibold break-words">{shown.data.title}</p>
            {shown.data.body && <p className="leading-relaxed break-words whitespace-pre-wrap">{shown.data.body}</p>}
          </article>
        ) : (
          // Save, Cancel and Delete (which asks first) come from the SDK; a
          // confirmed save or delete closes the dialog.
          <ResourceEditor editor={editor} quiet onClose={() => select(null)} labels={{ title: t.title, body: t.body }}>
            {(draft, change) => <NoteInputs draft={draft} change={change} />}
          </ResourceEditor>
        )}
      </kit.ScreenDialog>

      <kit.ScreenDialog title={t.newNote} closeLabel={t.close} open={adding} onRequestClose={() => setAdding(false)}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <NoteInputs draft={creation.draft} change={creation.change} disabled={!creation.canEdit} autoFocus />
          <UpdateNotice {...creation.notice} quiet />
          <div className="flex justify-end">
            <Button type="submit" className="h-11 rounded-full px-6 text-base" isDisabled={!creation.canCreate}>
              {messages.controls.save}
            </Button>
          </div>
        </form>
      </kit.ScreenDialog>
    </section>
  );
}

/**
 * One note in the list: its title and the start of its text open it; the
 * trash button deletes it after asking. A problem with it shows right here.
 */
function NoteRow({
  row,
  canWrite,
  onOpen,
}: {
  readonly row: FieldUpdateRow<Note>;
  readonly canWrite: boolean;
  readonly onOpen: () => void;
}) {
  const { remove } = useSdkLocale().messages.controls;
  const note = row.data;
  return (
    <li className="py-1">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          className="h-auto min-h-14 min-w-0 flex-1 flex-col items-start justify-center gap-0.5 rounded-lg px-3 py-2.5 text-left font-normal whitespace-normal"
          onPress={onOpen}
        >
          <span className="w-full truncate text-base font-medium">{note.title}</span>
          {note.body && <span className="line-clamp-2 w-full text-sm text-muted-foreground">{note.body}</span>}
        </Button>
        {canWrite && (
          <RemoveButton label={`${remove}: ${note.title}`} disabled={!row.canMutate} onRemove={row.remove} />
        )}
      </div>
      <UpdateNotice {...row.notice} quiet />
    </li>
  );
}

/** The title and text fields, for a new note and for editing one. */
function NoteInputs({
  draft,
  change,
  disabled = false,
  autoFocus = false,
}: {
  readonly draft: Note;
  readonly change: (values: Partial<Note>) => void;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
}) {
  const t = useMessages(texts);
  return (
    <div className="flex flex-col gap-4">
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">{t.title}</span>
        <Input
          className="h-11 text-base md:text-base"
          value={draft.title}
          placeholder={t.titlePlaceholder}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(event) => change({ title: event.target.value })}
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">{t.body}</span>
        <Textarea
          className="min-h-48 text-base leading-relaxed md:text-base"
          value={draft.body ?? ''}
          placeholder={t.bodyPlaceholder}
          disabled={disabled}
          onChange={(event) => change({ body: bodyValue(event.target.value) })}
        />
      </label>
    </div>
  );
}
