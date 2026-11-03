// An example, not mounted: a collection of notes as cards, built with the
// SDK and the UI kit (@sempods/app-ui). For a collection app, copy it next to
// App.tsx, change its import of '../places.ts' to './places.ts', render
// <CollectionScreen nav={nav} /> in place of <Start />, declare the item
// address in apps.json (`"resources": ["items/:id"]`) and run
// pnpm run regenerate; then rename the type, fields, collection, address and
// texts to the app's own. Keep App.tsx's runtime, provider and frame.
import { useEffect, useRef } from 'react';
import {
  LoadNotice,
  RemoveButton,
  ResourceEditor,
  UnresolvedNotices,
  UpdateNotice,
  useAppState,
  useContextEditor,
  useCreation,
  useFieldUpdate,
  useList,
  useMessages,
  useSdkLocale,
  useWorkflowAccess,
} from '@sempods/app-sdk/react';
import { fields, text } from '@sempods/client-sdk/edit';
import {
  ActionButton,
  Input,
  ScreenDialog,
  Textarea,
  type Nav,
} from '@sempods/app-ui';
import { PlusIcon } from 'lucide-react';
import type { Place } from '../places.ts';

const schema = 'https://schema.org/';

/** What one card is: a title and an optional text. */
const note = fields(
  {
    name: text(`${schema}name`, { language: null, trim: true }),
    text: text(`${schema}text`, { language: null, trim: true, optional: true }),
  },
  { type: `${schema}NoteDigitalDocument` },
);

// In an app these belong in src/texts.ts.
const en = {
  empty: 'No notes yet. Give the first one a title above.',
  emptyReadOnly: 'No notes in this collection.',
  remove: (name: string) => `Delete: ${name}`,
  edit: 'Edit note',
  name: 'Title',
  text: 'Text',
  newNote: 'Title of a new note',
  add: 'Add note',
};
const collectionTexts: { readonly en: typeof en; readonly de: typeof en } = {
  en,
  de: {
    empty: 'Noch keine Notizen. Gib der ersten oben einen Titel.',
    emptyReadOnly: 'Keine Notizen in dieser Sammlung.',
    remove: (name) => `Löschen: ${name}`,
    edit: 'Notiz bearbeiten',
    name: 'Titel',
    text: 'Text',
    newNote: 'Titel einer neuen Notiz',
    add: 'Notiz hinzufügen',
  },
};

export function CollectionScreen({ nav }: { readonly nav: Nav<Place> }) {
  const t = useMessages(collectionTexts);
  // A collection that can only be read gets no input and no invitation to add.
  const { write } = useWorkflowAccess();
  const { view } = useAppState();
  const list = useList(note);
  const items = list.data?.items;
  const mutate = useFieldUpdate(note);
  const creation = useCreation(note, {
    initial: { name: '', text: null },
    collection: 'notes',
  });
  const input = useRef<HTMLInputElement>(null);
  if (!view) return null;
  const { place } = nav;
  // A link names the Context the collection reads, so the address keeps it.
  const notePlace = (subject: string): Place => ({
    kind: 'item',
    subject,
    context: view.contextIri,
  });

  return (
    <div className="mt-4 grid gap-4">
      {write && (
        // The primary action above the cards: a title is enough to start a
        // note; its text follows in the note's dialog.
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            input.current?.focus();
            if (creation.canCreate) void creation.create();
          }}
        >
          {/* Focus and pending typing as in ListScreen.tsx: not readOnly,
              which closes a phone's keyboard. */}
          <Input
            ref={input}
            className="h-11 flex-1"
            aria-label={t.newNote}
            placeholder={t.newNote}
            value={creation.draft.name}
            disabled={!creation.canEdit && !creation.busy}
            onChange={(event) => {
              if (!creation.busy) creation.change({ name: event.target.value });
            }}
          />
          <ActionButton
            type="submit"
            shape="round-sm"
            label={t.add}
            isDisabled={!creation.canCreate}
            preventFocusOnPress
          >
            <PlusIcon />
          </ActionButton>
        </form>
      )}
      <UpdateNotice {...creation.notice} quiet />
      <LoadNotice {...list} />
      {(list.state.kind === 'ready' || list.state.kind === 'loading') &&
        items?.length === 0 &&
        list.data?.skipped === 0 && (
          <p className="py-6 text-muted-foreground">
            {write ? t.empty : t.emptyReadOnly}
          </p>
        )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {items?.map((entry) => {
          const card = mutate.for(entry);
          return (
            <li
              key={entry.iri}
              className="flex min-h-28 flex-col rounded-xl border bg-card text-card-foreground"
            >
              {/* The note's own address: a plain click opens its dialog. */}
              <a
                {...nav.link(notePlace(entry.iri))}
                className="grid flex-1 content-start gap-1 rounded-t-xl p-4 hover:bg-muted"
              >
                <span className="font-medium">{card.data.name}</span>
                {card.data.text && (
                  <span className="line-clamp-3 text-sm text-muted-foreground">
                    {card.data.text}
                  </span>
                )}
              </a>
              <div className="flex items-center justify-end gap-1 px-2 pb-2">
                <UpdateNotice {...card.notice} quiet />
                <RemoveButton
                  disabled={!card.canMutate}
                  onRemove={card.remove}
                  label={t.remove(card.data.name)}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <UnresolvedNotices of={mutate} shown={items} />
      <NoteDialog
        subject={place.kind === 'item' ? place.subject : null}
        context={(place.kind === 'item' && place.context) || view.contextIri}
        texts={t}
        leave={() => {
          nav.close({ kind: 'start' });
          void list.reload();
        }}
      />
    </div>
  );
}

/**
 * The note's screen: a dialog that follows the address, with the SDK's
 * editor for the Context the address names. Escape, Close and a press beside
 * it ask before an unsaved edit is discarded; Back does too.
 */
function NoteDialog({
  subject,
  context,
  texts,
  leave,
}: {
  readonly subject: string | null;
  readonly context: string;
  readonly texts: typeof en;
  readonly leave: () => void;
}) {
  const { messages } = useSdkLocale();
  const edit = useContextEditor(note);
  const { open, close } = edit;
  const { changing } = useAppState();
  useEffect(() => {
    if (changing) return;
    if (subject) void open({ subject, context });
    else void close();
  }, [subject, context, changing, open, close]);
  const editor =
    subject &&
    edit.target?.subject === subject &&
    edit.target.context === context
      ? edit.editor
      : null;
  const requestClose = async () => {
    if (await edit.close()) leave();
  };
  return (
    <ScreenDialog
      title={texts.edit}
      open={subject !== null}
      onRequestClose={() => void requestClose()}
    >
      {edit.phase === 'unavailable' && edit.problem ? (
        <p role="alert">{messages.contextProblems?.[edit.problem]}</p>
      ) : (
        <ResourceEditor
          editor={editor}
          quiet
          onClose={() => void requestClose()}
          labels={{ name: texts.name, text: texts.text }}
        >
          {(draft, change) => (
            <div className="grid gap-4">
              <label className="grid gap-1.5">
                {texts.name}
                <Input
                  value={draft.name}
                  onChange={(event) =>
                    change({ ...draft, name: event.target.value })
                  }
                  required
                />
              </label>
              <label className="grid gap-1.5">
                {texts.text}
                <Textarea
                  className="min-h-40"
                  value={draft.text ?? ''}
                  onChange={(event) =>
                    change({ ...draft, text: event.target.value || null })
                  }
                />
              </label>
            </div>
          )}
        </ResourceEditor>
      )}
    </ScreenDialog>
  );
}
